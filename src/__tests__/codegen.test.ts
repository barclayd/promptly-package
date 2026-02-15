import { expect, test } from 'bun:test';
import { schemaFieldsToZodSource } from '../schema/codegen.ts';
import type { SchemaField } from '../types.ts';

const field = (
  overrides: Partial<SchemaField> & { name: string; type: string },
): SchemaField => ({
  id: overrides.id ?? 'test-id',
  name: overrides.name,
  type: overrides.type,
  validations: overrides.validations ?? [],
  params: overrides.params ?? {},
});

test('schemaFieldsToZodSource: generates simple string field', () => {
  const source = schemaFieldsToZodSource([
    field({ name: 'title', type: 'string' }),
  ]);

  expect(source).toContain('z.object({');
  expect(source).toContain('title: z.string(),');
  expect(source).toContain('})');
});

test('schemaFieldsToZodSource: generates enum field', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'status',
      type: 'enum',
      params: { enumValues: ['active', 'inactive'] },
    }),
  ]);

  expect(source).toContain("z.enum(['active', 'inactive'])");
});

test('schemaFieldsToZodSource: generates field with validations', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'email',
      type: 'string',
      validations: [
        { id: '1', type: 'email', value: '', message: 'Invalid email' },
        { id: '2', type: 'min', value: '5', message: 'Too short' },
      ],
    }),
  ]);

  expect(source).toContain(".email('Invalid email')");
  expect(source).toContain(".min(5, 'Too short')");
});

test('schemaFieldsToZodSource: generates field with description', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'name',
      type: 'string',
      params: { description: 'User name' },
    }),
  ]);

  expect(source).toContain(".describe('User name')");
});

test('schemaFieldsToZodSource: generates coerced field', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'count',
      type: 'number',
      params: { coerce: true },
    }),
  ]);

  expect(source).toContain('z.coerce.number()');
});

test('schemaFieldsToZodSource: generates array field', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'tags',
      type: 'array',
      params: { elementType: 'string' },
    }),
  ]);

  expect(source).toContain('z.array(z.string())');
});

test('schemaFieldsToZodSource: generates tuple field', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'pair',
      type: 'array',
      params: { isTuple: true, tupleTypes: ['string', 'number'] },
    }),
  ]);

  expect(source).toContain('z.tuple([z.string(), z.number()])');
});

test('schemaFieldsToZodSource: generates literal field', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'type',
      type: 'literal',
      params: { enumValues: ['constant'] },
    }),
  ]);

  expect(source).toContain("z.literal('constant')");
});

test('schemaFieldsToZodSource: generates record field', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'data',
      type: 'record',
      params: { keyType: 'string', valueType: 'number' },
    }),
  ]);

  expect(source).toContain('z.record(z.string(), z.number())');
});

test('schemaFieldsToZodSource: generates set field', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'unique',
      type: 'set',
      params: { elementType: 'string' },
    }),
  ]);

  expect(source).toContain('z.set(z.string())');
});

test('schemaFieldsToZodSource: generates map field', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'lookup',
      type: 'map',
      params: { keyType: 'string', valueType: 'number' },
    }),
  ]);

  expect(source).toContain('z.map(z.string(), z.number())');
});

test('schemaFieldsToZodSource: generates union field', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'value',
      type: 'union',
      params: { unionTypes: ['string', 'number'] },
    }),
  ]);

  expect(source).toContain('z.union([z.string(), z.number()])');
});

test('schemaFieldsToZodSource: generates intersection field', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'combined',
      type: 'intersection',
      params: { unionTypes: ['string', 'number'] },
    }),
  ]);

  expect(source).toContain('z.intersection(z.string(), z.number())');
});

test('schemaFieldsToZodSource: generates optional validation', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'nickname',
      type: 'string',
      validations: [{ id: '1', type: 'optional', value: '', message: '' }],
    }),
  ]);

  expect(source).toContain('.optional()');
});

test('schemaFieldsToZodSource: generates nullable validation', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'middle',
      type: 'string',
      validations: [{ id: '1', type: 'nullable', value: '', message: '' }],
    }),
  ]);

  expect(source).toContain('.nullable()');
});

test('schemaFieldsToZodSource: generates default validation with number coercion', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'count',
      type: 'number',
      validations: [{ id: '1', type: 'default', value: '10', message: '' }],
    }),
  ]);

  expect(source).toContain('.default(10)');
});

test('schemaFieldsToZodSource: generates default validation with string', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'name',
      type: 'string',
      validations: [
        { id: '1', type: 'default', value: 'anonymous', message: '' },
      ],
    }),
  ]);

  expect(source).toContain(".default('anonymous')");
});

test('schemaFieldsToZodSource: generates regex validation', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'code',
      type: 'string',
      validations: [
        {
          id: '1',
          type: 'regex',
          value: '^[A-Z]{3}$',
          message: 'Must be 3 uppercase letters',
        },
      ],
    }),
  ]);

  expect(source).toContain("new RegExp('^[A-Z]{3}$')");
  expect(source).toContain("'Must be 3 uppercase letters'");
});

test('schemaFieldsToZodSource: generates strict object', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'obj',
      type: 'object',
      params: { isStrict: true },
    }),
  ]);

  expect(source).toContain('z.object({}).strict()');
});

test('schemaFieldsToZodSource: generates passthrough object', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'obj',
      type: 'object',
      params: { isPassthrough: true },
    }),
  ]);

  expect(source).toContain('z.object({}).passthrough()');
});

test('schemaFieldsToZodSource: generates datetime with options', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'ts',
      type: 'string',
      validations: [{ id: '1', type: 'datetime', value: '', message: '' }],
      params: {
        stringOptions: {
          datetime: { offset: true, precision: 3 },
        },
      },
    }),
  ]);

  expect(source).toContain('.datetime({ offset: true, precision: 3 })');
});

test('schemaFieldsToZodSource: generates ip with version', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'addr',
      type: 'string',
      validations: [{ id: '1', type: 'ip', value: '', message: '' }],
      params: {
        stringOptions: { ip: { version: 'v4' } },
      },
    }),
  ]);

  expect(source).toContain(".ip({ version: 'v4' })");
});

test('schemaFieldsToZodSource: generates complex multi-field schema', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'category',
      type: 'enum',
      params: {
        enumValues: ['spam', 'important', 'newsletter'],
        description: 'Email category',
      },
    }),
    field({
      name: 'confidence',
      type: 'number',
      validations: [
        { id: '1', type: 'min', value: '0', message: 'Min 0' },
        { id: '2', type: 'max', value: '1', message: 'Max 1' },
      ],
      params: { description: 'Classification confidence' },
    }),
    field({
      name: 'summary',
      type: 'string',
      validations: [],
      params: { description: 'Brief summary' },
    }),
  ]);

  expect(source).toContain("z.enum(['spam', 'important', 'newsletter'])");
  expect(source).toContain(".describe('Email category')");
  expect(source).toContain("z.number().min(0, 'Min 0').max(1, 'Max 1')");
  expect(source).toContain(".describe('Classification confidence')");
  expect(source).toContain("z.string().describe('Brief summary')");
});

test('schemaFieldsToZodSource: escapes special characters in strings', () => {
  const source = schemaFieldsToZodSource([
    field({
      name: 'note',
      type: 'string',
      params: { description: 'it\'s a "test" with\nnewlines' },
    }),
  ]);

  expect(source).toContain('it\\\'s a "test" with\\nnewlines');
});
