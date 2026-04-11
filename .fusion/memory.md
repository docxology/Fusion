# Project Memory

<!-- This file stores durable project learnings. Agents consult and update it during triage and execution. -->

## Architecture

- `TaskExecutor` terminates active agent sessions (single and step) when tasks are moved away from `in-progress` via the `task:moved` event handler. This prevents zombie sessions when users manually send tasks back to todo/triage from the board UI.
- **Workflow Step Revision Loop**: Workflow steps can request implementation revisions via "REQUEST REVISION" output. The flow:
  1. Workflow step agent outputs "REQUEST REVISION\n\n[feedback]" to signal that code changes are needed
  2. `executeWorkflowStep()` detects this pattern and returns `WorkflowStepOutcome` with `revisionRequested: true`
  3. `runWorkflowSteps()` propagates the structured outcome with `WorkflowStepResult.revisionRequested`
  4. `handleWorkflowRevisionRequest()` injects revision instructions, resets steps to pending, and schedules fresh execution
  5. **Guard-unwind requirement**: The revision rerun MUST be scheduled after the current `execute()` guard clears
- **Review Handoff**: Agents can hand off tasks to users for human review via steering comments containing handoff phrases ("send it back to me", "hand off to user", etc.). When `reviewHandoffPolicy` is `"comment-triggered"`, the executor detects handoff intent and moves the task to in-review with `awaiting-user-review` status. The merger skips tasks with this status via `BLOCKING_TASK_STATUSES`.
- Agent preset templates in the UI are a UI-only concept, separate from the engine's `AgentPromptTemplate` type. `soul` and `instructionsText` are supported in `AgentCreateInput`/`AgentUpdateInput`.
- `CronRunner` uses dependency injection for AI prompt execution: an `AiPromptExecutor` function is injected via options, keeping it decoupled from `createKbAgent` and testable.
- `createAiPromptExecutor(cwd)` is an async factory that creates a new agent session per call, accumulates text via `onText`, and disposes sessions in `finally`. Uses lazy `import("./pi.js")` to avoid pulling the pi SDK into the module graph when AI execution isn't needed.
- `HeartbeatMonitor.executeHeartbeat()` uses the Paperclip wake→check→work→exit model. Lazy `import("./pi.js")` keeps pi SDK out of the module graph when only monitoring is needed.
- Dashboard SSE clients (planning/subtask/mission interview) use a shared keep-alive pattern: start a 25s `setInterval` in stream `onOpen` that `POST`s `/api/ai-sessions/:id/ping`, and always stop it on stream `close`, `complete`, and fatal errors.
- **Plugin System Architecture**: Built on three layers:
  1. `PluginStore` — SQLite-backed CRUD for plugin installations
  2. `PluginLoader` — Dynamic import, lifecycle management, dependency resolution (topological sort), hook invocation
  3. `PluginRunner` — Engine/runtime lifecycle integration, hook fanout, tool adaptation
- **PluginRunner Integration**: Lifecycle hooks with 5-second timeout and error isolation (failures logged but don't propagate). Task lifecycle hooks: `onTaskCreated`, `onTaskMoved`, `onTaskCompleted`. Agent hooks: `onAgentRunStart`, `onAgentRunEnd`. Tools prefixed with `plugin_` to avoid collision with built-in tools.
- **Peer Gossip Protocol**: Nodes exchange peer information via `POST /api/mesh/sync`. `PeerExchangeService` runs periodic sync cycles (default 60s) with all online remote nodes. Uses single-flight pattern to prevent overlapping syncs.

## Conventions

- When mocking function types with Vitest for the build (tsc), use `vi.fn().mockResolvedValue(x) as unknown as T` instead of `vi.fn<Parameters<T>, ReturnType<T>>()`. The generic syntax fails during `tsc` build.
- When mocking `AgentStore` for heartbeat execution tests, track `saveRun` calls in a local `Map` and have `getRunDetail` read from it — so `completeRun`'s saved state is reflected in the returned run.
- When `HeartbeatMonitorOptions` has optional fields, capture them in local `const` variables after the early-return validation check to avoid `Object is possibly 'undefined'` TypeScript errors in closures.
- For package-scoped single-file test runs, prefer `pnpm --filter <pkg> exec vitest run <file>` over `pnpm --filter <pkg> test -- <file>`.
- In dashboard task-creation forms, avoid special-casing built-in workflow template IDs in UI state; render from fetched `workflowSteps` IDs and let store-side template materialization resolve template IDs.
- When a package mixes Electron main-process `.ts` files with renderer `.tsx` files, use `moduleResolution: "bundler"` plus `lib: ["DOM", "DOM.Iterable"]` in tsconfig; Node16 resolution forces `.js` extensions and breaks renderer imports during `tsc`.
- For React component tests, call `cleanup()` in `afterEach` to avoid cross-test DOM leakage.
- When deprecating fields from `BoardConfig` but tests still poke private config methods, keep temporary compatibility fields non-enumerable in `readConfig()` so `writeConfig()` omits them from `config.json`.
- Checkout leasing is explicit: use `checkoutTask`/`releaseTask` for ownership, treat 409 conflicts as non-retryable contention, and let `HeartbeatMonitor.executeHeartbeat()` only validate `checkedOutBy` (never auto-acquire).
- The null-as-delete pattern for settings: In `TaskStore.updateSettings()`, `null` values are treated as "delete this key from settings". Allows frontend to explicitly clear a setting by sending `null`.
- `TaskStore.logEntry()`, `addComment()`, `addSteeringComment()`, `pauseTask()` accept an optional `RunMutationContext` parameter for audit trail correlation. Always pass it when the caller is an engine module.
- **Run-Audit Instrumentation**: Use `createRunAuditor()` from `run-audit.ts`. Each active run creates an `EngineRunContext` with `runId`, `agentId`, `taskId`, and `phase`. Use `generateSyntheticRunId()` for executor/merger synthetic IDs.
- **Write-through cache pattern**: When adding caching to a store, update cache in setter, return cached value in getter. Add `invalidateCache()` for testing and edge cases.
- **API wrapper tests**: Test functions that validate parameters synchronously with `expect(() => fn()).toThrow()` (not `rejects.toThrow()`).
- When adding new exports to `@fusion/engine`, update mocks in `packages/cli/src/commands/__tests__/dashboard.test.ts` AND `packages/cli/src/commands/__tests__/serve.test.ts`.
- When adding new CLI command exports, update BOTH `src/bin.test.ts` AND `src/__tests__/bin.test.ts` mocks.
- When changing API function signatures, add new params at the END to preserve backward compatibility.
- `HeartbeatMonitor.executeHeartbeat()` calls `startRun()` internally — do NOT call both for the same run.
- `vi.fn<Parameters<SomeType>, ReturnType<SomeType>>()` works in Vitest runtime but causes TypeScript build errors. Always use the cast pattern instead.
- SQLite `ORDER BY timestamp DESC` alone can be nondeterministic when multiple rows share the same millisecond; add a stable tiebreaker (e.g., `rowid DESC`).
- Test isolation with temp directories: Use `mkdtempSync(join(os.tmpdir(), 'fn-test-'))` and clean up in `afterEach`. Shared temp paths cause state leakage.

## Pitfalls

- When adding props to a React component interface that were previously declared but not destructured, remember to add them to the destructuring list too. TypeScript won't warn about unused interface fields.
- **Webhook HMAC testing**: Test the `verifyWebhookSignature` function directly using `await import()` rather than trying to set up raw body middleware through Express.
- Test `describe` blocks in Vitest can't access helper functions defined in sibling describe blocks. Place shared helpers in the parent scope.
- When extracting shared code from `executor.ts` (e.g., tool factories), move the parameter schemas to the shared module too.
- In UI static analysis tests, avoid regex that spans multiple lines. Use separate `toContain()` assertions instead.
- In large inline mock objects, duplicate property keys are only warned by esbuild and the last declaration silently wins.
- When using `import.meta.env` in `packages/dashboard/app/*`, ensure `tsconfig.app.json` includes `"vite/client"` in `compilerOptions.types`.
- In fresh worktrees, workspace dependency links can be stale enough that tests fail resolving `yaml` from `@fusion/core`; run `pnpm install` first.
- `pnpm test` at repo root runs dashboard's clean-checkout typecheck test; App-level TS issues may pass targeted Vitest runs but still fail the full suite.
- `--surface-hover` is used but never defined as a CSS custom property in the root or light theme blocks — it resolves to invalid/empty. Use fallbacks like `var(--surface-hover, rgba(0,0,0,0.03))`.
- When adding database schema migrations, increment `SCHEMA_VERSION` AND update hardcoded schema version assertions in test files. Missing updates cause test failures.

## Context

- **Background Memory Summarization (FN-1399)**: Three-layer architecture:
  1. `CronRunner.onScheduleRunProcessed` callback receives `(schedule, result)` after execution
  2. Schedule-specific filtering via `schedule.name === INSIGHT_EXTRACTION_SCHEDULE_NAME`
  3. Core processing in `processAndAuditInsightExtraction()` for parsing, merging, and audit
- **Startup ordering**: `syncInsightExtractionAutomation()` must run BEFORE `cronRunner.start()` to avoid stale config races.
- **Kimi/Moonshot API Usage**:
  - Primary endpoint: `/v1/coding_plan/usage` (underscore)
  - Fallback: `/v1/coding-plan/usage` (hyphen) — triggered by ANY 404
  - Auth errors (401/403): Short-circuit immediately, no fallback
  - Known 404 shapes: `{"code":5,"error":"url.not_found",...}` and `{"error":"url_not_found"}`
  - User-facing error: "Usage endpoint unavailable — Kimi coding plan may not be active"
  - Auth: `Authorization: Bearer <api_key>` header with `kimi-coding` key from `~/.pi/agent/auth.json`
- **Changesets configuration**: Internal packages with `private: true` must be listed in `.changeset/config.json` `ignore` array. Published: `@gsxdsm/fusion`. Private (must ignore): `@fusion/core`, `@fusion/dashboard`, `@fusion/engine`, `@fusion/tui`, `@fusion/plugin-sdk`, `@fusion-plugin-examples/*`
- **GitHub Actions Node.js**: All workflows must use `node-version: "24"` in `actions/checkout` and `pnpm/action-setup`. Node.js 20 actions are deprecated and stop working June 2, 2026.
- **Vite Alias for @fusion/core**: The dashboard's vite.config.ts maps `@fusion/core` to `../core/src/types.ts`. When adding new exports, re-export from `types.ts` to make them available, then run `pnpm --filter @fusion/core build`.
