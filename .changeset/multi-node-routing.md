---
"@runfusion/fusion": minor
"runfusion.ai": minor
"@fusion/core": minor
"@fusion/dashboard": minor
"@fusion/desktop": minor
"@fusion/engine": minor
"@fusion/mobile": minor
"@fusion/pi-claude-cli": minor
"@fusion/plugin-sdk": minor
---

Add unified multi-node task routing across CLI, dashboard, core, and engine flows.

- **Routing model:** Tasks can set a per-task node override with project-level pinned default node fallback. `resolveEffectiveNode()` computes the effective routing target per task.
- **Core types:** Adds `Task.nodeId`, `UnavailableNodePolicy` (`"block" | "fallback-local"`), `ProjectSettings.defaultNodeId`, and `ProjectSettings.unavailableNodePolicy`.
- **Engine behavior:** Adds effective-node resolution (per-task override → project default → local), unavailable-node policy enforcement, and routing activity event logging.
- **Active-task guard:** Blocks node override changes for in-progress tasks via `validateNodeOverrideChange()`.
- **Dashboard updates:** Adds project settings controls for default node and unavailable-node policy, task detail routing summary (effective node, routing source, fallback policy, blocking reason), quick task creation node picker, bulk node override actions, and node health/status indicators in selectors.
- **CLI updates:** Adds `fn settings set defaultNodeId <node-id>`, `fn settings set unavailableNodePolicy <block|fallback-local>`, `fn task set-node <id> <node>`, `fn task clear-node <id>`, `fn task create --node <name>`, and routing details in `fn task show`.
- **Schema updates:** Includes tasks table migration adding the `nodeId` column.
