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

Restore task card timing and changes fallbacks (FN-2877). The dashboard task card again falls back gracefully when timing data or change summaries are missing, preventing blank states on tasks that haven't reported metrics yet.
