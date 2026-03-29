import { expect, test } from 'bun:test';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import {
  extractTemplateVariables,
  fetchAllComposers,
  fetchAllPrompts,
  generateTypeDeclaration,
} from '../cli/generate.ts';
import {
  createPromptlyClient,
  toCamelCase as toCamelCaseLocal,
} from '../client.ts';
import { PromptlyError } from '../errors.ts';

const API_KEY = process.env.TEST_PROMPT_API_KEY as string;
const PROMPT_ID = process.env.TEST_PROMPT_ID as string;
const COMPOSER_ID = process.env.TEST_COMPOSER_ID as string;

const setupPrompt = () => ({
  client: createPromptlyClient({ apiKey: API_KEY }),
  promptId: PROMPT_ID,
});

const setupComposer = () => ({
  client: createPromptlyClient({ apiKey: API_KEY }),
  composerId: COMPOSER_ID,
});

// --- getPrompt ---

test('smoke: getPrompt() fetches a real prompt', async () => {
  const { client, promptId } = setupPrompt();
  const result = await client.getPrompt(promptId);

  expect(result.promptId).toBe(promptId);
  expect(typeof result.systemMessage).toBe('string');
  expect(typeof result.userMessage).toBe('function');
  expect(typeof result.temperature).toBe('number');
});

test('smoke: getPrompt() userMessage interpolates variables', async () => {
  const { client, promptId } = setupPrompt();
  const result = await client.getPrompt(promptId);

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
});

test('smoke: getPrompts() fetches multiple prompts', async () => {
  const { client, promptId } = setupPrompt();
  const results = await client.getPrompts([{ promptId }]);

  expect(results).toHaveLength(1);
  expect(results[0].promptId).toBe(promptId);
  expect(typeof results[0].userMessage).toBe('function');
  expect(typeof results[0].temperature).toBe('number');
});

test('smoke: getPrompt() resolves language model for anthropic prompt', async () => {
  const client = createPromptlyClient({ apiKey: API_KEY });
  const result = await client.getPrompt('JPxlUpstuhXB5OwOtKPpj');

  expect(result.model).toBeDefined();
  const model = result.model as LanguageModelV3;
  expect(model.specificationVersion).toBe('v3');
  expect(model.provider).toContain('anthropic');
  expect(model.modelId).toContain('claude');
  expect(model.modelId).not.toContain('.');
});

test('smoke: getPrompt() throws PromptlyError for nonexistent prompt', async () => {
  const client = createPromptlyClient({ apiKey: API_KEY });

  try {
    await client.getPrompt('nonexistent-id-xxx');
    expect.unreachable('Expected PromptlyError to be thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(PromptlyError);
    expect((error as PromptlyError).code).toBe('NOT_FOUND');
  }
});

// --- fetchAllPrompts / codegen ---

test('smoke: fetchAllPrompts() returns array of prompts with publishedVersions', async () => {
  const prompts = await fetchAllPrompts(API_KEY);

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

  expect(versions.length).toBeGreaterThan(0);

  for (const pv of versions) {
    expect(typeof pv.version).toBe('string');
    expect(typeof pv.userMessage).toBe('string');
  }

  const currentInVersions = versions.find((pv) => pv.version === first.version);
  expect(currentInVersions).toBeDefined();
});

test('smoke: fetchAllPrompts() includes the test prompt', async () => {
  const prompts = await fetchAllPrompts(API_KEY);
  const match = prompts.find((p) => p.promptId === PROMPT_ID);

  if (!match) {
    expect.unreachable('Expected test prompt to be in results');
    return;
  }

  expect(match.promptId).toBe(PROMPT_ID);
});

test('smoke: fetchAllPrompts() throws PromptlyError for invalid key', async () => {
  try {
    await fetchAllPrompts('invalid-key-xxx');
    expect.unreachable('Expected PromptlyError to be thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(PromptlyError);
    expect((error as PromptlyError).status).toBe(401);
  }
});

test('smoke: generateTypeDeclaration() produces valid declaration from real prompts', async () => {
  const prompts = await fetchAllPrompts(API_KEY);
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
      expect(declaration).toMatch(new RegExp(`${v}: \\w`));
    }

    if (prompt.publishedVersions) {
      for (const pv of prompt.publishedVersions) {
        expect(declaration).toContain(`'${pv.version}'`);
      }
    }
  }
});

// --- Composer smoke tests ---

test('smoke: getComposer() fetches a real composer', async () => {
  const { client, composerId } = setupComposer();
  const result = await client.getComposer(composerId);

  expect(result.composerId).toBe(composerId);
  expect(typeof result.composerName).toBe('string');
  expect(typeof result.version).toBe('string');
  expect(typeof result.config).toBe('object');
  expect(Array.isArray(result.segments)).toBe(true);
  expect(result.segments.length).toBeGreaterThan(0);
});

test('smoke: getComposer() returns prompts array with AI SDK shape', async () => {
  const { client, composerId } = setupComposer();
  const result = await client.getComposer(composerId);

  expect(Array.isArray(result.prompts)).toBe(true);
  expect(result.prompts.length).toBeGreaterThan(0);

  for (const prompt of result.prompts) {
    expect(prompt).toHaveProperty('model');
    expect(prompt).toHaveProperty('system');
    expect(prompt).toHaveProperty('prompt');
    expect(prompt).toHaveProperty('temperature');
    expect(prompt).toHaveProperty('promptId');
    expect(prompt).toHaveProperty('promptName');
    expect(typeof prompt.prompt).toBe('string');
    expect(typeof prompt.temperature).toBe('number');
    expect(typeof prompt.promptId).toBe('string');
    expect(typeof prompt.promptName).toBe('string');
  }
});

test('smoke: getComposer() returns named prompt properties', async () => {
  const { client, composerId } = setupComposer();
  const result = await client.getComposer(composerId);

  for (const prompt of result.prompts) {
    const namedPrompt = (result as Record<string, unknown>)[
      toCamelCaseLocal(prompt.promptName)
    ] as { promptId: string };
    expect(namedPrompt).toBeDefined();
    expect(namedPrompt.promptId).toBe(prompt.promptId);
  }
});

test('smoke: getComposer() resolves language models for prompt segments', async () => {
  const { client, composerId } = setupComposer();
  const result = await client.getComposer(composerId);

  for (const prompt of result.prompts) {
    expect(prompt.model).toBeDefined();
    const model = prompt.model as LanguageModelV3;
    expect(model.specificationVersion).toBe('v3');
    expect(typeof model.provider).toBe('string');
    expect(typeof model.modelId).toBe('string');
  }
});

test('smoke: getComposer() returns formatComposer and compose functions', async () => {
  const { client, composerId } = setupComposer();
  const result = await client.getComposer(composerId);

  expect(typeof result.formatComposer).toBe('function');
  expect(typeof result.compose).toBe('function');
});

test('smoke: compose() runs generate function for each prompt and assembles output', async () => {
  const { client, composerId } = setupComposer();
  const result = await client.getComposer(composerId);

  const calledPromptIds: string[] = [];
  const output = await result.compose(async (prompt) => {
    calledPromptIds.push(prompt.promptId);
    return { text: `[mock:${prompt.promptName}]` };
  });

  expect(calledPromptIds.length).toBe(result.prompts.length);
  for (const prompt of result.prompts) {
    expect(calledPromptIds).toContain(prompt.promptId);
  }

  expect(typeof output).toBe('string');
  expect(output.length).toBeGreaterThan(0);
  for (const prompt of result.prompts) {
    expect(output).toContain(`[mock:${prompt.promptName}]`);
  }
});

test('smoke: formatComposer() assembles output from prompt results', async () => {
  const { client, composerId } = setupComposer();
  const result = await client.getComposer(composerId);

  const results: Record<string, string> = {};
  for (const prompt of result.prompts) {
    results[toCamelCaseLocal(prompt.promptName)] =
      `[text:${prompt.promptName}]`;
  }

  const output = result.formatComposer(results);

  expect(typeof output).toBe('string');
  expect(output.length).toBeGreaterThan(0);
  for (const prompt of result.prompts) {
    expect(output).toContain(`[text:${prompt.promptName}]`);
  }
});

test('smoke: getComposers() fetches multiple composers in parallel', async () => {
  const { client, composerId } = setupComposer();
  const results = await client.getComposers([{ composerId }]);

  expect(results).toHaveLength(1);
  expect(results[0].composerId).toBe(composerId);
  expect(results[0].prompts.length).toBeGreaterThan(0);
  expect(typeof results[0].formatComposer).toBe('function');
  expect(typeof results[0].compose).toBe('function');
});

test('smoke: getComposer() throws PromptlyError for nonexistent composer', async () => {
  const client = createPromptlyClient({ apiKey: API_KEY });

  try {
    await client.getComposer('nonexistent-id-xxx');
    expect.unreachable('Expected PromptlyError to be thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(PromptlyError);
    expect((error as PromptlyError).code).toBe('NOT_FOUND');
  }
});

// --- fetchAllComposers / codegen ---

test('smoke: fetchAllComposers() returns array of composers', async () => {
  const composers = await fetchAllComposers(API_KEY);

  expect(Array.isArray(composers)).toBe(true);
  expect(composers.length).toBeGreaterThan(0);

  const first = composers[0];
  if (!first) {
    expect.unreachable('Expected at least one composer');
    return;
  }

  expect(typeof first.composerId).toBe('string');
  expect(typeof first.composerName).toBe('string');
  expect(typeof first.version).toBe('string');
  expect(typeof first.config).toBe('object');
  expect(Array.isArray(first.segments)).toBe(true);
  expect(first.segments.length).toBeGreaterThan(0);

  for (const segment of first.segments) {
    expect(['static', 'prompt']).toContain(segment.type);
    if (segment.type === 'static') {
      expect(typeof segment.content).toBe('string');
    }
    if (segment.type === 'prompt') {
      expect(typeof segment.promptId).toBe('string');
      expect(typeof segment.promptName).toBe('string');
      expect(typeof segment.version).toBe('string');
    }
  }
});

test('smoke: fetchAllComposers() includes the test composer', async () => {
  const composers = await fetchAllComposers(API_KEY);
  const match = composers.find((c) => c.composerId === COMPOSER_ID);

  if (!match) {
    expect.unreachable('Expected test composer to be in results');
    return;
  }

  expect(match.composerId).toBe(COMPOSER_ID);
});

test('smoke: generateTypeDeclaration() includes composer types from real composers', async () => {
  const [prompts, composers] = await Promise.all([
    fetchAllPrompts(API_KEY),
    fetchAllComposers(API_KEY),
  ]);

  const declaration = generateTypeDeclaration(prompts, composers);

  expect(declaration).toContain('interface ComposerVariableMap');
  expect(declaration).toContain('interface ComposerPromptMap');

  for (const composer of composers) {
    expect(declaration).toContain(`'${composer.composerId}'`);
  }
});
