---
"@gsxdsm/fusion": patch
---

Fix terminal tab showing blank content on first open. Move scrollback buffer reset to WebSocket onopen handler to prevent race condition where buffered data is cleared before the connection is established.
