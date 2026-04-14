---
"@gsxdsm/fusion": patch
---

Fix notification settings persistence when clearing fields

Previously, clearing notification fields (ntfyTopic, ntfyDashboardHost, ntfyEvents) in the Settings modal would not persist - the old values would remain. This was because `undefined` values are dropped during JSON serialization.

Now uses null-as-delete semantics: when a user explicitly clears a notification field, the dashboard sends `null` to the server, which explicitly removes the field from settings and falls back to defaults on next read.

Fixes the round-trip: Save + reopen settings now correctly shows cleared notification fields.
