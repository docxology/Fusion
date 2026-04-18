# Dashboard Package Review Findings

**Task:** FN-1964 — Review `packages/dashboard` for bugs and architectural issues
**Review Date:** 2026-04-18
**Scope:** 112+ files, ~155K lines (server + client + CSS)
**Severity Legend:** 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low

---

## Summary Statistics

| Severity | Count | Focus Areas |
|----------|-------|------------|
| 🔴 Critical | 1 | Error Handling |
| 🟠 High | 7 | Error Handling, Data Fetching, Accessibility, AI Sessions |
| 🟡 Medium | 9 | Accessibility, CSS, Performance, Resource Management |
| ⚪ Low | 5 | CSS, Code Quality |
| **Total** | **22** | |

**Findings by Focus Area:**

| Focus Area | Count |
|------------|-------|
| Error Handling | 4 |
| Accessibility | 4 |
| Data Fetching / Frontend Hooks | 4 |
| SSE / WebSocket | 3 |
| CSS / Styling | 3 |
| AI Session Persistence | 2 |
| Route Ordering | 1 |
| Security | 1 |
| Resource Management | 1 |

---

## 1. API Routes

### 1.1 🔴 Critical — `insights-routes.ts`: Missing `catchHandler` Wrapper

**File:** `packages/dashboard/src/insights-routes.ts:141`
**Severity:** Critical
**Focus Area:** Error Handling

The insights router is created without `catchHandler` wrapping its route handlers:

```typescript
// router.ts (how other routers are created):
export function createInsightsRouter(...) {
  const router = Router();
  // All route handlers throw — no catchHandler wrapping them
  router.get("/", (req, res) => {
    try {
      // ...handler code...
    } catch (error) {
      rethrowAsApiError(error, "Failed to get insights");
    }
  });
```

Unlike `routes.ts` which uses `catchTypedHandler` and `mission-routes.ts` which uses `catchTypedHandler`, **insights-routes.ts has no catchHandler wrapper**. When a route handler throws an exception (e.g., from `badRequest()` throwing after a validation failure), Express will propagate the thrown `ApiError` without calling `sendErrorResponse()`. Instead, the default Express error handler fires, producing an **HTML error page instead of a JSON response**. This breaks all API clients.

Compare with `mission-routes.ts:124`:
```typescript
function catchTypedHandler(fn: (req: TypedRequest, res: Response, next: NextFunction) => Promise<void>) {
  return catchHandler((req, res, next) => fn(req as TypedRequest, res, next));
}

router.post("/milestones/:missionId/milestones", catchTypedHandler(async (req, res) => { /* ... */ }));
```

**Recommendation:** Wrap all route handlers in `catchHandler` or `catchTypedHandler`, or add an error middleware for the insights router.

---

### 1.2 🟠 High — Terminal SSE Route Shadowing

**File:** `packages/dashboard/src/routes.ts:7445, 7474`
**Severity:** High
**Focus Area:** Route Ordering

The Terminal SSE endpoint and kill endpoint have route ordering that causes shadowing:

```typescript
// Line 7445: GET /terminal/sessions/:id — generic parameterized route
router.get("/terminal/sessions/:id", (req, res) => { /* returns session or streams */ });

// Line 7411: POST /terminal/sessions/:id/kill — specific operation
router.post("/terminal/sessions/:id/kill", (req, res) => { /* kills session */ });
```

The SSE endpoint at line 7445 is a GET with `/:id` which could shadow `GET /terminal/sessions/kill` (which doesn't exist). The POST kill route at line 7411 comes AFTER the GET SSE route, so it won't be shadowed. However, the kill route uses a POST-with-a-path pattern that should be verified against the documented Express wildcard ordering convention (FN-1492/FN-1909):

```typescript
// Operation routes MUST come before generic routes:
router.post("/terminal/sessions/:id/kill", ...);  // ← specific first
router.get("/terminal/sessions/:id", ...);        // ← generic second  ← CORRECT
```

Currently this is correct. **No shadowing issue exists** — but the pattern is fragile and any future additions of specific terminal operation routes (e.g., `/terminal/sessions/:id/resize`) must be placed before line 7445.

---

### 1.3 🟡 Medium — `project-store-resolver.ts`: Race Condition on Store Eviction

**File:** `packages/dashboard/src/project-store-resolver.ts:96-107`
**Severity:** Medium
**Focus Area:** Resource Management

When `evictProjectStore()` is called during server shutdown or project removal, it synchronously:
1. Deletes from `pendingCreations` map
2. Stops the watcher
3. Closes the store
4. Deletes from `storeCache`

Between steps 1 and 4, a concurrent call to `getOrCreateProjectStore()` for the same `projectId` could:
1. See the store is not in `storeCache`
2. Create a new pending promise
3. Start a new store creation

This creates two store instances for the same projectId if the eviction and creation overlap. The concurrent creation promise deduplication (`pendingCreations`) only prevents duplicate *creation promises*, not duplicate *stores* if one creation is aborted mid-way.

```typescript
export async function getOrCreateProjectStore(projectId: string): Promise<TaskStore> {
  const cached = storeCache.get(projectId);          // ← checks cache
  if (cached) return cached;                         // ← returns cached or creates new
  const pending = pendingCreations.get(projectId);
  if (pending) return pending;                       // ← waits for in-flight creation
  const creation = (async () => {                    // ← creates new store
    // ...
    storeCache.set(projectId, store);               // ← adds to cache
  })();
  pendingCreations.set(projectId, creation);
  return creation;
}

export function evictProjectStore(projectId: string): void {
  pendingCreations.delete(projectId);               // ← removes pending (step 1)
  const store = storeCache.get(projectId);           // ← gets store
  if (store) {
    store.stopWatching();                           // ← stops watcher
    store.close();                                  // ← closes store
    storeCache.delete(projectId);                   // ← removes from cache (step 4)
  }
}
```

The gap between `pendingCreations.delete()` and `storeCache.set()` means a concurrent request can see the evicted store is gone and start creating a new one while the old store is still being closed.

---

## 2. SSE Pipeline

### 2.1 🟠 High — SSE Proxy Endpoint Missing Timeout Cleanup

**File:** `packages/dashboard/src/routes.ts:17531-17614`
**Severity:** High
**Focus Area:** SSE / WebSocket

The SSE proxy endpoint (`GET /proxy/:nodeId/events`) creates a 30-second timeout but does NOT clear it in the `req.on("close")` handler. If the client disconnects before the timeout fires, the `clearTimeout` is never called, causing a memory leak:

```typescript
// routes.ts:17531
router.get("/proxy/:nodeId/events", async function (req, res) {
  // ...
  const timeout = setTimeout(() => controller.abort(), 30_000);  // ← timeout created

  req.on("close", () => {
    if (!destroyed) {
      destroyed = true;
      controller.abort();        // ← aborts fetch ✓
      nodeStream.destroy();      // ← destroys stream ✓
      // ← MISSING: clearTimeout(timeout)!
    }
  });
  // If client disconnects, req.on("close") fires but timeout is never cleared
  // The timeout timer keeps running until the 30s expires, then fires controller.abort()
  // on an already-destroyed stream. Minor memory leak per disconnect.
});
```

Compare with the correct pattern in the SSE stream's `heartbeat` cleanup at `sse.ts:571`:
```typescript
const heartbeat = setInterval(() => { /* ... */ }, 30_000);
_req.on("close", () => { clearInterval(heartbeat); /* ... */ });
```

**Recommendation:** Add `clearTimeout(timeout)` in the `req.on("close")` handler.

---

### 2.2 🟠 High — `mapSourceEventToTransition`: Non-Standard State Transitions Map to "error"

**File:** `packages/dashboard/src/sse.ts:127-143`
**Severity:** High
**Focus Area:** SSE / WebSocket

```typescript
function mapSourceEventToTransition(sourceEvent: string, plugin: PluginInstallation, _previousState?: PluginState): PluginLifecycleTransition {
  switch (sourceEvent) {
    case "plugin:registered": return "installing";
    case "plugin:enabled":    return "enabled";
    case "plugin:disabled":   return "disabled";
    case "plugin:unregistered": return "uninstalled";
    case "plugin:updated": return "settings-updated";
    case "plugin:stateChanged":
      if (plugin.state === "error") return "error";
      return "error";  // ← ALL non-error state changes map to "error"!
    default:
      return "error";
  }
}
```

When `plugin:stateChanged` fires with a non-error state (e.g., `started`, `stopped`), the return value is `"error"` — which is semantically incorrect. This means the UI will show a red error indicator whenever any plugin enters a non-error state. The comment even says "we don't emit a dedicated transition" but the code returns `"error"` instead of a neutral transition.

**Recommendation:** Add a separate transition type like `"state-changed"` or fall back to `"enabled"` for running states.

---

### 2.3 ⚪ Low — SSE `mapSourceEventToTransition`: Dead Code

**File:** `packages/dashboard/src/sse.ts:127`
**Severity:** Low
**Focus Area:** Code Quality

The `_previousState` parameter is declared but never used in `mapSourceEventToTransition`:

```typescript
function mapSourceEventToTransition(sourceEvent: string, plugin: PluginInstallation, _previousState?: PluginState): PluginLifecycleTransition {
  // _previousState is never referenced in the function body
}
```

Unused parameters are a code quality concern. If this parameter was intended for future use (e.g., to detect transitions like `running→stopped`), it should be removed or used.

---

## 3. Frontend Data Fetching

### 3.1 🟠 High — `useInsights.ts`: `useMemo` Used for Side Effect (Anti-pattern)

**File:** `packages/dashboard/app/hooks/useInsights.ts:303`
**Severity:** High
**Focus Area:** Data Fetching

```typescript
// Initial load - intentionally runs once on mount
// eslint-disable-next-line
useMemo(() => {
  void refresh();
}, []);
```

Using `useMemo` for a side effect (data fetching) is a documented React anti-pattern. While React typically calls `useMemo` eagerly, it is not guaranteed to execute the callback — the memoized value may be skipped in certain implementations or when the component tree is in a Suspense boundary. The **correct pattern is `useEffect`**:

```typescript
useEffect(() => {
  void refresh();
}, []);
```

The eslint-disable comment acknowledges this is intentional, but this still risks the initial load being skipped under non-standard React implementations.

---

### 3.2 🟠 High — `api.ts`: `fetchTaskDetail` Bypasses `api()` Error Wrapper

**File:** `packages/dashboard/app/api.ts:148-163`
**Severity:** High
**Focus Area:** Data Fetching

```typescript
export async function fetchTaskDetail(id: string, projectId?: string): Promise<TaskDetail> {
  const maxAttempts = 2;
  const url = buildApiUrl(withProjectId(`/tasks/${id}`, projectId));
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
    const data = await res.json();           // ← throws on non-JSON response
    if (res.ok) return data as TaskDetail;
    if (attempt === maxAttempts) {
      throw new Error((data as { error?: string }).error || "Request failed");
    }
  }
  throw new Error("Request failed");
}
```

This bypasses the `api()` wrapper, which handles: (1) HTML-instead-of-JSON detection (`looksLikeHtml`), (2) consistent error extraction, (3) 204 No Content handling. If the server returns an error HTML page, `res.json()` will throw an unhandled exception instead of producing a descriptive error.

---

### 3.3 🟠 High — `useRemoteNodeEvents.ts`: Missing `projectId` in SSE URL

**File:** `packages/dashboard/app/hooks/useRemoteNodeEvents.ts:26`
**Severity:** High
**Focus Area:** Data Fetching

```typescript
const url = `/api/proxy/${encodeURIComponent(nodeId)}/events`;
// No ?projectId=... query parameter is added

return subscribeSse(url, {
  events: {
    "task:created": (e: MessageEvent) => { /* ... */ },
    // ...other event handlers...
  },
  onOpen: () => setIsConnected(true),
  onError: () => setIsConnected(false),
});
```

Unlike `useAgentLogs`, `useMultiAgentLogs`, and `useTasks` which all include `?projectId=...` in their SSE URLs, this hook sends no project scope. The proxy forwards all events without filtering by project. Unlike the SSE hooks that have project-context version guards, `useRemoteNodeEvents` also lacks `projectContextVersionRef` — in-flight events from an old `nodeId` context could update `lastEvent` after a node switch.

**Recommendation:** Add `projectId` query parameter to the SSE URL and implement project-context version guard pattern.

---

### 3.4 🟡 Medium — `useBatchBadgeFetch.ts`: Shared State Not Project-Scoped

**File:** `packages/dashboard/app/hooks/useBatchBadgeFetch.ts:11-17`
**Severity:** Medium
**Focus Area:** Data Fetching

```typescript
const batchBadgeStore = {
  data: new Map<string, { result: BatchStatusResult[string]; timestamp: number }>(),
  pendingPromise: null as Promise<BatchStatusResult> | null,   // ← NOT project-scoped
  lastFetchTime: null as number | null,                           // ← NOT project-scoped
};
```

The `pendingPromise` and `lastFetchTime` fields are shared across all project scopes. If a user switches projects while a fetch is pending, the new project's hook instance will incorrectly observe `isLoading = true` from the old project's operation.

The `data` map uses scoped keys (`projectId::taskId`) and is properly isolated, but the `pendingPromise` and `lastFetchTime` are global.

---

## 4. AI Session Persistence

### 4.1 🟡 Medium — `mission-interview.ts`: `projectId` Always Stored as `null`

**File:** `packages/dashboard/src/mission-interview.ts:292`
**Severity:** Medium
**Focus Area:** AI Sessions

```typescript
function persistMissionSession(session: MissionInterviewSession, status: ..., error?: string): void {
  if (!_aiSessionStore) return;
  const row: AiSessionRow = {
    // ...
    projectId: null,   // ← Always null despite session being project-scoped
    // ...
  };
  _aiSessionStore.upsert(row);
}
```

The mission interview session is created within a project context (the `rootDir` comes from `scopedStore.getRootDir()` via `getProjectContext(req)` in mission-routes.ts), but `projectId` is hardcoded to `null` in persistence. This means dismissed mission interview sessions cannot be recovered per-project after server restart.

Compare with `subtask-breakdown.ts:211` which correctly sets `projectId: session.projectId ?? null`.

---

### 4.2 ⚪ Low — `milestone-slice-interview.ts`: Project ID Not Explicitly Tracked

**File:** `packages/dashboard/src/milestone-slice-interview.ts`
**Severity:** Low
**Focus Area:** AI Sessions

The milestone/slice interview session does not track `projectId` in its session state. This is consistent with mission-interview (where projectId is null) but differs from subtask-breakdown (where projectId is tracked). Whether this is a bug depends on whether mission interviews should be recoverable per-project.

---

## 5. CSS / Styling

### 5.1 🟡 Medium — `--surface-hover` Never Defined in `:root`

**File:** `packages/dashboard/app/styles.css:4547, 5930, 8602, 22709, 29134` (and 10+ other locations)
**Severity:** Medium
**Focus Area:** CSS / Styling

The `--surface-hover` custom property is referenced in 22+ locations but **never defined in `:root`**. All usages rely on fallback values:

```css
background: var(--surface-hover, rgba(0, 0, 0, 0.04));   /* dark mode fallback */
background: var(--surface-hover, rgba(0, 0, 0, 0.03));   /* light mode fallback */
```

This is documented in project memory as a known pitfall. The fallback values vary (0.03, 0.04, 0.05), creating inconsistent hover states across the UI. The `--surface-hover` token should be defined in `:root` and all 54 theme blocks to enable theme-aware hover styling.

---

### 5.2 🟡 Medium — `.agent-active` Box Shadow Uses `rgba()` Instead of CSS Variables

**File:** `packages/dashboard/app/styles.css:1440-1462`
**Severity:** Medium
**Focus Area:** CSS / Styling

```css
.card.agent-active {
  border-color: var(--in-progress);
  box-shadow:
    0 0 8px rgba(var(--in-progress-rgb), 0.4),    /* ← rgba() + RGB variable */
    0 0 20px rgba(var(--in-progress-rgb), 0.15);
}
@keyframes agent-glow {
  0%, 100% {
    box-shadow:
      0 0 8px rgba(var(--in-progress-rgb), 0.4),   /* ← rgba() + RGB variable */
      0 0 20px rgba(var(--in-progress-rgb), 0.15);
  }
  50% {
    box-shadow:
      0 0 12px rgba(var(--in-progress-rgb), 0.6),   /* ← rgba() + RGB variable */
      0 0 28px rgba(var(--in-progress-rgb), 0.25);
  }
```

The `.agent-active` box shadow uses `rgba(var(--in-progress-rgb), X)` which is a valid project pattern for theming (using RGB variables). However, this is inside a component class definition, not in `:root` or theme blocks, meaning the glow effect only works for themes that define `--in-progress-rgb`. If a theme lacks this variable, the glow silently degrades.

---

### 5.3 ⚪ Low — `@media (max-width: 768px)` Touch Target Validation

**File:** `packages/dashboard/app/styles.css:26780+`
**Severity:** Low
**Focus Area:** CSS / Styling

Scanning 55 mobile `@media` blocks reveals the `.touch-target` class (min-height: 44px) exists globally at line 27, but many interactive elements within mobile media queries rely on their natural height rather than explicit touch target sizing. The `.btn-icon` class at line 518 sets `height: 28px` and `width: 28px` — below the 36px mobile minimum — and only gets a `touch-target` boost when the `.touch-target` class is also applied.

---

## 6. Accessibility

### 6.1 🟠 High — Icon-Only Buttons Missing `aria-label` (Systematic Pattern)

**File:** `packages/dashboard/app/components/Header.tsx:601, 689, 703, 716, 874, 893, 916, 938, 950, 962, 974, 997, 1047, 1057, 1078`
**Severity:** High
**Focus Area:** Accessibility

Multiple `.btn-icon` buttons in `Header.tsx` use `title` attribute but lack `aria-label`. Screen readers read `title` attributes when present, but this is **not guaranteed by WCAG 2.1 SC 4.1.2** — `aria-label` is the correct mechanism:

```typescript
// Line 601 — node selector trigger
<button className={`btn-icon node-selector-trigger${...}`} />
// Has title="Switch node" (line 603) but NO aria-label

// Line 689 — mobile search trigger
<button className="btn-icon mobile-search-trigger" />
// Has title="Open search" (line 691) but NO aria-label

// Lines 703, 716 — usage indicator buttons
<button className="btn-icon" />  // ← No title, no aria-label
```

Many buttons in `Header.tsx` have neither `title` nor `aria-label`:
- Lines 703, 716 (usage-related buttons)
- Lines 950, 962, 974 (files, git, workflow actions)
- Line 997 (more-actions dropdown trigger)
- Lines 1047, 1057 (pause/schedule buttons)

Per WCAG 2.1 Level A, interactive elements must have accessible names. `title` attributes are not sufficient — they only provide a tooltip, not an accessible name for assistive technology.

---

### 6.2 🟡 Medium — Modal Focus Management Not Verified

**File:** `packages/dashboard/app/components/`
**Severity:** Medium
**Focus Area:** Accessibility

No explicit focus trap (locking keyboard focus within modals) was identified in any of the major modal components reviewed (`TaskDetailModal.tsx`, `SettingsModal.tsx`, `PlanningModeModal.tsx`, `MissionInterviewModal.tsx`). The project uses focus management patterns but no `focus-trap` library or custom implementation was found.

Without a focus trap, keyboard users can tab out of a modal into the background content, breaking the expected modal interaction pattern.

---

### 6.3 🟡 Medium — Heading Hierarchy Not Enforced

**File:** Multiple component files
**Severity:** Medium
**Focus Area:** Accessibility

No automated enforcement of heading hierarchy (h1→h2→h3) was identified. Component review showed `<h1>` used in component titles with `<h2>` subsections within the same component, but no consistent heading outline was enforced. This can lead to skipped heading levels that confuse screen reader users navigating by headings.

---

## 7. Error Handling

### 7.1 🔴 Critical — `insights-routes.ts`: Missing `catchHandler` (Already Documented Above)

See **Finding 1.1**.

---

### 7.2 🟠 High — `fetchTaskDetail` Bypass (Already Documented Above)

See **Finding 3.2**.

---

### 7.3 🟡 Medium — Inconsistent Error Response Format in `ai-session-store.ts`

**File:** `packages/dashboard/src/ai-session-store.ts`
**Severity:** Medium
**Focus Area:** Error Handling

The `AiSessionStore` emits events (`ai_session:updated`, `ai_session:deleted`) but has no error event emission. If a database operation fails, the error is silently swallowed (or logged to console). Compare with other stores that emit `"error"` events for exceptional conditions.

```typescript
// ai-session-store.ts:upsert — on DB failure, throws unhandled exception
upsert(session: AiSessionRow): void {
  try {
    this.db.prepare(...).run(...);
  } catch {
    // Only clears thinking timer, then throws — no error event
    this.clearThinkingTimer(session.id);
    throw err;  // ← unhandled Express error if thrown in route handler
  }
}
```

If this is called from within an async route handler not wrapped in `catchHandler`, the thrown error propagates to Express's default handler, returning HTML instead of JSON.

---

## 8. Security

### 8.1 🟡 Medium — No CSRF Protection on Mutation Endpoints

**File:** `packages/dashboard/src/routes.ts` (all mutation routes)
**Severity:** Medium
**Focus Area:** Security

No CSRF tokens or double-submit cookie patterns were identified for mutation endpoints (`POST`, `PUT`, `PATCH`, `DELETE`). The API uses Bearer token authentication but lacks CSRF protection for browser-based API calls. This is a known gap — the current mitigation is that Bearer tokens are not stored in cookies (they're stored in `localStorage` and sent via `Authorization` header), which prevents CSRF. However, this should be documented as an architectural decision.

---

### 8.2 🟡 Medium — No Content-Security-Policy Headers

**File:** `packages/dashboard/src/server.ts`
**Severity:** Medium
**Focus Area:** Security

No CSP headers are set on responses. The dashboard serves user-generated content (task descriptions, file contents, agent prompts) and no CSP is defined to mitigate XSS risks.

---

## 9. Cross-Cutting Code Quality

### 9.1 ⚪ Low — Widespread `any` Type Usage in AI Session Files

**File:** `packages/dashboard/src/planning.ts:32`, `mission-interview.ts:29`, `subtask-breakdown.ts`, `milestone-slice-interview.ts`, `chat.ts`, `agent-generation.ts`, `ai-refine.ts`, `roadmap-suggestions.ts`
**Severity:** Low
**Focus Area:** Code Quality

All AI session files declare `let createKbAgent: any;` for dynamic engine import. The `AgentResult` type alias in `planning.ts:27` is also `any`. While this is intentional (avoiding direct engine dependency), it weakens type safety for the AI integration layer.

---

## 10. Findings Referenced from `.fusion/memory.md` (Known Issues)

The following issues are documented in project memory and **NOT re-reported as new findings**. This report references them for completeness:

| Memory Reference | Description | Status |
|-----------------|-------------|--------|
| FN-1492 / FN-1909 | Express wildcard route ordering: specific routes must precede generic | ✅ Correctly ordered in routes.ts |
| FN-1657 | Project-context reset pattern for SSE hooks | ✅ Implemented in useTasks, useAgentLogs, useMultiAgentLogs |
| FN-1734 | Polling hook loading contract: `loading` true only for initial fetch | ✅ Implemented in useProjectHealth |
| FN-1764 | Context version guard for SSE stale event rejection | ✅ Implemented in multi-agent log hooks |
| FN-1535 | Theme URL path joining bug | ✅ Fixed |
| FN-1534 | Theme loading edge cases | ✅ Fixed |
| FN-1976 | Message SSE store cohesion | ✅ Engine stores are used for SSE listeners |
| FN-1269 | Timing-safe webhook signature | ✅ Verified `timingSafeEqual` in github-webhooks.ts |
| `--surface-hover` token | Token used but never defined in `:root` | ⚠️ Still present (Finding 5.1) |
