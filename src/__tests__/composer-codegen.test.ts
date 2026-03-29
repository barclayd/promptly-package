import { expect, test } from 'bun:test';
import {
  extractComposerPromptNames,
  extractComposerVariables,
  generateTypeDeclaration,
} from '../cli/generate.ts';
import type {
  ComposerResponse,
  PromptResponse,
  SchemaField,
} from '../types.ts';

const mockComposer = (
  overrides?: Partial<ComposerResponse>,
): ComposerResponse => ({
  composerId: 'comp-test',
  composerName: 'Test Composer',
  version: '1.0.0',
  config: {
    schema: [],
    inputData: null,
    inputDataRootName: null,
  },
  segments: [
    { type: 'static', content: '<p>Hello</p>' },
    {
      type: 'prompt',
      promptId: 'p1',
      promptName: 'Intro Prompt',
      version: '1.0.0',
      systemMessage: null,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      userMessage: 'Write about ${topic} for ${name}.',
      config: { model: 'claude-haiku-4.5', temperature: 0.7 },
    },
    {
      type: 'prompt',
      promptId: 'p2',
      promptName: 'Review Prompt',
      version: '1.0.0',
      systemMessage: null,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      userMessage: 'Review ${topic}.',
      config: { model: 'claude-sonnet-4.5', temperature: 0.5 },
    },
  ],
  ...overrides,
});

const mockPrompt = (overrides?: Partial<PromptResponse>): PromptResponse => ({
  promptId: 'prompt-test',
  promptName: 'Test Prompt',
  version: '1.0.0',
  systemMessage: 'System message.',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
  userMessage: 'Hello ${name}.',
  config: {
    model: 'claude-haiku-4.5',
    temperature: 0.7,
    schema: [],
    inputData: null,
    inputDataRootName: null,
  },
  ...overrides,
});

// --- extractComposerVariables ---

test('extractComposerVariables: extracts variables from prompt segments', () => {
  const vars = extractComposerVariables(mockComposer());
  expect(vars).toContain('topic');
  expect(vars).toContain('name');
});

test('extractComposerVariables: deduplicates across segments', () => {
  const vars = extractComposerVariables(mockComposer());
  const topicCount = vars.filter((v) => v === 'topic').length;
  expect(topicCount).toBe(1);
});

test('extractComposerVariables: returns empty for static-only composer', () => {
  const vars = extractComposerVariables(
    mockComposer({
      segments: [{ type: 'static', content: '<p>Hello</p>' }],
    }),
  );
  expect(vars).toEqual([]);
});

test('extractComposerVariables: handles prompt with null userMessage', () => {
  const vars = extractComposerVariables(
    mockComposer({
      segments: [
        {
          type: 'prompt',
          promptId: 'p1',
          promptName: 'Test',
          version: '1.0.0',
          systemMessage: null,
          userMessage: null,
          config: {},
        },
      ],
    }),
  );
  expect(vars).toEqual([]);
});

// --- extractComposerPromptNames ---

test('extractComposerPromptNames: returns camelCased names', () => {
  const names = extractComposerPromptNames(mockComposer());
  expect(names).toEqual(['introPrompt', 'reviewPrompt']);
});

test('extractComposerPromptNames: deduplicates repeated prompts', () => {
  const names = extractComposerPromptNames(
    mockComposer({
      segments: [
        {
          type: 'prompt',
          promptId: 'p1',
          promptName: 'Intro Prompt',
          version: '1.0.0',
          systemMessage: null,
          userMessage: 'Hello.',
          config: {},
        },
        { type: 'static', content: '<hr>' },
        {
          type: 'prompt',
          promptId: 'p1',
          promptName: 'Intro Prompt',
          version: '1.0.0',
          systemMessage: null,
          userMessage: 'Hello.',
          config: {},
        },
      ],
    }),
  );
  expect(names).toEqual(['introPrompt']);
});

test('extractComposerPromptNames: returns empty for static-only composer', () => {
  const names = extractComposerPromptNames(
    mockComposer({
      segments: [{ type: 'static', content: '<p>Hello</p>' }],
    }),
  );
  expect(names).toEqual([]);
});

// --- generateTypeDeclaration with composers ---

test('generateTypeDeclaration: includes ComposerVariableMap for composers', () => {
  const output = generateTypeDeclaration([], [mockComposer()]);
  expect(output).toContain('interface ComposerVariableMap');
  expect(output).toContain("'comp-test'");
  expect(output).toContain('topic: string;');
  expect(output).toContain('name: string;');
});

test('generateTypeDeclaration: includes ComposerPromptMap for composers', () => {
  const output = generateTypeDeclaration([], [mockComposer()]);
  expect(output).toContain('interface ComposerPromptMap');
  expect(output).toContain("'introPrompt' | 'reviewPrompt'");
});

test('generateTypeDeclaration: omits composer interfaces when no composers', () => {
  const output = generateTypeDeclaration([mockPrompt()]);
  expect(output).not.toContain('ComposerVariableMap');
  expect(output).not.toContain('ComposerPromptMap');
});

test('generateTypeDeclaration: handles composers with no variables', () => {
  const output = generateTypeDeclaration(
    [],
    [
      mockComposer({
        segments: [
          {
            type: 'prompt',
            promptId: 'p1',
            promptName: 'Static Prompt',
            version: '1.0.0',
            systemMessage: null,
            userMessage: 'No variables here.',
            config: {},
          },
        ],
      }),
    ],
  );
  expect(output).toContain('Record<string, never>');
});

test('generateTypeDeclaration: handles both prompts and composers together', () => {
  const output = generateTypeDeclaration([mockPrompt()], [mockComposer()]);
  expect(output).toContain('interface PromptVariableMap');
  expect(output).toContain("'prompt-test'");
  expect(output).toContain('interface ComposerVariableMap');
  expect(output).toContain("'comp-test'");
  expect(output).toContain('interface ComposerPromptMap');
});

test('generateTypeDeclaration: includes published versions in composer mapped type', () => {
  const output = generateTypeDeclaration(
    [],
    [
      mockComposer({
        publishedVersions: [{ version: '1.0.0' }, { version: '2.0.0' }],
      }),
    ],
  );
  expect(output).toContain("'latest'");
  expect(output).toContain("'1.0.0'");
  expect(output).toContain("'2.0.0'");
});

test('generateTypeDeclaration: handles composer with never prompt map', () => {
  const output = generateTypeDeclaration(
    [],
    [mockComposer({ segments: [{ type: 'static', content: '<p>Hi</p>' }] })],
  );
  expect(output).toContain("'comp-test': never;");
});

test('generateTypeDeclaration: uses schema types for composer variables', () => {
  const schema: SchemaField[] = [
    { id: 'topic', name: 'topic', type: 'string', validations: [], params: {} },
    { id: 'name', name: 'name', type: 'string', validations: [], params: {} },
    {
      id: 'count',
      name: 'count',
      type: 'number',
      validations: [],
      params: {},
    },
  ];
  const output = generateTypeDeclaration(
    [],
    [
      mockComposer({
        config: { schema, inputData: null, inputDataRootName: null },
        segments: [
          {
            type: 'prompt',
            promptId: 'p1',
            promptName: 'Intro',
            version: '1.0.0',
            systemMessage: null,
            // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
            userMessage: '${topic} for ${name} x${count}',
            config: {},
          },
        ],
      }),
    ],
  );
  expect(output).toContain('topic: string;');
  expect(output).toContain('name: string;');
  expect(output).toContain('count: number;');
});
