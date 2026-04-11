---
"@gsxdsm/fusion": patch
---

Reduce project memory bloat and tighten memory save heuristics for selective curation.

- Trim `.fusion/memory.md` from 64KB to 10.6KB (83% reduction) by removing task-specific FN-entries and keeping only durable, reusable learnings
- Update `buildExecutionMemoryInstructions()` to require selective memory writes:
  - Agents should skip memory updates when nothing durable was learned
  - Agents should avoid task-specific trivia (logs, changelog entries, transient failures)
  - Agents can consolidate/edit existing entries rather than always appending
  - Only genuinely reusable insights qualify (patterns, conventions, pitfalls, constraints)
- Update README.md with "What does NOT go in memory" section and selective save behavior
- Update tests to assert new selective-save semantics
