---
"@runfusion/fusion": patch
---

Guard SQLite FTS5 usage so Fusion starts cleanly on Node builds whose bundled `node:sqlite` was compiled without FTS5. On affected systems, `fn dashboard` previously crashed on first run with `Error: no such module: fts5` during schema migration. The Database and ArchiveDatabase now probe for FTS5 at startup and skip the virtual table + triggers when unavailable; `TaskStore.searchTasks` and `ArchiveDatabase.search` fall back to LIKE-based scans. Set `FUSION_DISABLE_FTS5=1` to force the fallback on runtimes where FTS5 is present but undesirable.
