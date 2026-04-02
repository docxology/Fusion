---
"@fusion/dashboard": patch
---

Add visibility-based data refresh to dashboard hooks

When the dashboard tab becomes visible after being hidden (e.g., minimized, tab switched), data is now immediately refreshed instead of waiting for the next polling interval.
