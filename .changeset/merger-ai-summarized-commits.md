---
"@runfusion/fusion": minor
"runfusion.ai": minor
"@fusion/core": minor
"@fusion/dashboard": minor
"@fusion/desktop": minor
"@fusion/engine": minor
"@fusion/mobile": minor
"@fusion/pi-claude-cli": minor
"@fusion/plugin-sdk": minor
---

Generate richer merge commit messages via the AI summarizer. The merger now routes commit-body summarization through the consolidated `ai-summarize.ts` pipeline (using the title-summarization model), with an AI fallback cascade to guarantee non-empty merge bodies. Summarization model is configurable in settings.
