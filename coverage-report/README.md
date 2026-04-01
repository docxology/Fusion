# Code Coverage Report

**Generated:** 2026-04-01 | **Task:** FN-689

This directory contains the results of a comprehensive code coverage analysis across all packages in the kb monorepo.

## How to Run Coverage

### All Packages

```bash
pnpm test:coverage
```

> ⚠️ **Engine package will OOM** when running with coverage. See [Known Issues](#known-issues).

### Individual Packages

```bash
pnpm test:coverage:core
pnpm test:coverage:engine    # Will likely OOM — see workaround below
pnpm test:coverage:cli
pnpm test:coverage:dashboard
```

### Engine Workaround

Run a subset of engine tests with coverage:

```bash
cd packages/engine
npx vitest run --coverage --coverage.reportOnFailure --maxWorkers=1 \
  src/concurrency.test.ts \
  src/worktree-names.test.ts \
  src/notifier.test.ts \
  src/logger.test.ts \
  src/agent-heartbeat.test.ts
```

### Generate Report with Test Failures

By default, vitest skips coverage output when tests fail. Use `--coverage.reportOnFailure` to generate reports even with failures:

```bash
cd packages/core
npx vitest run --coverage --coverage.reportOnFailure
```

### Coverage Output

Each package generates reports in its `coverage/` directory:
- `coverage/index.html` — Interactive HTML report (open in browser)
- `coverage/coverage-final.json` — Machine-readable JSON data
- Terminal output includes a text summary table

> Note: `coverage/` directories are in `.gitignore` and should not be committed.

## How to Read the Reports

### This Directory

| File | Description |
|------|-------------|
| `gaps.md` | Detailed analysis of all coverage gaps — untested files, low-coverage areas, and pre-existing test failures |
| `summary.json` | Machine-readable JSON with per-package metrics, untested file lists, and low-coverage file lists |
| `README.md` | This file — instructions and overview |

### HTML Reports

After running coverage, open `packages/<name>/coverage/index.html` in your browser for an interactive report showing:
- Per-file line/function/branch coverage
- Highlighted uncovered lines
- Sortable columns

### summary.json Structure

```json
{
  "generatedAt": "ISO timestamp",
  "packages": {
    "core": { "lineCoverage": 80.63, "functionCoverage": 91.26, ... },
    "engine": { "lineCoverage": 6.04, "note": "Partial — OOM" },
    "cli": { "lineCoverage": 36.17, ... },
    "dashboard": { "lineCoverage": 70.21, ... }
  },
  "overall": { "lineCoverage": X, ... },
  "untestedFiles": [ ... ],
  "lowCoverageFiles": [ ... ]
}
```

## Top 10 Files Needing Attention

| # | Package | File | Coverage | Issue |
|---|---------|------|----------|-------|
| 1 | dashboard | `src/mission-routes.ts` | 37% lines | 1,137-line API surface — mission endpoints |
| 2 | cli | `commands/task.ts` | 17% lines | Primary CLI interface (1,486 lines) |
| 3 | core | `agent-store.ts` | 0% | 597 lines with zero test coverage |
| 4 | dashboard | `src/terminal.ts` | 37% lines | Terminal service — 8/9 functions untested |
| 5 | dashboard | `src/server.ts` | 29% lines | Server initialization |
| 6 | engine | `ipc/ipc-host.ts` | 0% | IPC host — no tests exist |
| 7 | engine | `ipc/ipc-worker.ts` | 0% | IPC worker — no tests exist |
| 8 | cli | `project-resolver.ts` | 28% lines | Multi-project resolution (915 lines) |
| 9 | dashboard | `src/subtask-breakdown.ts` | 51% lines | AI subtask feature |
| 10 | dashboard | `NewTaskModal.tsx` | 47% / 13% funcs | Complex modal, many untested paths |

## Recommendations

### Immediate Actions (High Impact)

1. **Add tests for `core/agent-store.ts`** — This is a 597-line business logic module with zero tests. It manages agent state and is used across the engine.

2. **Improve CLI `commands/task.ts` coverage** — At 17% line coverage, the most-used CLI commands lack test assertions. Focus on `create`, `list`, `show`, `move`, and `archive` subcommands.

3. **Add tests for `dashboard/src/mission-routes.ts`** — The entire missions API (1,137 lines) has only 37% coverage. Route handlers need request/response testing.

4. **Fix engine OOM for coverage** — The engine package can't run coverage at all due to heap exhaustion. Investigate memory leaks in test setup/teardown (likely in executor or scheduler tests).

### Medium-Term

5. **Add IPC host/worker tests** — The multi-project IPC layer (`ipc-host.ts`, `ipc-worker.ts`) has no tests at all, which is risky for a communication protocol.

6. **Test CLI backup/settings commands** — `commands/backup.ts`, `commands/settings-export.ts`, `commands/settings-import.ts` have zero tests.

7. **Improve dashboard server coverage** — `server.ts` (29%), `terminal.ts` (37%), `planning.ts` (42%) all need more tests.

### Long-Term

8. **Fix pre-existing test failures** — 4 failures in core (db-migrate, store), 111 failures in CLI (many related to project resolution mocking).

9. **Dashboard component test coverage** — Several components (`NewTaskModal`, `SettingsModal`, `SetupWizardModal`) have tests but with significant gaps in function coverage.

10. **Set coverage thresholds** — Once coverage improves, enable vitest coverage thresholds to prevent regression:
    ```ts
    coverage: {
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
      }
    }
    ```

## Known Issues

### Engine OOM

Engine tests consistently crash with `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` when run with coverage, even with:
- `--max-old-space-size=8192`
- `--maxWorkers=1`
- `--fileParallelism=false`

This appears to be a pre-existing issue (OOM occurs even without coverage enabled). The v8 coverage provider's instrumentation adds significant memory overhead on top of an already memory-intensive test suite.

**Workaround:** Run small subsets of engine tests with coverage (5-7 files at a time).

### Pre-existing Test Failures

Some test failures exist in the codebase independent of coverage changes:
- Core: 4 failures in `db-migrate.test.ts` and `store.test.ts`
- CLI: Multiple failures related to project resolution
- See `gaps.md` for full details

## Coverage Configuration

Coverage is configured in each package's `vitest.config.ts`. By default, `enabled: false` to avoid slowing CI. Use `--coverage` flag or `pnpm test:coverage` to enable.

```ts
// packages/*/vitest.config.ts
coverage: {
  enabled: false,  // Enable via CLI flag
  reporter: ["text", "html", "json"],
  reportsDirectory: "./coverage",
  include: ["src/**/*.ts"],
  exclude: ["**/*.test.ts", "**/*.d.ts", "dist/**"],
}
```
