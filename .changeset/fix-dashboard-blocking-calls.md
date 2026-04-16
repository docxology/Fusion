---
"@gsxdsm/fusion": patch
---

Fix blocking/synchronous filesystem calls in dashboard server route handlers. Converted `existsSync`, `statSync`, `readFileSync`, `mkdirSync`, `readdirSync`, and `rmSync` calls to async `fs/promises` equivalents in request handlers to prevent blocking the Node event loop. Added documentation comments for startup-time sync calls in terminal-service.ts and github-webhooks.ts.
