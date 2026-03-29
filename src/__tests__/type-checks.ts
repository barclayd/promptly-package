// Type-level tests — checked by `bun run types` (tsgo --noEmit).
// These catch type regressions before publication.
// NOT a runtime test file — bun test will not execute this.

import type { LanguageModel } from 'ai';
import type { ComposerPrompt, PromptlyClient, PromptResult } from '../types.ts';

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
  interface ComposerVariableMap {
    'type-test-composer': {
      latest: { text: string; targetLang: string };
      '1.0.0': { text: string; targetLang: string };
    };
  }
  interface ComposerPromptMap {
    'type-test-composer': 'introPrompt' | 'reviewPrompt';
  }
}

declare const client: PromptlyClient;

// --- model is required (resolver throws on failure) ---

type _ModelOnResult = Expect<Equal<PromptResult['model'], LanguageModel>>;

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

// --- getPrompt() with unknown promptId → Record<string, unknown> fallback (any version accepted) ---

async () => {
  const result = await client.getPrompt('unknown-prompt-id');
  type Vars = Parameters<typeof result.userMessage>[0];
  type _Check = Expect<Equal<Vars, Record<string, unknown>>>;
};

async () => {
  const result = await client.getPrompt('unknown-prompt-id', {
    version: '1.0.0',
  });
  type Vars = Parameters<typeof result.userMessage>[0];
  type _Check = Expect<Equal<Vars, Record<string, unknown>>>;
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

// --- ComposerResult has correct model type ---

type _ComposerPromptModel = Expect<
  Equal<ComposerPrompt['model'], LanguageModel>
>;

// --- getComposer() without version → latest input ---

async () => {
  const result = await client.getComposer('type-test-composer', {
    input: { text: 'hello', targetLang: 'French' },
  });
  type _HasComposerId = Expect<Equal<typeof result.composerId, string>>;
  type _HasVersion = Expect<Equal<typeof result.version, string>>;

  // formatComposer accepts keyed results
  const _output: string = result.formatComposer({
    introPrompt: { text: 'hello' },
    reviewPrompt: 'world',
  });
};

// --- getComposer() with unknown composerId → Record<string, unknown> fallback ---

async () => {
  const result = await client.getComposer('unknown-composer-id');
  type _ComposerId = Expect<Equal<typeof result.composerId, string>>;
};

// --- getComposers() returns array ---

async () => {
  const results = await client.getComposers([
    { composerId: 'type-test-composer' },
    { composerId: 'other' },
  ]);
  // Each position in the tuple is a ComposerResult
  type _First = Expect<Equal<(typeof results)[0]['composerId'], string>>;
  type _Second = Expect<Equal<(typeof results)[1]['composerId'], string>>;
};
