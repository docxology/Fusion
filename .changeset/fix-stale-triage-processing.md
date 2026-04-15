---
"@gsxdsm/fusion": patch
---

Fix triage tasks stuck in "specifying" forever after stuck-detector kills session.

When the stuck-task detector killed a triage session during a `review_spec()` call, the `promptWithFallback` promise could hang indefinitely, leaving the task in the triage processor's in-memory `processing` set forever. This blocked self-healing recovery from reaching the task, causing it to stay in `triage/specifying` indefinitely even though the spec was already approved.

The fix adds staleness tracking (`processingSince` map) and an `evictStaleProcessing()` method that removes tasks from the `processing` set after 30 minutes — well past the stuck-detector timeout. The self-healing maintenance cycle calls eviction before recovery checks, ensuring hung promises can't block recovery forever.
