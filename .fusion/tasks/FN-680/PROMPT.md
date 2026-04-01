# Task: FN-680 - Commands settings not being persisted and restored

**Created:** 2026-04-01
**Size:** M

## Review Level: 2 (Plan and Code)

**Assessment:** This is a focused settings persistence bug but touches shared settings APIs and dashboard routes, so regressions could affect broader configuration behavior. The changes are reversible and low security risk.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Mission

Fix the regression where command-related project settings are not saved and reloaded correctly, ensuring users can configure command fields once and have them reliably persist across server restarts and settings reloads. This restores trust in the Settings UI and prevents runtime behavior from silently using stale/default command values.

## Dependencies

- **None**

## Context to Read First

- `packages/core/src/types.ts` (ProjectSettings fields: `worktreeInitCommand`, `testCommand`, `buildCommand`, `scripts`, `setupScript` and `PROJECT_SETTINGS_KEYS`)
- `packages/core/src/store.ts` (settings read/write and scope merge behavior)
- `packages/dashboard/src/routes.ts` (`PUT /api/settings`, `GET /api/settings`, settings scope handling)
- `packages/dashboard/src/routes.test.ts` (settings endpoint tests)
- `packages/dashboard/src/scripts-routes.routes.test.ts` (scripts persistence behavior, for overlap/consistency)

## File Scope

- `packages/core/src/store.ts`
- `packages/core/src/store.test.ts`
- `packages/dashboard/src/routes.ts`
- `packages/dashboard/src/routes.test.ts`
- `README.md`

## Steps

### Step 0: Preflight

- [ ] Required files and paths exist
- [ ] Dependencies satisfied

### Step 1: Reproduce and isolate command-settings persistence gap

- [ ] Add/adjust failing tests that demonstrate command settings (`worktreeInitCommand`, `testCommand`, `buildCommand`, and if applicable `setupScript`) are not persisted and/or restored correctly
- [ ] Verify failure occurs through the real settings flow (`PUT /api/settings` → store persistence → `GET /api/settings`)
- [ ] Confirm coverage includes reload/restore semantics (not only in-memory mutation)
- [ ] Run targeted tests for changed files

**Artifacts:**
- `packages/core/src/store.test.ts` (modified)
- `packages/dashboard/src/routes.test.ts` (modified)

### Step 2: Implement persistence and restoration fix for command settings

- [ ] Update settings persistence/merge logic so command fields are written to project settings and restored from persisted config without being dropped
- [ ] Ensure behavior is consistent with existing project-scope enforcement (global-only keys still rejected by `PUT /api/settings`)
- [ ] Keep existing scripts routes behavior intact and compatible with fixed settings flow
- [ ] Run targeted tests for changed files

**Artifacts:**
- `packages/core/src/store.ts` (modified)
- `packages/dashboard/src/routes.ts` (modified, only if needed)
- `packages/core/src/store.test.ts` (modified)
- `packages/dashboard/src/routes.test.ts` (modified)

### Step 3: Testing & Verification

> ZERO test failures allowed. Full test suite as quality gate.

- [ ] Run full test suite: `pnpm test`
- [ ] Fix all failures
- [ ] Build passes: `pnpm build`

### Step 4: Documentation & Delivery

- [ ] Update relevant documentation to explicitly list command-related project settings persistence behavior
- [ ] Out-of-scope findings created as new tasks via `task_create` tool

## Documentation Requirements

**Must Update:**
- `README.md` — clarify that project command settings (`worktreeInitCommand`, `testCommand`, `buildCommand`, and command scripts/setup script if applicable) are persisted in project config and restored on reload

**Check If Affected:**
- `AGENTS.md` — update only if implementation changes expected settings behavior beyond a bug fix

## Completion Criteria

- [ ] All steps complete
- [ ] All tests passing
- [ ] Documentation updated

## Git Commit Convention

Commits at step boundaries. All commits include the task ID:

- **Step completion:** `feat(FN-680): complete Step N — description`
- **Bug fixes:** `fix(FN-680): description`
- **Tests:** `test(FN-680): description`

## Do NOT

- Expand task scope beyond command/settings persistence and restoration
- Skip tests
- Modify files outside the File Scope without good reason
- Commit without the task ID prefix