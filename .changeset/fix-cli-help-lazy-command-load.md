---
"@gsxdsm/fusion": patch
---

Load CLI command handlers lazily so `fn --help` can exit quickly in bundled binaries without timing out.