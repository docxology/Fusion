---
"@gsxdsm/fusion": patch
---

Fix PROMPT.md not syncing when task title or description is edited in the dashboard

Previously, when users edited a task's title or description via `updateTask()`, the PROMPT.md file was not being regenerated, causing a mismatch between what users saw in the dashboard and what the AI executor saw. Now PROMPT.md is automatically regenerated whenever title or description changes, preserving all existing sections (Dependencies, Steps, File Scope, Acceptance Criteria, Notifications) while updating the heading and Mission section.
