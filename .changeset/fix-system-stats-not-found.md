---
"@runfusion/fusion": patch
---

Fix `/api/system-stats` so process/system metrics still return when project resolution fails, with task and agent aggregates gracefully falling back to zero counts.