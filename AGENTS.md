# Project Guidelines

## Finalizing Changes

When making changes that affect published packages, create a changeset file:

```bash
cat > .changeset/<short-description>.md << 'EOF'
---
"@gsxdsm/fusion": patch
---

Short description of the change.
EOF
```

Bump types:
- **patch**: bug fixes, internal changes
- **minor**: new features, new CLI commands, new tools
- **major**: breaking changes

Include the changeset file in the same commit as the code change. The filename should be a short kebab-case description (e.g., `fix-merge-conflict.md`, `add-retry-button.md`).

Only create changesets for changes that affect the published `@gsxdsm/fusion` package — user-facing features, bug fixes, CLI changes, tool changes. Do NOT create changesets for internal docs (AGENTS.md, README), CI config, or refactors that don't change behavior.

## Package Structure

- `@fusion/core` — domain model, task store (private, not published)
- `@fusion/dashboard` — web UI + API server (private, not published)
- `@fusion/engine` — AI agents: triage, executor, reviewer, merger, scheduler (private, not published)
- `@gsxdsm/fusion` — CLI + pi extension (published to npm)

Only `@gsxdsm/fusion` is published. The others are internal workspace packages.

## Storage Model

Fusion uses a hybrid storage architecture: structured metadata lives in SQLite (`.fusion/fusion.db`) while large blob files (PROMPT.md, agent.log, attachments) remain on the filesystem under `.fusion/tasks/{ID}/`. The database runs in WAL mode for concurrent access.

See [docs/storage.md](./docs/storage.md) for the full storage architecture documentation.

## Multi-Project Support

Fusion supports multiple projects with a central registry at `~/.pi/fusion/fusion-central.db`. Each project has its own SQLite database at `.fusion/fusion.db`. See [docs/multi-project.md](./docs/multi-project.md) for details on:
- CentralCore API and project registration
- Isolation modes (in-process, child-process)
- Global concurrency management

## Testing

```bash
pnpm test          # run all tests
pnpm build         # build all packages
```

Tests are required. Typechecks and manual verification are not substitutes for real tests with assertions.

## Port 4040 is Reserved

Port 4040 is the production dashboard port. A user's live dashboard session is typically running there. **Agents must NEVER:**
- Run `kill`, `kill -9`, `pkill`, or `killall` against processes on port 4040
- Start a test server on port 4040 — always use `--port 0` for random free port

## Engine Process Rules

The engine (`packages/engine`) runs the executor, merger, scheduler, IPC host, and dashboard-facing activity loop on a single Node event loop. **Blocking that loop stalls every task concurrently in-flight.**

### Never use `execSync` for User-Configured Commands

`execSync` blocks the entire event loop until the child process exits. Any command from project settings — `testCommand`, `buildCommand`, `workflow step scripts`, etc. — **must** run via `promisify(exec)` with `timeout`. Never use `execSync` for user-configured commands.

```ts
import { exec } from "node:child_process";
import { promisify } from "node:util";
const execAsync = promisify(exec);

const { stdout, stderr } = await execAsync(command, {
  cwd: worktreePath,
  timeout: 120_000,
  maxBuffer: 10 * 1024 * 1024,
});
```

`execSync` is only acceptable for short, deterministic git plumbing (`git rev-parse`, `git branch -d`, `git worktree remove`, etc.). When in doubt, use async.

## Git Conventions

- Commit messages: `feat(FN-XXX):`, `fix(FN-XXX):`, `test(FN-XXX):`
- One commit per step (not per file change)
- Always include the task ID prefix

## Node Dashboard

Fusion has a Node Dashboard view for managing mesh network nodes. See [docs/architecture.md](./docs/architecture.md) for dashboard components and API endpoints.

## Pi Extension (`packages/cli/src/extension.ts`)

The pi extension provides tools and a `/fn` command for interacting with fn from within a pi session. It ships as part of `@gsxdsm/fusion`.

**Update the extension when:**
- CLI commands change (behavior, flags, or output)
- Task store / Agent store API changes (method signatures or behavior)
- New user-facing features are added that chat agents should be able to use

**Don't add tools for engine-internal operations** (move, step updates, logging, merge) — those are handled by the engine's own agents.

The extension has no skills — tool descriptions give the LLM everything it needs.

## Agent Spawning (`spawn_agent` tool)

The executor agent can spawn child agents that run in parallel. Each spawned agent:
1. Runs in its own git worktree (branched from the parent's worktree)
2. Receives a task prompt describing what to do
3. Executes autonomously until completion or termination
4. Reports status back to the parent via AgentStore

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Name for the child agent |
| `role` | `string` | Role: `"triage"`, `"executor"`, `"reviewer"`, `"merger"`, `"engineer"`, or `"custom"` |
| `task` | `string` | Task description for the child agent to execute |

### Settings

- `maxSpawnedAgentsPerParent` (default: `5`) — Maximum children per parent agent
- `maxSpawnedAgentsGlobal` (default: `20`) — Maximum total spawned agents per executor instance

### Lifecycle

- Child agents are tracked in `AgentStore` with `reportsTo` set to the parent task ID
- When the parent session ends, all spawned children are terminated
- State transitions: `idle` → `active` → `running` → `active` (success) or `error` (failure)

### Error Handling

- Per-parent and global limits are enforced with descriptive error messages
- Failures during agent creation or worktree setup return error results
- State update failures are non-blocking (logged but don't prevent execution)

## Checkout Leasing

Task ownership supports explicit checkout leases. Agents should be aware of:

### Conflict Semantics

- Checkout conflicts return **409 Conflict** when another agent already holds the lease
- Response shape: `{ error: "Task is already checked out", currentHolder, taskId }`
- Clients **must not retry 409 automatically** — this is ownership contention, not a transient failure

### Heartbeat Enforcement

`HeartbeatMonitor.executeHeartbeat()` validates checkout before work begins:
- If `task.checkedOutBy` is set to another agent, the run exits with `reason: "checkout_conflict"`
- Heartbeat execution does not auto-checkout — callers are responsible for obtaining checkout before starting work

## Per-Agent Heartbeat Configuration

Each agent can override heartbeat behavior via `runtimeConfig`. Key settings:
- `heartbeatIntervalMs` — How often heartbeats are triggered
- `heartbeatTimeoutMs` — Time without heartbeat before agent is considered unresponsive
- `maxConcurrentRuns` — Max concurrent heartbeat runs per agent

See [docs/agents.md](./docs/agents.md) for the full configuration reference.

## Budget Governance

Per-agent token budget tracking controls costs and prevents runaway AI spending. Budget enforcement happens at multiple points:

- **HeartbeatMonitor.executeHeartbeat()** — Checks budget before creating sessions; skips when `isOverBudget: true` or `isOverThreshold: true` (for timer triggers)
- **HeartbeatTriggerScheduler.onTimerTick()** — Skips timer ticks when budget is exceeded

Agents can be paused by budget exhaustion. See [docs/agents.md](./docs/agents.md) for the full budget configuration reference.

## Heartbeat Trigger Scheduling

`HeartbeatTriggerScheduler` manages three trigger mechanisms:
- **Timer** — Periodic wakeup based on `heartbeatIntervalMs`
- **Assignment** — Automatic wakeup when a task is assigned
- **On-demand** — Manual trigger via `POST /api/agents/:id/runs`

See [docs/agents.md](./docs/agents.md) for WakeContext and API details.

## Agent Performance Ratings

Agent performance ratings allow users and agents to provide feedback that influences future behavior through system prompt injection. Ratings use a 1–5 scale with trend analysis (improving/declining/stable).

See [docs/agents.md](./docs/agents.md) for the full API and dashboard configuration reference.

## Engine Diagnostic Logging

The task executor, scheduler, and related subsystems use structured logging via `createLogger()` from `packages/engine/src/logger.ts`. All log lines are prefixed with the subsystem name.

### Key Diagnostic Points

When debugging agent execution issues (agents stuck on "starting"), check these log points:

1. **`[executor] TaskExecutor constructed`** — Confirms the executor initialized with expected options
2. **`[executor] [event:task:moved] FN-XXX → in-progress`** — Confirms the scheduler moved the task
3. **`[executor] execute() called for FN-XXX`** — Confirms execute() was entered
4. **`[executor] FN-XXX: worktree ready at ...`** — Confirms worktree creation
5. **`[executor] FN-XXX: creating agent session`** — Confirms model resolution and session creation started
6. **`[pi] createKbAgent called`** — Confirms the agent factory was invoked
7. **`[pi] Session created successfully`** — Confirms the AI session was created
8. **`[executor] FN-XXX: calling promptWithFallback()...`** — Confirms the prompt was sent
9. **`[stuck-detector] Tracking task FN-XXX`** — Confirms heartbeat monitoring started

### Semaphore Resilience

`AgentSemaphore` (`packages/engine/src/concurrency.ts`) has defensive guards:
- `limit` getter returns minimum 1 (prevents indefinite blocking)
- `availableCount` returns 0 for invalid limits (NaN, Infinity, ≤0)

## Headless Node Mode (`fn serve`)

The `fn serve` command starts Fusion as a headless node (API server + AI engine, no frontend). It binds to `0.0.0.0` by default for remote accessibility.

See [docs/architecture.md](./docs/architecture.md) for the full reference including health endpoint and startup banner.

## Settings

fn uses a two-tier settings hierarchy:
- **Global settings** — User preferences in `~/.pi/fusion/settings.json` (theme, models, notifications)
- **Project settings** — Project-specific settings in `.fusion/config.json` (concurrency, worktrees, commands)

Project settings override global settings. Configure via the dashboard **Settings** modal or `fn settings` CLI.

See [docs/settings-reference.md](./docs/settings-reference.md) for the complete settings reference.

### Settings Hierarchy for Model Selection

**For Task Specification (Triage):**
1. Per-task `planningModelProvider`/`planningModelId`
2. Global `planningProvider`/`planningModelId`
3. Global `defaultProvider`/`defaultModelId`

**For Task Execution (Executor):**
1. Per-task `modelProvider`/`modelId`
2. Global `defaultProvider`/`defaultModelId`

**For Code/Spec Review (Reviewer):**
1. Per-task `validatorModelProvider`/`validatorModelId`
2. Global `validatorProvider`/`validatorModelId`
3. Global `defaultProvider`/`defaultModelId`

## Per-Task Model Overrides

Tasks can override global AI model settings on a per-task basis:
- **Executor Model** — The model used to implement the task
- **Validator Model** — The model used for code and plan review
- **Planning Model** — The model used for task specification

When both provider and modelId are set, the task override is used instead of global defaults. Set via the task detail modal's **Model** tab.

## Model Presets

Model presets let teams standardize AI model choices. Each preset contains executor/validator model pairs. Presets can be auto-selected by task size (Small → Budget, Medium → Normal, Large → Complex).

See [docs/settings-reference.md](./docs/settings-reference.md) for the full configuration reference.

## Mission Autopilot

Missions can run in autopilot mode for autonomous progression. When enabled:
- Autopilot watches task completion events
- Automatically activates the next slice when the current one finishes
- Progresses through: `inactive → watching → activating → completing`

See [docs/missions.md](./docs/missions.md) for the full autopilot reference.

## Mission Planning Context

When features are triaged to tasks, the system enriches descriptions with full mission hierarchy context (mission → milestone → slice → feature), giving implementation agents comprehensive context.

See [docs/missions.md](./docs/missions.md) for the planning context system and interview flow documentation.

## Workflow Steps

Workflow steps are reusable quality gates that run at configurable lifecycle phases:
- **Pre-merge** — After task implementation, before merge (can block)
- **Post-merge** — After successful merge (informational only)

Steps can be defined as **prompt** (AI agent review) or **script** (deterministic command).

See [docs/workflow-steps.md](./docs/workflow-steps.md) for the full reference including templates, API, and execution details.

## Run Audit

The run-audit system records every mutation performed by the engine across three domains:
- **Database** — task:create, task:update, task:move, etc.
- **Git** — worktree:create, commit:create, merge:resolve, etc.
- **Filesystem** — file:write, prompt:write, attachment:create, etc.

Events are tied to specific run IDs for end-to-end traceability. See [docs/architecture.md](./docs/architecture.md) for the audit API reference.

## Archive Cleanup

Archived tasks can be cleaned up from the filesystem while preserving metadata. Restored tasks keep all metadata but lose attachments and agent logs.

See [docs/task-management.md](./docs/task-management.md) for the archive and restore reference.
