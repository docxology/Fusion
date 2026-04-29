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

Keep task card timer live while a task is actively merging (FN-2920). The in-review timer was driven by per-step instrumented duration, which freezes during the merge phase, so a stuck merge could read "3m" indefinitely. While `status` is `merging`/`merging-pr` the card now shows live elapsed since the merger flipped the status, with a "Merging Nm" tooltip.
