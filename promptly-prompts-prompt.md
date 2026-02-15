# Build `@promptly/prompts` — TypeScript SDK for Promptly CMS

Build an npm package called `@promptly/prompts` — a TypeScript SDK for the Promptly CMS API.

## What this package does

Promptly CMS (promptlycms.com) lets users manage LLM prompts with versioning, structured output schemas, and model configuration. This package is the client SDK that:

1. Fetches prompts from the API with full TypeScript types
2. Converts stored schema definitions into Zod schemas at runtime
3. Returns parameters ready to spread directly into Vercel AI SDK functions (`generateText`, `streamText`, `generateObject`, `streamObject`)
4. Provides a codegen CLI that generates typed TypeScript files per-prompt at build time

## API Reference

**Endpoint:** `GET https://api.promptlycms.com/prompts/:promptId?version=<optional-semver>`
**Auth:** `Authorization: Bearer <api_key>`

**Response (200):**
```json
{
  "promptId": "xJ_R9PX25bVBxfwBFJOyf",
  "promptName": "Email Classifier",
  "version": "1.5.1",
  "systemMessage": "You are an email classification assistant...",
  "userMessage": "Classify the following email: {{email}}",
  "config": {
    "model": "claude-haiku-4.5",
    "temperature": 0.7,
    "schema": [...],
    "inputData": {...},
    "inputDataRootName": "emailData"
  }
}
```

**Error responses:**
- 401: `{ "error": "...", "code": "UNAUTHORIZED" | "INVALID_KEY" }`
- 404: `{ "error": "...", "code": "NOT_FOUND" | "VERSION_NOT_FOUND" }`
- 400: `{ "error": "...", "code": "BAD_REQUEST" }` (invalid version format)
- 429: `{ "error": "...", "code": "USAGE_LIMIT_EXCEEDED", "usage": {...}, "upgradeUrl": "..." }`

## Config Structure

The `config` object in the API response contains:

```typescript
type PromptConfig = {
  schema: SchemaField[];         // Output schema definition (see below)
  model: string | null;          // LLM model identifier (e.g. "claude-haiku-4.5", "gpt-4o")
  temperature: number;           // 0-1, default 0.5
  inputData: unknown;            // Sample input data (for testing in CMS, ignore in SDK)
  inputDataRootName: string | null; // Root name for input data (ignore in SDK)
};
```

## Schema Format (SchemaField[])

The `schema` array contains field definitions that describe a Zod schema. This is NOT JSON Schema — it's a custom format used internally by Promptly CMS. The SDK must convert these into actual Zod schemas at runtime.

```typescript
type ValidationRule = {
  id: string;
  type: string;    // "min", "max", "length", "email", "url", "uuid", "regex", "optional", "nullable", "default", etc.
  message: string;
  value: string;
  transform?: string;
  keyType?: string;
  valueType?: string;
  discriminator?: string;
  cases?: { [key: string]: SchemaField[] };
};

type SchemaField = {
  id: string;
  name: string;
  type: string;    // "string", "number", "boolean", "date", "enum", "array", "object", "union", etc.
  validations: ValidationRule[];
  params: {
    coerce?: boolean;
    description?: string;
    enumValues?: string[];
    unionTypes?: string[];
    elementType?: string;
    keyType?: string;
    valueType?: string;
    isTuple?: boolean;
    tupleTypes?: string[];
    isStrict?: boolean;
    isPassthrough?: boolean;
    isDiscriminatedUnion?: boolean;
    discriminator?: string;
    discriminatedUnion?: {
      discriminator: string;
      cases: {
        [key: string]: {
          value: string;
          fields: SchemaField[];
        };
      };
    };
    stringOptions?: {
      datetime?: { offset?: boolean; precision?: number };
      ip?: { version?: 'v4' | 'v6' };
    };
  };
};
```

### Schema → Zod Conversion Rules

The conversion logic must handle all these types:

**Base types:** `string`, `number`, `boolean`, `date`, `bigint` (support `params.coerce` for coerced versions)
**Special types:** `null`, `undefined`, `void`, `any`, `unknown`, `never`, `nan`, `symbol`
**Enum:** `z.enum(params.enumValues)`
**Literal:** `z.literal(params.enumValues[0])`
**Array:** `z.array(elementType)` or `z.tuple(tupleTypes)` when `params.isTuple`
**Object:** `z.object({})` with optional `.strict()` or `.passthrough()`
**Record:** `z.record(keyType, valueType)`
**Map:** `z.map(keyType, valueType)`
**Set:** `z.set(elementType)`
**Union:** `z.union(unionTypes)` or discriminated union when `params.isDiscriminatedUnion`
**Intersection:** `z.intersection(type1, type2)`

**Validation rules to apply (in order):**
- `min`, `max`, `length` → `.min()`, `.max()`, `.length()` (works on string, number, array)
- `email`, `url`, `uuid`, `cuid`, `cuid2`, `ulid` → string validations
- `regex` → `.regex(new RegExp(value))`
- `startsWith`, `endsWith` → string methods
- `datetime` → `.datetime()` with optional offset/precision from `params.stringOptions`
- `ip` → `z.ipv4()` / `z.ipv6()` / `z.union([z.ipv4(), z.ipv6()])` based on version
- `trim`, `toLowerCase`, `toUpperCase` → string transforms
- `int`, `positive`, `negative`, `multipleOf`, `finite`, `safe` → number validations
- `nonempty` → `.nonempty()` (string or array)
- `optional`, `nullable`, `nullish` → wrapping modifiers
- `default` → `.default(value)` (coerce to number if field type is number)
- `readonly` → `.readonly()`
- `catch` → `.catch(value)`

**After all validations:** if `params.description` exists, apply `.describe(description)`.

## Package Architecture

### 1. Runtime Client (`@promptly/prompts`)

```typescript
import { createPromptClient } from '@promptly/prompts';

const prompts = createPromptClient({
  apiKey: process.env.PROMPTLY_API_KEY!,
  baseUrl: 'https://api.promptlycms.com', // default
});

// Fetch a prompt
const prompt = await prompts.get('my-prompt-id');
// prompt.systemMessage, prompt.userMessage, prompt.config, etc.

// Fetch a specific version
const prompt = await prompts.get('my-prompt-id', { version: '1.5.1' });

// Get AI SDK-ready params (for text generation)
const params = await prompts.aiParams('my-prompt-id');
// Returns: { system, prompt, temperature, ... }
// Usage: const result = await generateText({ model: anthropic('claude-haiku-4.5'), ...params });

// Get AI SDK-ready params with structured output schema
const params = await prompts.aiParams('my-prompt-id');
// If the prompt has a schema defined, params includes:
// { system, prompt, temperature, output: Output.object({ schema: zodSchema }) }
// Usage: const { output } = await generateText({ model: anthropic('claude-haiku-4.5'), ...params });
```

**Key design decisions:**
- The client does NOT instantiate the AI SDK model — the user provides their own model instance. This avoids coupling to any specific AI provider.
- `aiParams()` returns an object ready to spread into `generateText`/`streamText`. If the prompt has a schema, it includes `output: Output.object({ schema })`.
- The `Output` class is imported from the `ai` package (Vercel AI SDK). The `ai` package should be a **peer dependency**.
- Template variables in messages (e.g. `{{email}}`) should be supported via an optional `variables` parameter: `prompts.aiParams('id', { variables: { email: "..." } })`. Use simple string replacement.

### 2. Codegen CLI (`@promptly/prompts generate`)

A CLI command that connects to the Promptly API at build time and generates typed TypeScript files.

```bash
npx @promptly/prompts generate
```

**How it works:**
1. Reads config from `promptly.config.ts` (or `.js`, `.json`):
   ```typescript
   export default {
     apiKey: process.env.PROMPTLY_API_KEY!,
     prompts: [
       { id: 'xJ_R9PX25bVBxfwBFJOyf', name: 'emailClassifier' },
       { id: 'abc123', name: 'summarizer', version: '2.0.0' },
     ],
     outputDir: './src/generated/prompts', // default
   };
   ```
2. Fetches each prompt from the API
3. Generates a TypeScript file per prompt with:
   - The Zod schema as a typed constant
   - Inferred TypeScript type from the schema
   - Pre-built AI SDK params function
   - Full autocomplete for the output type

**Example generated file (`src/generated/prompts/emailClassifier.ts`):**
```typescript
// Auto-generated by @promptly/prompts — do not edit
import { z } from 'zod';
import { Output } from 'ai';

export const emailClassifierSchema = z.object({
  category: z.enum(['spam', 'important', 'newsletter', 'personal']).describe('Email category'),
  confidence: z.number().min(0).max(1).describe('Classification confidence'),
  summary: z.string().describe('Brief summary'),
});

export type EmailClassifierOutput = z.infer<typeof emailClassifierSchema>;

export const emailClassifierPrompt = {
  promptId: 'xJ_R9PX25bVBxfwBFJOyf',
  promptName: 'Email Classifier',
  version: '1.5.1',
  system: 'You are an email classification assistant...',
  userMessage: 'Classify the following email: {{email}}',
  temperature: 0.7,
  model: 'claude-haiku-4.5',
} as const;

/**
 * Get AI SDK params for the Email Classifier prompt.
 * Spread into generateText/streamText/generateObject.
 */
export const emailClassifierParams = (variables?: { email?: string }) => {
  let prompt = 'Classify the following email: {{email}}';
  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replaceAll(`{{${key}}}`, value ?? '');
    }
  }
  return {
    system: emailClassifierPrompt.system,
    prompt,
    temperature: emailClassifierPrompt.temperature,
    output: Output.object({ schema: emailClassifierSchema }),
  };
};
```

**Usage with full type safety:**
```typescript
import { emailClassifierParams, type EmailClassifierOutput } from './generated/prompts/emailClassifier';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const { output } = await generateText({
  model: anthropic('claude-haiku-4.5'),
  ...emailClassifierParams({ email: userEmail }),
});

// output is fully typed as EmailClassifierOutput
console.log(output.category); // autocomplete: 'spam' | 'important' | 'newsletter' | 'personal'
```

### 3. Package Exports

```
@promptly/prompts           → runtime client (createPromptClient, types)
@promptly/prompts/schema    → buildZodSchema utility (for advanced use)
@promptly/prompts/generate  → CLI entry point
```

## Project Setup

- **Package manager:** Choose the best option for an npm library (bun recommended for dev/test)
- **Build tool:** Choose the best bundler for publishing ESM + CJS (tsup, unbuild, or similar)
- **Testing:** Vitest or bun:test
- **Linting:** Biome
- **TypeScript:** Strict mode
- **Peer dependencies:** `zod` (^3.23), `ai` (^4.0 — Vercel AI SDK)
- **No runtime dependencies** beyond what's needed for fetch (use native fetch)

**package.json exports:**
```json
{
  "name": "@promptly/prompts",
  "exports": {
    ".": { "import": "./dist/index.mjs", "require": "./dist/index.cjs", "types": "./dist/index.d.ts" },
    "./schema": { "import": "./dist/schema.mjs", "require": "./dist/schema.cjs", "types": "./dist/schema.d.ts" }
  },
  "bin": {
    "promptly": "./dist/cli.mjs"
  }
}
```

## Code Style

- No inline if statements — always use braces and newlines
- `type` over `interface` unless extending is needed
- Arrow functions (`const fn = () => {}`) over function declarations
- Minimal dependencies — use native APIs where possible

## What to build (in order)

1. **Project scaffolding** — package.json, tsconfig, biome, build config, .gitignore
2. **Types** — SchemaField, ValidationRule, API response types, client config types
3. **Schema builder** — `buildZodSchema(fields: SchemaField[])` → Zod schema (port the conversion logic described above)
4. **Runtime client** — `createPromptClient()` with `get()` and `aiParams()` methods
5. **Codegen CLI** — `promptly generate` command that reads config and generates typed files
6. **Tests** — unit tests for schema builder, integration tests for client (mock fetch), codegen snapshot tests
7. **Package config** — exports, bin, peer deps, README, publishing setup
