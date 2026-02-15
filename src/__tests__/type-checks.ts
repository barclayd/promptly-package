// Type-level tests — checked by `bun run types` (tsgo --noEmit).
// These catch type regressions before publication.
// NOT a runtime test file — bun test will not execute this.

import type { LanguageModel } from 'ai';
import type { AiParams, PromptlyClient, PromptResult } from '../types.ts';

// --- Type assertion helpers ---

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

// --- Module augmentation (simulates generated promptly-env.d.ts) ---

declare module '../types.ts' {
  interface PromptVariableMap {
    'type-test-prompt': {
      latest: { city: string; country: string };
      '1.0.0': { name: string };
      '2.0.0': { city: string; country: string };
    };
  }
}

declare const client: PromptlyClient;

// --- model may be undefined when auto-resolution fails ---

type _ModelOnResult = Expect<
  Equal<PromptResult['model'], LanguageModel | undefined>
>;
type _ModelOnAiParams = Expect<
  Equal<AiParams['model'], LanguageModel | undefined>
>;

// --- getPrompt() without version → latest variables ---

async () => {
  const result = await client.getPrompt('type-test-prompt');
  type Vars = Parameters<typeof result.userMessage>[0];
  type _Check = Expect<Equal<Vars, { city: string; country: string }>>;
};

// --- getPrompt() with known version → that version's variables ---

async () => {
  const result = await client.getPrompt('type-test-prompt', {
    version: '1.0.0',
  });
  type Vars = Parameters<typeof result.userMessage>[0];
  type _Check = Expect<Equal<Vars, { name: string }>>;
};

async () => {
  const result = await client.getPrompt('type-test-prompt', {
    version: '2.0.0',
  });
  type Vars = Parameters<typeof result.userMessage>[0];
  type _Check = Expect<Equal<Vars, { city: string; country: string }>>;
};

// --- getPrompt() with unknown version on known prompt → type error ---

async () => {
  // @ts-expect-error — '9.9.9' is not a codegen-known version
  await client.getPrompt('type-test-prompt', { version: '9.9.9' });
};

// --- getPrompt() with unknown promptId → Record<string, string> fallback (any version accepted) ---

async () => {
  const result = await client.getPrompt('unknown-prompt-id');
  type Vars = Parameters<typeof result.userMessage>[0];
  type _Check = Expect<Equal<Vars, Record<string, string>>>;
};

async () => {
  const result = await client.getPrompt('unknown-prompt-id', {
    version: '1.0.0',
  });
  type Vars = Parameters<typeof result.userMessage>[0];
  type _Check = Expect<Equal<Vars, Record<string, string>>>;
};

// --- getPrompts() types each position correctly ---

async () => {
  const [latest, versioned] = await client.getPrompts([
    { promptId: 'type-test-prompt' },
    { promptId: 'type-test-prompt', version: '1.0.0' },
  ]);

  type LatestVars = Parameters<typeof latest.userMessage>[0];
  type _LatestCheck = Expect<
    Equal<LatestVars, { city: string; country: string }>
  >;

  type VersionedVars = Parameters<typeof versioned.userMessage>[0];
  type _VersionedCheck = Expect<Equal<VersionedVars, { name: string }>>;
};

// --- Wrong variables for a version are rejected ---

async () => {
  const v1 = await client.getPrompt('type-test-prompt', { version: '1.0.0' });
  // @ts-expect-error — v1.0.0 has { name }, not { city, country }
  v1.userMessage({ city: 'London', country: 'UK' });

  const latest = await client.getPrompt('type-test-prompt');
  // @ts-expect-error — latest has { city, country }, not { name }
  latest.userMessage({ name: 'Alice' });
};

// --- aiParams() narrows variables by version ---

async () => {
  // latest variables accepted without version
  await client.aiParams('type-test-prompt', {
    variables: { city: 'London', country: 'UK' },
  });

  // v1.0.0 variables accepted with matching version
  await client.aiParams('type-test-prompt', {
    version: '1.0.0',
    variables: { name: 'Alice' },
  });

  await client.aiParams('type-test-prompt', {
    version: '1.0.0',
    // @ts-expect-error — latest variables rejected for v1.0.0
    variables: { city: 'London', country: 'UK' },
  });
};
