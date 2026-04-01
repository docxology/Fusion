# Task: FN-679 - Persist worktree init and recycle settings

**Created:** 2026-04-01
**Size:** S

## Review Level: 2 (Plan and Code)

**Assessment:** This is a focused settings persistence regression with low-to-moderate blast radius. It touches core settings schema/plumbing and needs regression tests across core + CLI paths.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 2

## Mission

Fix the bug where `worktreeInitCommand` and `recycleWorktrees` are not reliably persisted and restored in project settings, ensuring these values survive update/read/restart flows and are correctly handled by CLI settings commands so worktree initialization and recycling behavior remains stable across runs.

## Dependencies

- **None**

## Context to Read First

- `packages/core/src/types.ts`
- `packages/core/src/store.ts`
- `packages/core/src/store.test.ts`
- `packages/cli/src/commands/settings.ts`
- `packages/cli/src/commands/settings.test.ts`
- `AGENTS.md` (settings + storage architecture sections)

## File Scope

- `packages/core/src/types.ts`
- `packages/core/src/store.ts`
- `packages/core/src/store.test.ts`
- `packages/cli/src/commands/settings.ts`
- `packages/cli/src/commands/settings.test.ts`

## Steps

### Step 0: Preflight

- [ ] Required files and paths exist
- [ ] Dependencies satisfied

### Step 1: Fix core settings schema + persistence plumbing

- [ ] Verify both keys are correctly defined and project-scoped in core settings schema/defaults/allowlists (`ProjectSettings`, `DEFAULT_PROJECT_SETTINGS`, and project key lists used by store merge/filter paths)
- [ ] Ensure `TaskStore.updateSettings()` and `TaskStore.getSettings()` preserve `worktreeInitCommand` and `recycleWorktrees` with no silent drops
- [ ] Ensure values survive fresh re-initialization (new store instance reading persisted config/database state)
- [ ] Add/adjust regression tests in `store.test.ts` covering update → read and restart persistence for both fields
- [ ] Run targeted tests for changed files

**Artifacts:**
- `packages/core/src/types.ts` (modified if needed)
- `packages/core/src/store.ts` (modified)
- `packages/core/src/store.test.ts` (modified)

### Step 2: Fix and validate CLI settings handling for both keys

- [ ] Ensure `settings set` accepts both keys via CLI validation/allowlist (`worktreeInitCommand`, `recycleWorktrees`)
- [ ] Ensure value parsing is correct: `recycleWorktrees` parses boolean inputs (`true/false/yes/no/1/0`) and rejects invalid values; `worktreeInitCommand` preserves provided string value exactly
- [ ] Add/adjust CLI tests asserting success-path update payloads and invalid-value rejection behavior for both keys
- [ ] Run targeted tests for changed files

**Artifacts:**
- `packages/cli/src/commands/settings.ts` (modified)
- `packages/cli/src/commands/settings.test.ts` (modified)

### Step 3: Testing & Verification

> ZERO test failures allowed. Full test suite as quality gate.

- [ ] Run full test suite: `pnpm test`
- [ ] Fix all failures
- [ ] Build passes: `pnpm build`

### Step 4: Documentation & Delivery

- [ ] Confirm storage-path assumptions are consistent with this codebase (`.fusion/*` for project data in this repo) and avoid introducing `.kb/*` path assumptions in code/comments for this fix
- [ ] Update relevant documentation
- [ ] Out-of-scope findings created as new tasks via `task_create` tool

## Documentation Requirements

**Must Update:**
- `AGENTS.md` — only if user-visible behavior/accepted values for `worktreeInitCommand` or `recycleWorktrees` changed

**Check If Affected:**
- `README.md` — update settings examples if these keys/values are documented incorrectly or omitted in relevant sections

## Completion Criteria

- [ ] All steps complete
- [ ] All tests passing
- [ ] Documentation updated

## Git Commit Convention

Commits at step boundaries. All commits include the task ID:

- **Step completion:** `feat(FN-679): complete Step N — description`
- **Bug fixes:** `fix(FN-679): description`
- **Tests:** `test(FN-679): description`

## Do NOT

- Expand task scope
- Skip tests
- Modify files outside the File Scope without good reason
- Implement settings behavior based on mixed storage roots; keep this task aligned with current repo conventions
- Commit without the task ID prefix