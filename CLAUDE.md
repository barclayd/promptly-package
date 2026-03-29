---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Project

This is `@promptlycms/prompts` — a TypeScript SDK for the Promptly CMS API. It provides:
- A **runtime client** for fetching prompts (`getPrompt`, `getPrompts`) and composers (`getComposer`, `getComposers`)
- A **codegen CLI** that generates `promptly-env.d.ts` with typed template variables and composer types via declaration merging

### Key scripts

- `bun run check` — runs types, lint, and test sequentially
- `bun run types` — `tsgo --noEmit` (uses @typescript/native-preview)
- `bun run lint` — `biome check .`
- `bun run lint:fix` — `biome check --write .`
- `bun run build` — `tsup`

### Project structure

- `src/client.ts` — runtime client (`createPromptlyClient`) with `getPrompt()`, `getPrompts()`, `getComposer()`, and `getComposers()` methods. Also contains `toCamelCase()`, `interpolateStaticSegment()`, `interpolate()`, model resolution helpers.
- `src/schema/builder.ts` — builds Zod schemas from `SchemaField[]` at runtime
- `src/schema/codegen.ts` — generates Zod source code strings from `SchemaField[]`
- `src/errors.ts` — `PromptlyError` class with `code`, `status`, `usage`, `upgradeUrl`
- `src/types.ts` — shared types (`PromptResponse`, `ComposerResponse`, `SchemaField`, `PromptVariableMap`, `ComposerVariableMap`, `ComposerPromptMap`, etc.)
- `src/cli/generate.ts` — codegen: `fetchAllPrompts()`, `fetchAllComposers()`, `generateTypeDeclaration()`, `generate()`
- `src/cli/index.ts` — CLI entry point (`promptly generate` command)
- `src/__tests__/` — flat test files (no `describe` nesting)

### Type system architecture

Uses **declaration merging** (Prisma/GraphQL Code Generator pattern):
- `PromptVariableMap` — empty interface in `src/types.ts`, augmented by generated `promptly-env.d.ts`
- `PromptId` — `keyof PromptVariableMap | (string & {})` for autocomplete with fallback
- `VariablesFor<Id>` — conditional type that narrows to typed variables for known IDs, falls back to `Record<string, string>`
- `PromptMessage<V>` / `PromptResult<V>` — generic types with `Record<string, string>` defaults
- `GetPromptsResults<T>` — mapped tuple type for batch `getPrompts()` that types each position
- `PromptVariableMap` must remain an `interface` (not `type`) for declaration merging to work

Composer type system (mirrors prompt types):
- `ComposerVariableMap` — empty interface, augmented by codegen with composer IDs → version → `{ var: string }` (merged from all prompt segments' `${var}` templates)
- `ComposerPromptMap` — empty interface, augmented by codegen with composer IDs → union of camelCased prompt name strings
- `ComposerInputFor<Id, Ver>` — conditional type that narrows input shape for known composers
- `ComposerPromptNamesFor<Id>` — resolves to prompt name union from `ComposerPromptMap`
- `ComposerResult<Names>` — result with named prompt properties (`& { [K in Names]: ComposerPrompt }`), `prompts` array, and `formatComposer()` method
- `ComposerPrompt` — `{ model, system, prompt, temperature, promptId, promptName }` (AI SDK spread-compatible)
- Both `ComposerVariableMap` and `ComposerPromptMap` must remain `interface` for declaration merging

### Codegen flow

`npx promptly generate` reads `PROMPTLY_API_KEY` from env (or `--api-key` flag), calls `GET /prompts` and `GET /composers` in parallel, extracts `${var}` template variables, and writes `promptly-env.d.ts` with module augmentation. Composers that fail to fetch (e.g. older API) are silently skipped. No config file needed.

### Composer architecture

A **composer** is a document template combining static HTML segments with prompt references. The API (`GET /composers/:id`) returns a `segments` array:
- `{ type: 'static', content: '<p>HTML</p>' }` — raw HTML, may contain `<span data-variable-ref data-field-path="X"></span>` and `{{fieldPath}}` mustache patterns
- `{ type: 'prompt', promptId, promptName, version, systemMessage, userMessage, config }` — prompt reference with `${var}` template variables

`getComposer()` flow:
1. Fetch from API → get segments array
2. Interpolate static segments: replace `data-variable-ref` spans and `{{fieldPath}}` with input values
3. Interpolate prompt segments: replace `${var}` in userMessage with input values (reuses existing `interpolate()`)
4. Resolve model for each prompt via `modelResolver`
5. Build `ComposerPrompt` objects with AI SDK shape: `{ model, system, prompt, temperature }`
6. De-duplicate prompts by camelCased name (same prompt twice shares one object)
7. Build `formatComposer()` closure: takes `Record<promptName, { text } | string>`, iterates document-order segments, splices in AI results, returns single string
8. Build `compose()` closure: convenience method that takes a generate function (e.g. `generateText`), runs it for each prompt via `Promise.all`, maps results back to prompt names, calls `formatComposer()`, returns assembled string
9. Return result with named prompt properties + `prompts` array + `formatComposer()` + `compose()`

Key design decisions:
- Variables are interpolated at `getComposer()` time (not at `formatComposer()` time)
- `compose(generateText)` is the simple path — runs all prompts in parallel and assembles the output
- `formatComposer()` is the manual path — accepts both `{ text: string }` (from generateText) and raw strings
- Prompt names are camelCased from CMS promptName (e.g. "Intro Prompt" → `introPrompt`)
- Duplicate prompts share one result — `formatComposer()` reuses it at both document positions
- The `prompts` array is ordered by first appearance in the document, de-duplicated

### Dependencies

- **Runtime:** citty
- **Peer:** zod ^4.0.0, ai ^4.0 || ^5.0 || ^6.0, typescript ^5 || ^6
- **Dev:** @biomejs/biome, @changesets/cli, @changesets/changelog-github, @types/bun, @typescript/native-preview, tsup

### Model resolution

The SDK maps CMS display names to API model IDs in `MODEL_ID_MAP` (`src/client.ts`). When a new model is released, use `/add-model` — a project slash command that walks through all the touchpoints:

- `src/client.ts` — `MODEL_ID_MAP` (CMS display name → API model ID)
- `src/__tests__/client.test.ts` — `getSdkModelId()` test assertions
- `docs/src/content/docs/guides/model-resolution.mdx` — mapping table + examples
- `docs/src/content/docs/api/overview.mdx` — example JSON responses
- `docs/src/content/docs/api/endpoints.mdx` — example JSON responses
- `README.md` — inline examples

CMS display names use dots (e.g. `claude-sonnet-4.6`), API model IDs use dashes (e.g. `claude-sonnet-4-6`). Some older models include a date suffix (e.g. `claude-sonnet-4-5-20250929`).

## Code style

- Functional TypeScript, arrow functions only
- `type` over `interface` always
- No inline if statements (always use braces + newlines)
- Avoid nested if statements (use early returns, guard clauses, maps)
- Formatting and linting enforced by Biome — run `bun run lint:fix` after edits

## Testing conventions

Follow Kent C. Dodds' "Avoid Nesting When You're Testing":

- **No `describe` blocks** — flat `test()` calls only
- **No `beforeEach` for setup** — use inline `setup()` helper functions that each test calls with its own data
- **`afterEach` is OK** for cleanup (e.g., restoring `globalThis.fetch`)
- **Descriptive test names** with function prefix: `"get() fetches prompt with correct URL"`, `"buildFieldSchema: string"`, `"schemaFieldsToZodSource: generates enum field"`
- **Pure helper functions** (like `field()`) are fine — they return fresh objects with no shared mutable state
- Import from `bun:test`: `import { test, expect } from 'bun:test'`

## CI

GitHub Actions CI runs on push/PR to `main` (`.github/workflows/ci.yml`):
checkout → setup Bun (`oven-sh/setup-bun@v2`) → `bun install --frozen-lockfile` → types → lint → test → build

## Releasing

Uses [Changesets](https://github.com/changesets/changesets) for versioning and npm publishing (`.github/workflows/release.yml`).

### Adding a changeset

Every PR with user-facing changes **must** include a changeset file. Without one, the release workflow has nothing to version or publish. The [changeset-bot](https://github.com/apps/changeset-bot) is installed and comments on every PR with changeset status.

Run `bunx changeset` and follow the prompts to select a semver bump (patch/minor/major) and describe the change. This creates a markdown file in `.changeset/` that gets consumed at release time.

To create a changeset non-interactively (e.g. in a script), write the file manually:

```md
---
"@promptlycms/prompts": patch
---

Description of the change
```

Save it as `.changeset/<kebab-case-name>.md` and commit it with the PR.

**When creating a PR, always include a changeset file.** Determine the appropriate semver bump (`patch` for fixes, `minor` for new features, `major` for breaking changes) and write a concise description of the user-facing change. Commit the changeset file alongside the code changes.

### How releases work

- **On PR:** A canary version (`x.y.z-canary.<sha>`) is published to npm under the `canary` tag. A sticky PR comment shows the install command.
- **On merge to main:** The `changesets/action` either:
  - Creates/updates a "Version Packages" PR that bumps versions and updates CHANGELOG
  - Publishes to npm if the "Version Packages" PR was just merged

### npm authentication

Uses OIDC trusted publishing — no `NPM_TOKEN` secret needed. Requires a trusted publisher connection configured on npmjs.com for the `@promptlycms/prompts` package pointing to the `release.yml` workflow in `barclayd/promptly-package`.

## Public API naming

The README is the public contract for npm consumers. Keep it in sync with the actual exports:

- `createPromptlyClient` (not `createPromptClient`)
- `client.getPrompt()` (not `client.get()`)
- `client.getComposer()` / `client.getComposers()`
- `result.formatComposer()` (not `format()` — avoids collision with built-ins)
- `PromptlyClient` (not `PromptClient`)

### Composer touchpoints

When modifying composer functionality, these files need to stay in sync:

- `src/types.ts` — `ComposerResponse`, `ComposerResult`, `ComposerPrompt`, `ComposerVariableMap`, `ComposerPromptMap`, `PromptlyClient`
- `src/client.ts` — `getComposer()`, `getComposers()`, `fetchComposer()`, `toCamelCase()`, `interpolateStaticSegment()`
- `src/cli/generate.ts` — `fetchAllComposers()`, `extractComposerVariables()`, `extractComposerPromptNames()`, `generateTypeDeclaration()` composer block
- `src/__tests__/composer.test.ts` — client tests
- `src/__tests__/composer-codegen.test.ts` — codegen tests
- `src/__tests__/type-checks.ts` — `ComposerVariableMap`/`ComposerPromptMap` augmentation
- `docs/src/content/docs/guides/fetching-composers.mdx` — main guide
- `docs/src/content/docs/reference/client-api.mdx` — API reference
- `docs/src/content/docs/reference/types.mdx` — type reference
- `docs/src/content/docs/api/endpoints.mdx` — REST endpoint docs
- `README.md` — inline examples
