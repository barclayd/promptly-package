---
"@promptlycms/prompts": minor
---

Generate accurate TypeScript types from schema fields in codegen output. Variables with non-string types (e.g. `number`, `boolean`, `string[]`) are now correctly typed in `promptly-env.d.ts` instead of always being `string`. Also widens the `typescript` peer dependency to support both v5 and v6.
