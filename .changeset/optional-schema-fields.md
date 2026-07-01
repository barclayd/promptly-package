---
"@promptlycms/prompts": patch
---

Support optional schema fields end to end.

- **Codegen** now reflects schema field optionality in generated types. Fields declared with `.optional()`, `.nullish()`, or `.default()` are emitted as optional properties (`name?: type`), and `.nullable()`/`.nullish()` widen the value type to include `| null`. Previously all schema fields were emitted as required, forcing callers to pass optional variables. Applies to both prompt (`PromptVariableMap`) and composer (`ComposerVariableMap`) types.
- **Runtime** `interpolate()` now renders a `[not provided]` placeholder (exported as `NOT_PROVIDED_PLACEHOLDER`) when a template variable is absent — a missing key, `undefined`, or `null`. Previously a missing variable left a raw `${var}` in the prompt and an explicit `undefined` rendered as the string `"undefined"`, neither of which signalled absence to the model. Interpolation is now a single pass, so injected values are no longer re-interpolated.
