# @promptlycms/prompts

TypeScript SDK for the [Promptly CMS](https://promptlycms.com) API. Stop hardcoding prompts in your codebase — manage them in a purpose-built CMS with versioning and instant publishing, then fetch them at runtime with full type safety.

- **Zero hardcoded prompts** — fetch prompts at runtime; update wording, models, and settings from the [CMS](https://promptlycms.com) without code changes or redeploys
- **Runtime client** — `getPrompt()`, `getPrompts()`, `getComposer()`, and `getComposers()` with full TypeScript support
- **Composers** — fetch multi-segment documents that combine static HTML with prompt references, then assemble AI-generated output with `formatComposer()`
- **Codegen CLI** — generates typed template variables and composer types via declaration merging
- **AI SDK integration** — destructure directly into [Vercel AI SDK](https://ai-sdk.dev/) `generateText` / `streamText`
- **Any AI provider** — supports [all providers](https://ai-sdk.dev/providers/ai-sdk-providers#provider-support) supported by the Vercel AI SDK
- **Structured output** — Zod schemas built from CMS-defined output schemas

## Install

```bash
npm install @promptlycms/prompts
```

Peer dependencies:

```bash
npm install zod ai
npm install --save-dev typescript
```

You'll also need at least one AI provider SDK for model resolution:

```bash
# Install the provider(s) your prompts use
npm install @ai-sdk/anthropic  # Claude models
npm install @ai-sdk/openai     # GPT / o-series models
npm install @ai-sdk/google     # Gemini models
npm install @ai-sdk/mistral    # Mistral / Mixtral models
```

## Quick start

### 1. Set your API key

```bash
# .env
PROMPTLY_API_KEY=pk_live_...
```

### 2. Generate types (optional but recommended)

```bash
npx promptly generate
```

This fetches all your prompts and composers from the API and generates a `promptly-env.d.ts` file in your project root with typed autocomplete for every prompt ID, composer ID, template variables, and prompt names.

```bash
# Custom output path
npx promptly generate --output ./types/promptly-env.d.ts

# Pass API key directly
npx promptly generate --api-key pk_live_...
```

### 3. Create a client

```typescript
import { createPromptlyClient } from '@promptlycms/prompts';

const promptly = createPromptlyClient({
  apiKey: process.env.PROMPTLY_API_KEY,
});
```

## Fetching prompts

### Single prompt

```typescript
const result = await promptly.getPrompt('JPxlUpstuhXB5OwOtKPpj');

// Access prompt metadata
result.promptId;      // 'JPxlUpstuhXB5OwOtKPpj'
result.promptName;    // 'Review Prompt'
result.systemMessage; // 'You are a helpful assistant.'
result.temperature;   // 0.7
result.model;         // LanguageModel (auto-resolved from CMS config)

// Interpolate template variables (typed if you ran codegen)
const message = result.userMessage({
  pickupLocation: 'London',
  items: 'sofa',
});

// Get the raw template string
const template = String(result.userMessage);
// => 'Help with ${pickupLocation} moving ${items}.'
```

Fetch a specific version:

```typescript
const result = await promptly.getPrompt('JPxlUpstuhXB5OwOtKPpj', {
  version: '2.0.0',
});
```

### Batch fetch

Fetch multiple prompts in parallel with typed results per position:

```typescript
import type { PromptRequest } from '@promptlycms/prompts';

const [reviewPrompt, welcomePrompt] = await promptly.getPrompts([
  { promptId: 'JPxlUpstuhXB5OwOtKPpj' },
  { promptId: 'abc123', version: '2.0.0' },
]);

// Each result is typed to its own prompt's variables
reviewPrompt.userMessage({ pickupLocation: 'London', items: 'sofa' });
welcomePrompt.userMessage({ email: 'a@b.com', subject: 'Hi' });
```

## AI SDK integration

Destructure `getPrompt()` and pass the properties directly to Vercel AI SDK functions:

```typescript
import { generateText } from 'ai';

const { userMessage, systemMessage, temperature, model } = await promptly.getPrompt('my-prompt');

const { text } = await generateText({
  model,
  system: systemMessage,
  prompt: userMessage({ name: 'Alice', task: 'coding' }),
  temperature,
});
```

The model configured in the CMS is auto-resolved to the correct AI SDK provider.

## Fetching composers

A composer is a document template that combines static HTML segments with prompt references. Fetch a composer and use `compose()` to run all prompts and assemble the output in one call:

```typescript
import { generateText } from 'ai';

const composer = await promptly.getComposer('my-composer-id', {
  input: { text: 'Hello world', targetLang: 'French' },
});

// One line — runs all prompts in parallel, assembles the output
const output = await composer.compose(generateText);
```

Override parameters per prompt:

```typescript
const output = await composer.compose((prompt) =>
  generateText({ ...prompt, maxTokens: 500 })
);
```

For full control, use the manual flow with named prompts and `formatComposer()`:

```typescript
const { introPrompt, reviewPrompt, formatComposer } = composer;

const output = formatComposer({
  introPrompt: await generateText(introPrompt),
  reviewPrompt: await generateText(reviewPrompt),
});
```

Prompt results are treated as text by default. Newlines in strings or `{ text }`
results are preserved as `<br>` tags when the composer output is assembled. If
text prompt output is placed in its own rich-text paragraph, the SDK also keeps
the visible paragraph gap in email-safe HTML. If a prompt result already
contains trusted HTML, pass `{ html: '<p>...</p>' }` to `formatComposer()` to
insert it without newline conversion.

Batch fetch multiple composers in parallel:

```typescript
const [first, second] = await promptly.getComposers([
  { composerId: 'comp-a', input: { name: 'Dan' } },
  { composerId: 'comp-b', input: { topic: 'AI' } },
]);
```

### HTML blocks

Composers can contain raw HTML blocks (for vendor-specific markup like MSO conditional comments in transactional emails). These surface as a distinct `html_block` segment type:

```typescript
const composer = await promptly.getComposer('my-email-composer', {
  input: { country: 'United Kingdom' },
});

for (const segment of composer.segments) {
  if (segment.type === 'html_block') {
    console.log(segment.html); // raw HTML, byte-exact
  }
}
```

Variable references inside an `html_block` (e.g. `<span data-variable-ref data-field-path="country">`) are interpolated normally during `formatComposer()` / `compose()`. Embedded prompt references inside an `html_block` are passed through opaquely — they aren't resolved as named prompts.

HTML blocks are otherwise left raw, including whitespace, comments, and empty
paragraphs.

## Model auto-detection

The SDK automatically resolves models configured in the CMS to the correct AI SDK provider based on the model name prefix:

| Prefix | Provider | Package |
|--------|----------|---------|
| `claude-*` | Anthropic | `@ai-sdk/anthropic` |
| `gpt-*`, `o1-*`, `o3-*`, `o4-*`, `chatgpt-*` | OpenAI | `@ai-sdk/openai` |
| `gemini-*` | Google | `@ai-sdk/google` |
| `mistral-*`, `mixtral-*`, `codestral-*` | Mistral | `@ai-sdk/mistral` |

CMS model display names (e.g. `claude-sonnet-4.6`) are mapped to their full API model IDs automatically.

### Custom model resolver

If you need full control over model resolution, pass a `model` function:

```typescript
import { anthropic } from '@ai-sdk/anthropic';

const promptly = createPromptlyClient({
  apiKey: process.env.PROMPTLY_API_KEY,
  model: (modelId) => anthropic('claude-sonnet-4-6'),
});
```

## Type generation

Running `npx promptly generate` creates a `promptly-env.d.ts` file that uses [declaration merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html) to type your prompts:

```typescript
// Auto-generated by @promptlycms/prompts — do not edit
import '@promptlycms/prompts';

declare module '@promptlycms/prompts' {
  interface PromptVariableMap {
    'JPxlUpstuhXB5OwOtKPpj': {
      [V in 'latest' | '2.0.0' | '1.0.0']: {
        pickupLocation: string;
        items: string;
      };
    };
    'abc123': {
      [V in 'latest' | '1.0.0']: {
        email: string;
        subject: string;
      };
    };
  }
}
```

With this file present, `getPrompt()` and `getPrompts()` return typed `userMessage` functions with autocomplete. `getComposer()` and `getComposers()` only accept generated composer IDs, with typed `input` and named prompt properties. Unknown prompt IDs fall back to `Record<string, unknown>`.

Add the generated file to version control so types are available without running codegen in CI. Re-run `npx promptly generate` whenever you add, remove, or rename template variables in the CMS.

## Error handling

All API errors throw `PromptlyError`:

```typescript
import { PromptlyError } from '@promptlycms/prompts';

try {
  await promptly.getPrompt('nonexistent');
} catch (err) {
  if (err instanceof PromptlyError) {
    err.code;       // 'NOT_FOUND' | 'INVALID_KEY' | 'USAGE_LIMIT_EXCEEDED' | ...
    err.status;     // HTTP status code
    err.message;    // Human-readable error message
    err.usage;      // Usage data (on 429s)
    err.upgradeUrl; // Upgrade link (on 429s)
  }
}
```

## API reference

### `createPromptlyClient(config?)`

| Option    | Type     | Required | Description                                        |
|-----------|----------|----------|----------------------------------------------------|
| `apiKey`  | `string` | No       | Your Promptly API key (defaults to `PROMPTLY_API_KEY` env var) |
| `baseUrl` | `string` | No       | API base URL (default: `https://api.promptlycms.com`) |
| `model`   | `(modelId: string) => LanguageModel` | No | Custom model resolver — overrides auto-detection |

Returns a `PromptlyClient` with `getPrompt()`, `getPrompts()`, `getComposer()`, and `getComposers()` methods.

### `client.getPrompt(promptId, options?)`

Fetch a single prompt. Returns `PromptResult` with typed `userMessage` when codegen types are present.

| Option    | Type     | Description          |
|-----------|----------|----------------------|
| `version` | `string` | Specific version to fetch (default: latest) |

### `client.getPrompts(entries)`

Fetch multiple prompts in parallel. Accepts `PromptRequest[]` and returns a typed tuple matching the input order.

### `client.getComposer(composerId, options?)`

Fetch a single composer. Returns `ComposerResult` with named prompt properties, a `prompts` array, and `formatComposer()`.

| Option    | Type                      | Description          |
|-----------|---------------------------|----------------------|
| `input`   | `Record<string, unknown>` | Template variables to interpolate |
| `version` | `string`                  | Specific version to fetch (default: latest) |

### `client.getComposers(entries)`

Fetch multiple composers in parallel. Accepts `ComposerRequest[]` and returns results in the same order.

### `@promptlycms/prompts/schema`

Subpath export for working with Zod schemas from CMS schema fields:

```typescript
import { buildZodSchema, schemaFieldsToZodSource } from '@promptlycms/prompts/schema';
```

- `buildZodSchema(fields)` — builds a Zod object schema at runtime from `SchemaField[]`
- `schemaFieldsToZodSource(fields)` — generates Zod source code as a string for codegen

### CLI: `npx promptly generate`

| Flag        | Alias | Description                                          |
|-------------|-------|------------------------------------------------------|
| `--api-key` |       | API key (defaults to `PROMPTLY_API_KEY` env var)     |
| `--output`  | `-o`  | Output path (default: `./promptly-env.d.ts`)         |

## License

MIT
