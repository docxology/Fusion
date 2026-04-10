---
"@gsxdsm/fusion": patch
---

Enforce worktree-only execution boundaries for coding agents

Executor coding sessions are now constrained to their assigned task worktree, preventing accidental mutations to files in the main project checkout or other unrelated paths.

**Key changes:**
- File tool operations (read/write/edit/glob/grep/bash) now validate that paths are inside the current worktree when running in worktree mode
- Project memory writes to `.fusion/memory.md` at project root are still permitted (required for durable project learnings)
- Task attachment reads from `.fusion/tasks/{taskId}/attachments/` are still permitted (required for context access)
- Executor and senior-engineer prompts now explicitly document the worktree boundary rules

Non-worktree agents (triage, merger, cron, planning sessions) continue to use project root and are unaffected.
