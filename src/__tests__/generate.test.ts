import { expect, test } from 'bun:test';
import {
  compareSemver,
  extractTemplateVariables,
  generateTypeDeclaration,
  groupAndSortVersions,
  schemaFieldToTsType,
} from '../cli/generate.ts';
import type { PromptResponse, SchemaField } from '../types.ts';

const field = (
  name: string,
  type: string,
  params: SchemaField['params'] = {},
): SchemaField => ({
  id: name,
  name,
  type,
  validations: [],
  params,
});

const makePrompt = (
  overrides: Partial<PromptResponse> = {},
): PromptResponse => ({
  promptId: 'test-id-123',
  promptName: 'Test Prompt',
  version: '1.0.0',
  systemMessage: 'You are a helpful assistant.',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
  userMessage: 'Hello ${name}, help with ${task}.',
  config: {
    model: 'claude-haiku-4.5',
    temperature: 0.7,
    schema: [],
    inputData: null,
    inputDataRootName: null,
  },
  ...overrides,
});

// --- extractTemplateVariables ---

test('extractTemplateVariables: extracts variables from template string', () => {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
  const result = extractTemplateVariables('Hello ${name}, help with ${task}.');
  expect(result).toEqual(['name', 'task']);
});

test('extractTemplateVariables: returns empty array for no variables', () => {
  const result = extractTemplateVariables('Hello world.');
  expect(result).toEqual([]);
});

test('extractTemplateVariables: deduplicates repeated variables', () => {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
  const result = extractTemplateVariables('${name} and ${name} and ${other}');
  expect(result).toEqual(['name', 'other']);
});

// --- compareSemver ---

test('compareSemver: returns negative when a < b', () => {
  expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0);
});

test('compareSemver: returns positive when a > b', () => {
  expect(compareSemver('2.0.0', '1.0.0')).toBeGreaterThan(0);
});

test('compareSemver: returns 0 for equal versions', () => {
  expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
});

test('compareSemver: compares minor versions', () => {
  expect(compareSemver('1.1.0', '1.2.0')).toBeLessThan(0);
});

test('compareSemver: compares patch versions', () => {
  expect(compareSemver('1.0.1', '1.0.2')).toBeLessThan(0);
});

// --- groupAndSortVersions ---

test('groupAndSortVersions: deduplicates versions with identical variables', () => {
  const prompt = makePrompt({
    version: '2.0.0',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
    userMessage: '${a} ${b}',
    publishedVersions: [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      { version: '1.0.0', userMessage: '${a} ${b}' },
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      { version: '1.1.0', userMessage: '${a} ${b}' },
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      { version: '2.0.0', userMessage: '${a} ${b}' },
    ],
  });
  const groups = groupAndSortVersions(prompt);

  expect(groups).toHaveLength(1);
  expect(groups[0]?.versions).toEqual(['latest', '2.0.0', '1.1.0', '1.0.0']);
  expect(groups[0]?.variables).toEqual(['a', 'b']);
});

test('groupAndSortVersions: sorts versions descending within group', () => {
  const prompt = makePrompt({
    version: '3.0.0',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
    userMessage: '${x}',
    publishedVersions: [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      { version: '1.0.0', userMessage: '${x}' },
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      { version: '3.0.0', userMessage: '${x}' },
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      { version: '2.0.0', userMessage: '${x}' },
    ],
  });
  const groups = groupAndSortVersions(prompt);

  expect(groups).toHaveLength(1);
  expect(groups[0]?.versions).toEqual(['latest', '3.0.0', '2.0.0', '1.0.0']);
});

test('groupAndSortVersions: sorts groups with latest first then by highest version', () => {
  const prompt = makePrompt({
    version: '2.0.0',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
    userMessage: '${a} ${b}',
    publishedVersions: [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      { version: '1.0.0', userMessage: '${x}' },
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      { version: '1.1.0', userMessage: '${x}' },
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      { version: '2.0.0', userMessage: '${a} ${b}' },
    ],
  });
  const groups = groupAndSortVersions(prompt);

  expect(groups).toHaveLength(2);
  expect(groups[0]?.versions).toEqual(['latest', '2.0.0']);
  expect(groups[0]?.variables).toEqual(['a', 'b']);
  expect(groups[1]?.versions).toEqual(['1.1.0', '1.0.0']);
  expect(groups[1]?.variables).toEqual(['x']);
});

// --- generateTypeDeclaration ---

test('generateTypeDeclaration: generates correct declare module block', () => {
  const prompts = [makePrompt()];
  const result = generateTypeDeclaration(prompts);

  expect(result).toContain(
    '// Auto-generated by @promptlycms/prompts — do not edit',
  );
  expect(result).toContain("import '@promptlycms/prompts';");
  expect(result).toContain("declare module '@promptlycms/prompts' {");
  expect(result).toContain('interface PromptVariableMap {');
  expect(result).toContain("'test-id-123': {");
  expect(result).toContain("'latest'");
  expect(result).toContain('name: string;');
  expect(result).toContain('task: string;');
});

test('generateTypeDeclaration: handles prompts with no template variables', () => {
  const prompts = [
    makePrompt({
      promptId: 'no-vars',
      userMessage: 'Hello world, no variables here.',
    }),
  ];
  const result = generateTypeDeclaration(prompts);

  expect(result).toContain("'latest'");
  expect(result).toContain('Record<string, never>');
});

test('generateTypeDeclaration: handles multiple prompts', () => {
  const prompts = [
    makePrompt({
      promptId: 'prompt-a',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      userMessage: 'Hello ${name}.',
    }),
    makePrompt({
      promptId: 'prompt-b',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      userMessage: 'Email ${email} about ${subject}.',
    }),
  ];
  const result = generateTypeDeclaration(prompts);

  expect(result).toContain("'prompt-a': {");
  expect(result).toContain("'prompt-b': {");
  expect(result).toContain('name: string;');
  expect(result).toContain('email: string;');
  expect(result).toContain('subject: string;');
});

test('generateTypeDeclaration: generates valid TypeScript syntax without publishedVersions', () => {
  const prompts = [
    makePrompt({
      promptId: 'JPxlUpstuhXB5OwOtKPpj',
      userMessage:
        // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
        '${pickupLocation} with ${items} and ${movesCount} in ${movesTimePeriod}',
    }),
  ];
  const result = generateTypeDeclaration(prompts);

  const expected = `// Auto-generated by @promptlycms/prompts — do not edit
import '@promptlycms/prompts';

declare module '@promptlycms/prompts' {
  interface PromptVariableMap {
    'JPxlUpstuhXB5OwOtKPpj': {
      [V in
        | 'latest'
        | '1.0.0']: {
        pickupLocation: string;
        items: string;
        movesCount: string;
        movesTimePeriod: string;
      };
    };
  }
  interface ComposerVariableMap {
  }
  interface ComposerPromptMap {
  }
}
`;

  expect(result).toBe(expected);
});

test('generateTypeDeclaration: generates intersection with publishedVersions', () => {
  const prompts = [
    makePrompt({
      promptId: 'multi-ver',
      version: '2.0.0',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      userMessage: '${pickupLocation} with ${items}',
      publishedVersions: [
        // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
        { version: '1.0.0', userMessage: 'Hello ${name}' },
        // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
        { version: '2.0.0', userMessage: '${pickupLocation} with ${items}' },
      ],
    }),
  ];
  const result = generateTypeDeclaration(prompts);

  const expected = `// Auto-generated by @promptlycms/prompts — do not edit
import '@promptlycms/prompts';

declare module '@promptlycms/prompts' {
  interface PromptVariableMap {
    'multi-ver': {
      [V in
        | 'latest'
        | '2.0.0']: {
        pickupLocation: string;
        items: string;
      };
    } & {
      [V in '1.0.0']: {
        name: string;
      };
    };
  }
  interface ComposerVariableMap {
  }
  interface ComposerPromptMap {
  }
}
`;

  expect(result).toBe(expected);
});

test('generateTypeDeclaration: handles publishedVersions with no variables', () => {
  const prompts = [
    makePrompt({
      promptId: 'no-vars-versioned',
      version: '1.0.0',
      userMessage: 'No variables here.',
      publishedVersions: [
        { version: '1.0.0', userMessage: 'No variables here.' },
      ],
    }),
  ];
  const result = generateTypeDeclaration(prompts);

  expect(result).toContain("'latest'");
  expect(result).toContain("'1.0.0'");
  expect(result).toContain('Record<string, never>');
});

test('generateTypeDeclaration: creates intersection for different variable groups', () => {
  const prompt = makePrompt({
    promptId: 'multi-group',
    version: '3.0.0',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
    userMessage: '${a} ${b} ${c}',
    publishedVersions: [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      { version: '1.0.0', userMessage: '${a}' },
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      { version: '1.1.0', userMessage: '${a}' },
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      { version: '2.0.0', userMessage: '${a} ${b}' },
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      { version: '3.0.0', userMessage: '${a} ${b} ${c}' },
    ],
  });
  const result = generateTypeDeclaration([prompt]);

  expect(result).toContain('} & {');
  expect(result).toContain("'latest'");
  expect(result).toContain("'3.0.0'");
  expect(result).toContain("'2.0.0'");
  expect(result).toContain("'1.1.0'");
  expect(result).toContain("'1.0.0'");
});

// --- schemaFieldToTsType ---

test('schemaFieldToTsType: returns string for undefined field', () => {
  expect(schemaFieldToTsType(undefined)).toBe('string');
});

test('schemaFieldToTsType: returns string for string field', () => {
  expect(schemaFieldToTsType(field('x', 'string'))).toBe('string');
});

test('schemaFieldToTsType: returns number for number field', () => {
  expect(schemaFieldToTsType(field('x', 'number'))).toBe('number');
});

test('schemaFieldToTsType: returns boolean for boolean field', () => {
  expect(schemaFieldToTsType(field('x', 'boolean'))).toBe('boolean');
});

test('schemaFieldToTsType: returns string[] for array of strings', () => {
  expect(
    schemaFieldToTsType(field('x', 'array', { elementType: 'string' })),
  ).toBe('string[]');
});

test('schemaFieldToTsType: returns number[] for array of numbers', () => {
  expect(
    schemaFieldToTsType(field('x', 'array', { elementType: 'number' })),
  ).toBe('number[]');
});

test('schemaFieldToTsType: returns string[] for array with no elementType', () => {
  expect(schemaFieldToTsType(field('x', 'array'))).toBe('string[]');
});

test('schemaFieldToTsType: returns enum union for enum field', () => {
  expect(
    schemaFieldToTsType(
      field('x', 'enum', { enumValues: ['red', 'green', 'blue'] }),
    ),
  ).toBe("'red' | 'green' | 'blue'");
});

test('schemaFieldToTsType: returns Record for object field', () => {
  expect(schemaFieldToTsType(field('x', 'object'))).toBe(
    'Record<string, unknown>',
  );
});

test('schemaFieldToTsType: returns string for date field', () => {
  expect(schemaFieldToTsType(field('x', 'date'))).toBe('string');
});

// --- generateTypeDeclaration with schema types ---

test('generateTypeDeclaration: uses number type from schema', () => {
  const prompts = [
    makePrompt({
      promptId: 'typed-prompt',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      userMessage: '${name} moves in ${daysUntilMove} days with ${items}',
      config: {
        model: 'claude-haiku-4.5',
        temperature: 0.7,
        schema: [
          field('name', 'string'),
          field('daysUntilMove', 'number'),
          field('items', 'array', { elementType: 'string' }),
        ],
        inputData: null,
        inputDataRootName: null,
      },
    }),
  ];
  const result = generateTypeDeclaration(prompts);

  expect(result).toContain('name: string;');
  expect(result).toContain('daysUntilMove: number;');
  expect(result).toContain('items: string[];');
});

test('generateTypeDeclaration: falls back to string for variables not in schema', () => {
  const prompts = [
    makePrompt({
      promptId: 'partial-schema',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      userMessage: '${known} and ${unknown}',
      config: {
        model: 'claude-haiku-4.5',
        temperature: 0.7,
        schema: [field('known', 'number')],
        inputData: null,
        inputDataRootName: null,
      },
    }),
  ];
  const result = generateTypeDeclaration(prompts);

  expect(result).toContain('known: number;');
  expect(result).toContain('unknown: string;');
});
