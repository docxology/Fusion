---
"@gsxdsm/fusion": patch
---

Fix models from pi package extensions (npm/git) not appearing in dashboard model selector.

The dashboard now uses pi's `DefaultPackageManager` to resolve extension paths from `settings.json` packages (npm, git, local), in addition to filesystem-discovered extensions. This ensures that extensions like `@howaboua/pi-glm-via-anthropic` which register custom providers (e.g. glm-5.1) are properly loaded and their models appear in the dashboard's model selector dropdown.
