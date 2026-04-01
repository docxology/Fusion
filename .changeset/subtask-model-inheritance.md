---
"@gsxdsm/fusion": patch
---

Inherit parent task AI model settings in subtasks

Subtasks created via the dashboard subtask breakdown dialog or the triage agent's `task_create` tool now automatically inherit the parent task's AI model settings:

- `modelProvider` & `modelId` → inherited by subtasks for executor agent
- `validatorModelProvider` & `validatorModelId` → inherited by subtasks for reviewer agent

If the parent task has no model overrides or doesn't exist, subtasks fall back to global defaults as before.
