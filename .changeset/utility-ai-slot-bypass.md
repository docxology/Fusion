---
"@gsxdsm/fusion": patch
---

Document that `maxConcurrent` governs task execution lanes only; utility AI workflows bypass the limit

**What changed:**
- `maxConcurrent` / `AgentSemaphore` now explicitly applies to task-lane work only: triage specification, task execution, and merge operations
- Utility AI workflows run on a separate control-plane lane and are NOT gated by `maxConcurrent`:
  - AI planning mode
  - Subtask breakdown
  - Mission, milestone, and slice interviews
  - Agent heartbeat / chat wake runs
  - Title summarization

**Behavior:**
- Dashboard planning, subtask, and interview features remain responsive even when all task execution slots are saturated
- Agent wake-on-message and title summarization continue to work regardless of `maxConcurrent` settings
- Existing task-lane concurrency limits (executor, triage, merge) are unchanged
