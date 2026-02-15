import { expect, test } from 'bun:test';
import {
  extractTemplateVariables,
  fetchAllPrompts,
  generateTypeDeclaration,
} from '../cli/generate.ts';
import { createPromptlyClient } from '../client.ts';
import { PromptlyError } from '../errors.ts';

const TEST_API_KEY = process.env.TEST_PROMPT_API_KEY;
const TEST_PROMPT_ID = process.env.TEST_PROMPT_ID;
const hasEnv = Boolean(TEST_API_KEY && TEST_PROMPT_ID);

const setupWithEnv = () => {
  const apiKey = TEST_API_KEY;
  const promptId = TEST_PROMPT_ID;
  if (!apiKey || !promptId) {
    throw new Error('TEST_PROMPT_API_KEY and TEST_PROMPT_ID required');
  }
  return { client: createPromptlyClient({ apiKey }), promptId };
};

const setupApiKey = () => {
  const apiKey = TEST_API_KEY;
  if (!apiKey) {
    throw new Error('TEST_PROMPT_API_KEY required');
  }
  return apiKey;
};

test.skipIf(!hasEnv)('smoke: get() fetches a real prompt', async () => {
  const { client, promptId } = setupWithEnv();
  const result = await client.get(promptId);

  expect(result.promptId).toBe(promptId);
  expect(typeof result.systemMessage).toBe('string');
  expect(typeof result.userMessage).toBe('function');
  expect(typeof result.temperature).toBe('number');
});

test.skipIf(!hasEnv)(
  'smoke: get() userMessage interpolates variables',
  async () => {
    const { client, promptId } = setupWithEnv();
    const result = await client.get(promptId);

    const template = String(result.userMessage);
    expect(typeof template).toBe('string');

    const varMatches = template.matchAll(/\$\{(\w+)\}/g);
    const variables: Record<string, string> = {};
    for (const match of varMatches) {
      if (match[1]) {
        variables[match[1]] = `test-${match[1]}`;
      }
    }

    if (Object.keys(variables).length > 0) {
      const interpolated = result.userMessage(variables);
      for (const [key, value] of Object.entries(variables)) {
        expect(interpolated).toContain(value);
        expect(interpolated).not.toContain(`\${${key}}`);
      }
    }
  },
);

test.skipIf(!hasEnv)(
  'smoke: getPrompts() fetches multiple prompts',
  async () => {
    const { client, promptId } = setupWithEnv();
    const results = await client.getPrompts([{ promptId }]);

    expect(results).toHaveLength(1);
    expect(results[0].promptId).toBe(promptId);
    expect(typeof results[0].userMessage).toBe('function');
    expect(typeof results[0].temperature).toBe('number');
  },
);

test.skipIf(!hasEnv)('smoke: aiParams() returns AI SDK params', async () => {
  const { client, promptId } = setupWithEnv();
  const params = await client.aiParams(promptId);

  expect(typeof params.system).toBe('string');
  expect(typeof params.prompt).toBe('string');
  expect(typeof params.temperature).toBe('number');
});

test.skipIf(!TEST_API_KEY)(
  'smoke: get() throws PromptlyError for nonexistent prompt',
  async () => {
    const apiKey = setupApiKey();
    const client = createPromptlyClient({ apiKey });

    try {
      await client.get('nonexistent-id-xxx');
      expect.unreachable('Expected PromptlyError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PromptlyError);
      expect((error as PromptlyError).code).toBe('NOT_FOUND');
    }
  },
);

// --- fetchAllPrompts / codegen ---

test.skipIf(!TEST_API_KEY)(
  'smoke: fetchAllPrompts() returns array of prompts with publishedVersions',
  async () => {
    const apiKey = setupApiKey();
    const prompts = await fetchAllPrompts(apiKey);

    expect(Array.isArray(prompts)).toBe(true);
    expect(prompts.length).toBeGreaterThan(0);

    const first = prompts[0];
    if (!first) {
      expect.unreachable('Expected at least one prompt');
      return;
    }

    expect(typeof first.promptId).toBe('string');
    expect(typeof first.systemMessage).toBe('string');
    expect(typeof first.userMessage).toBe('string');
    expect(typeof first.config).toBe('object');
    expect(typeof first.config.temperature).toBe('number');
    expect(typeof first.config.model).toBe('string');

    const versions = first.publishedVersions;
    if (!versions) {
      expect.unreachable('Expected publishedVersions to be present');
      return;
    }

    // Verify publishedVersions is present (include_versions=true)
    expect(versions.length).toBeGreaterThan(0);

    for (const pv of versions) {
      expect(typeof pv.version).toBe('string');
      expect(typeof pv.userMessage).toBe('string');
    }

    // Current version should appear in publishedVersions
    const currentInVersions = versions.find(
      (pv) => pv.version === first.version,
    );
    expect(currentInVersions).toBeDefined();
  },
);

test.skipIf(!hasEnv)(
  'smoke: fetchAllPrompts() includes the test prompt',
  async () => {
    const { promptId } = setupWithEnv();
    const apiKey = setupApiKey();
    const prompts = await fetchAllPrompts(apiKey);
    const match = prompts.find((p) => p.promptId === promptId);

    if (!match) {
      expect.unreachable('Expected test prompt to be in results');
      return;
    }

    expect(match.promptId).toBe(promptId);
  },
);

test.skipIf(!TEST_API_KEY)(
  'smoke: fetchAllPrompts() throws PromptlyError for invalid key',
  async () => {
    try {
      await fetchAllPrompts('invalid-key-xxx');
      expect.unreachable('Expected PromptlyError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PromptlyError);
      expect((error as PromptlyError).status).toBe(401);
    }
  },
);

test.skipIf(!TEST_API_KEY)(
  'smoke: generateTypeDeclaration() produces valid declaration from real prompts',
  async () => {
    const apiKey = setupApiKey();
    const prompts = await fetchAllPrompts(apiKey);
    const declaration = generateTypeDeclaration(prompts);

    expect(declaration).toContain(
      '// Auto-generated by @promptlycms/prompts — do not edit',
    );
    expect(declaration).toContain("declare module '@promptlycms/prompts'");
    expect(declaration).toContain('interface PromptVariableMap');

    for (const prompt of prompts) {
      expect(declaration).toContain(`'${prompt.promptId}'`);
      expect(declaration).toContain("'latest'");
      const vars = extractTemplateVariables(prompt.userMessage);
      for (const v of vars) {
        expect(declaration).toContain(`${v}: string;`);
      }

      // Verify per-version entries from publishedVersions
      if (prompt.publishedVersions) {
        for (const pv of prompt.publishedVersions) {
          expect(declaration).toContain(`'${pv.version}'`);
        }
      }
    }
  },
);
