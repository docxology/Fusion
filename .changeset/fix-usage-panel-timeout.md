---
"@gsxdsm/fusion": patch
---

Fix usage panel appearing blank when Claude provider fetch hangs. Add per-provider timeout (10s) so a slow or unresponsive provider doesn't block the entire usage API response.
