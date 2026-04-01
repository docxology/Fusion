---
"@fusion/engine": minor
---

Add per-project runtime abstraction and hybrid executor lifecycle

- New ProjectRuntime interface with in-process and child-process implementations
- IPC protocol for isolated task execution between parent and child processes
- HybridExecutor for managing multi-project task execution
- Configurable isolation modes per project (in-process vs child-process)
- Runtime health monitoring with automatic crash recovery
- Global concurrency coordination via CentralCore
