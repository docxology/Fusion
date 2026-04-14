---
"@gsxdsm/fusion": minor
---

Consolidate project directories to .fusion only

- Add `.fusion` to `.gitignore` during `fn init` (idempotent)
- Remove `.pi/settings.json` fallback from CLI, engine, and dashboard
- Remove project-local `.pi/auth.json` paths from dashboard usage
- Only `.fusion/` is now used for project-level data storage
