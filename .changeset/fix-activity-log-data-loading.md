---
"@gsxdsm/fusion": patch
---

Fix dashboard activity log modal reading from wrong data source in single-project mode. The modal now correctly reads from the per-project activity log (/api/activity) instead of the unified central feed, while preserving multi-project filtering support.
