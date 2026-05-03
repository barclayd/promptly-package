import { afterEach, expect, test } from 'bun:test';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate, generateTypeDeclaration } from '../cli/generate.ts';
import type { PromptResponse } from '../types.ts';

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const originalLog = console.log;

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  console.log = originalLog;
});

const promptResponse = (): PromptResponse => ({
  promptId: 'prompt-1',
  promptName: 'Test Prompt',
  version: '1.0.0',
  systemMessage: 'System.',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
  userMessage: 'Hello ${name}.',
  config: {
    model: 'claude-haiku-4.5',
    temperature: 0.7,
    schema: [],
    inputData: null,
    inputDataRootName: null,
  },
});

const setupFetchMock = (composersStatus: number, composersBody: unknown) => {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/composers')) {
      return new Response(JSON.stringify(composersBody), {
        status: composersStatus,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/prompts')) {
      return new Response(JSON.stringify([promptResponse()]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
};

const captureWarnings = (): { warnings: string[]; restore: () => void } => {
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  console.log = () => {};
  return {
    warnings,
    restore: () => {
      console.warn = originalWarn;
      console.log = originalLog;
    },
  };
};

test('generate() warns and continues when fetchAllComposers throws PromptlyError', async () => {
  setupFetchMock(422, {
    error: 'Cannot list composers: unresolved prompt references',
    code: 'UNRESOLVED_PROMPT',
  });
  const { warnings } = captureWarnings();

  const outputPath = join(
    tmpdir(),
    `promptly-env-${Date.now()}-${Math.random().toString(36).slice(2)}.d.ts`,
  );

  try {
    await generate('test-key', outputPath, 'https://api.example.com');

    const detailsWarning = warnings.find((w) =>
      w.includes('failed to fetch composers'),
    );
    expect(detailsWarning).toBeDefined();
    expect(detailsWarning).toContain('UNRESOLVED_PROMPT');
    expect(detailsWarning).toContain('HTTP 422');
    expect(detailsWarning).toContain(
      'Cannot list composers: unresolved prompt references',
    );

    const omitWarning = warnings.find((w) =>
      w.includes('Composer types will be omitted'),
    );
    expect(omitWarning).toBeDefined();

    const content = await readFile(outputPath, 'utf-8');
    expect(content).toContain('interface PromptVariableMap {');
    expect(content).toContain("'prompt-1':");
    expect(content).toContain('interface ComposerVariableMap {');
    expect(content).toContain('interface ComposerPromptMap {');
  } finally {
    await rm(outputPath, { force: true });
  }
});

test('generateTypeDeclaration() emits empty ComposerVariableMap/ComposerPromptMap when composers is []', () => {
  const result = generateTypeDeclaration([promptResponse()], []);

  expect(result).toContain('interface PromptVariableMap {');
  expect(result).toContain('interface ComposerVariableMap {');
  expect(result).toContain('interface ComposerPromptMap {');
});
