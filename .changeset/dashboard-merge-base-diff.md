---
"@runfusion/fusion": patch
"runfusion.ai": patch
"@fusion/core": patch
"@fusion/dashboard": patch
"@fusion/desktop": patch
"@fusion/engine": patch
"@fusion/mobile": patch
"@fusion/pi-claude-cli": patch
"@fusion/plugin-sdk": patch
---

Prefer `merge-base` over potentially stale `baseCommitSha` when resolving task diff bases in the dashboard. Diffs no longer drift when the recorded base commit lags behind the actual divergence point.
