---
"@gsxdsm/fusion": patch
---

Heartbeat runs from the Agents panel now execute on a separate control-plane lane that is independent of task execution concurrency limits. This ensures agent responsiveness is preserved even when task pipelines are saturated.

**What changed:**
- `HeartbeatMonitor` and `HeartbeatTriggerScheduler` are created without the task-lane semaphore in both `fn dashboard` and `fn serve`
- `POST /api/agents/:id/runs` and triggerExecution paths no longer gate on `maxConcurrent` or in-progress task count
- Active-run 409 conflict semantics remain intact

**Behavior:**
- Heartbeat runs execute regardless of how busy task execution is
- Trigger scheduling remains responsive even when `maxConcurrent` slots are fully utilized
- Existing 409 conflict behavior for active runs is unchanged
