---
"@gsxdsm/fusion": patch
---

Fix dashboard status updates not showing until refresh (KB-613). The `handleUpdated` function in `useTasks.ts` now correctly uses `updatedAt` for general freshness comparison instead of relying solely on `columnMovedAt`, which was causing status updates to be incorrectly rejected as stale after column moves.
