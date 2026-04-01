---
"@gsxdsm/fusion": minor
---

Add CLI multi-project commands and --project flag support.

New commands:
- `fn project list [--json]` — List all registered projects
- `fn project add [dir] [--name <name>] [--isolation <mode>]` — Register a project
- `fn project remove <name> [--force]` — Unregister a project
- `fn project info [name]` — Show project details

All task and settings commands now support `--project <name>` flag:
- `fn task list --project myapp`
- `fn settings --project myapp`

Projects are auto-detected from cwd by walking up to find `.kb/`.
