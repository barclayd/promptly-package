---
"@promptlycms/prompts": patch
---

Codegen now warns when composer fetch fails instead of silently dropping types from `promptly-env.d.ts`. The generated file always emits `ComposerVariableMap` and `ComposerPromptMap` interfaces (empty when no composers are returned) so its shape stays stable run-to-run.
