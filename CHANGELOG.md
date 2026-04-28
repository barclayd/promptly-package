# @promptlycms/prompts

## 0.5.0

### Minor Changes

- [#21](https://github.com/barclayd/promptly-package/pull/21) [`8df0df3`](https://github.com/barclayd/promptly-package/commit/8df0df3892edfcd66c45a5eff1232a760a5888e9) Thanks [@barclayd](https://github.com/barclayd)! - Add `html_block` segment type for raw-HTML blocks authored in the Promptly composer. Variable references inside HTML blocks are interpolated normally; embedded prompt references are passed through opaquely. Codegen extracts variable names from html_block content.

### Patch Changes

- [#22](https://github.com/barclayd/promptly-package/pull/22) [`4678918`](https://github.com/barclayd/promptly-package/commit/46789180b6df6cbb5d083879e0bd421e4356396f) Thanks [@barclayd](https://github.com/barclayd)! - Narrow generated composer APIs to known composer IDs and emit valid identifier composer keys without quotes.

## 0.4.1

### Patch Changes

- [#19](https://github.com/barclayd/promptly-package/pull/19) [`375b6a8`](https://github.com/barclayd/promptly-package/commit/375b6a8e4941383133d4cd964a37fac60807ea5c) Thanks [@barclayd](https://github.com/barclayd)! - Include static segment variables in composer codegen output

## 0.4.0

### Minor Changes

- [#17](https://github.com/barclayd/promptly-package/pull/17) [`54c97af`](https://github.com/barclayd/promptly-package/commit/54c97afb2ff629428fcaba75289bb7e25e980033) Thanks [@barclayd](https://github.com/barclayd)! - Generate accurate TypeScript types from schema fields in codegen output. Variables with non-string types (e.g. `number`, `boolean`, `string[]`) are now correctly typed in `promptly-env.d.ts` instead of always being `string`. Also widens the `typescript` peer dependency to support both v5 and v6.

## 0.3.0

### Minor Changes

- [#15](https://github.com/barclayd/promptly-package/pull/15) [`187a947`](https://github.com/barclayd/promptly-package/commit/187a94727d7f97c46fd5953baca47655d518e67e) Thanks [@barclayd](https://github.com/barclayd)! - Add composer support: `getComposer()`, `getComposers()`, and `formatComposer()` for fetching and assembling multi-segment composer documents. Codegen now generates `ComposerVariableMap` and `ComposerPromptMap` types.

## 0.2.0

### Minor Changes

- [#13](https://github.com/barclayd/promptly-package/pull/13) [`7e61c6b`](https://github.com/barclayd/promptly-package/commit/7e61c6b67671dd1bf1176befa0b1c8af843d82a6) Thanks [@barclayd](https://github.com/barclayd)! - Add Claude Sonnet 4.6 model support to CMS display name mapping

## 0.1.2

### Patch Changes

- [#6](https://github.com/barclayd/promptly-package/pull/6) [`5aa8d33`](https://github.com/barclayd/promptly-package/commit/5aa8d33f842391c804532ac9a20707700f3fe4d0) Thanks [@barclayd](https://github.com/barclayd)! - Add documentation site built with Astro Starlight

## 0.1.1

### Patch Changes

- [#4](https://github.com/barclayd/promptly-package/pull/4) [`170e69e`](https://github.com/barclayd/promptly-package/commit/170e69e90bb88b300e003fd9546754b1391e188a) Thanks [@barclayd](https://github.com/barclayd)! - Fix model resolution to map CMS model IDs to valid AI SDK model IDs

- [#4](https://github.com/barclayd/promptly-package/pull/4) [`170e69e`](https://github.com/barclayd/promptly-package/commit/170e69e90bb88b300e003fd9546754b1391e188a) Thanks [@barclayd](https://github.com/barclayd)! - Fix incorrect API names in README and add documentation for model auto-detection, custom model resolver, and schema subpath export
