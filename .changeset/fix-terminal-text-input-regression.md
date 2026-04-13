---
"@gsxdsm/fusion": patch
---

Fix terminal text entry not working in the dashboard.

This fix ensures xterm's hidden textarea receives proper focus after initialization by:
1. Focusing the helper textarea directly after `terminal.open()`
2. Dispatching a synthetic click event on the terminal container to trigger xterm's internal focus tracking

These changes address the root cause where programmatic `focus()` calls alone did not properly trigger xterm.js's internal focus management, which relies on canvas click events for full input handling setup.
