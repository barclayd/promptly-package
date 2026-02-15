import { describe, expect, test } from 'bun:test';
import { buildFieldSchema, buildZodSchema } from '../schema/builder.ts';
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

describe('buildFieldSchema', () => {
  describe('primitive types', () => {
    test('string', () => {
      const schema = buildFieldSchema(field({ name: 'x', type: 'string' }));
      expect(schema.parse('hello')).toBe('hello');
      expect(() => schema.parse(123)).toThrow();
    });

    test('number', () => {
      const schema = buildFieldSchema(field({ name: 'x', type: 'number' }));
      expect(schema.parse(42)).toBe(42);
      expect(() => schema.parse('abc')).toThrow();
    });

    test('boolean', () => {
      const schema = buildFieldSchema(field({ name: 'x', type: 'boolean' }));
      expect(schema.parse(true)).toBe(true);
      expect(() => schema.parse('yes')).toThrow();
    });

    test('date', () => {
      const schema = buildFieldSchema(field({ name: 'x', type: 'date' }));
      const d = new Date();
      expect(schema.parse(d)).toEqual(d);
    });

    test('bigint', () => {
      const schema = buildFieldSchema(field({ name: 'x', type: 'bigint' }));
      expect(schema.parse(BigInt(99))).toBe(BigInt(99));
    });
  });

  describe('coerce variants', () => {
    test('coerce string', () => {
      const schema = buildFieldSchema(
        field({ name: 'x', type: 'string', params: { coerce: true } }),
      );
      expect(schema.parse(123)).toBe('123');
    });

    test('coerce number', () => {
      const schema = buildFieldSchema(
        field({ name: 'x', type: 'number', params: { coerce: true } }),
      );
      expect(schema.parse('42')).toBe(42);
    });

    test('coerce boolean', () => {
      const schema = buildFieldSchema(
        field({ name: 'x', type: 'boolean', params: { coerce: true } }),
      );
      expect(schema.parse('true')).toBe(true);
    });

    test('coerce date', () => {
      const schema = buildFieldSchema(
        field({ name: 'x', type: 'date', params: { coerce: true } }),
      );
      const result = schema.parse('2024-01-01');
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('special types', () => {
    test('null', () => {
      const schema = buildFieldSchema(field({ name: 'x', type: 'null' }));
      expect(schema.parse(null)).toBe(null);
      expect(() => schema.parse('hello')).toThrow();
    });

    test('undefined', () => {
      const schema = buildFieldSchema(field({ name: 'x', type: 'undefined' }));
      expect(schema.parse(undefined)).toBe(undefined);
    });

    test('any', () => {
      const schema = buildFieldSchema(field({ name: 'x', type: 'any' }));
      expect(schema.parse('anything')).toBe('anything');
      expect(schema.parse(42)).toBe(42);
    });

    test('unknown', () => {
      const schema = buildFieldSchema(field({ name: 'x', type: 'unknown' }));
      expect(schema.parse('anything')).toBe('anything');
    });

    test('unknown type falls back to z.unknown()', () => {
      const schema = buildFieldSchema(
        field({ name: 'x', type: 'nonexistent' }),
      );
      expect(schema.parse('anything')).toBe('anything');
    });
  });

  describe('enum and literal', () => {
    test('enum', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'enum',
          params: { enumValues: ['a', 'b', 'c'] },
        }),
      );
      expect(schema.parse('a')).toBe('a');
      expect(() => schema.parse('d')).toThrow();
    });

    test('literal', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'literal',
          params: { enumValues: ['hello'] },
        }),
      );
      expect(schema.parse('hello')).toBe('hello');
      expect(() => schema.parse('world')).toThrow();
    });
  });

  describe('array and tuple', () => {
    test('array with element type', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'array',
          params: { elementType: 'number' },
        }),
      );
      expect(schema.parse([1, 2, 3])).toEqual([1, 2, 3]);
      expect(() => schema.parse(['a'])).toThrow();
    });

    test('tuple', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'array',
          params: { isTuple: true, tupleTypes: ['string', 'number'] },
        }),
      );
      expect(schema.parse(['hello', 42])).toEqual(['hello', 42]);
      expect(() => schema.parse([42, 'hello'])).toThrow();
    });

    test('array without element type defaults to unknown', () => {
      const schema = buildFieldSchema(
        field({ name: 'x', type: 'array', params: {} }),
      );
      expect(schema.parse([1, 'a', true])).toEqual([1, 'a', true]);
    });
  });

  describe('object', () => {
    test('plain object', () => {
      const schema = buildFieldSchema(field({ name: 'x', type: 'object' }));
      expect(schema.parse({})).toEqual({});
    });

    test('strict object', () => {
      const schema = buildFieldSchema(
        field({ name: 'x', type: 'object', params: { isStrict: true } }),
      );
      expect(() => schema.parse({ extra: 1 })).toThrow();
    });

    test('passthrough object', () => {
      const schema = buildFieldSchema(
        field({ name: 'x', type: 'object', params: { isPassthrough: true } }),
      );
      expect(schema.parse({ extra: 1 })).toEqual({ extra: 1 });
    });
  });

  describe('record, map, set', () => {
    test('record', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'record',
          params: { keyType: 'string', valueType: 'number' },
        }),
      );
      expect(schema.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
      expect(() => schema.parse({ a: 'not a number' })).toThrow();
    });

    test('set', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'set',
          params: { elementType: 'string' },
        }),
      );
      const s = new Set(['a', 'b']);
      expect(schema.parse(s)).toEqual(s);
    });

    test('map', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'map',
          params: { keyType: 'string', valueType: 'number' },
        }),
      );
      const m = new Map([['a', 1]]);
      expect(schema.parse(m)).toEqual(m);
    });
  });

  describe('union and intersection', () => {
    test('union', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'union',
          params: { unionTypes: ['string', 'number'] },
        }),
      );
      expect(schema.parse('hello')).toBe('hello');
      expect(schema.parse(42)).toBe(42);
      expect(() => schema.parse(true)).toThrow();
    });

    test('intersection', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'intersection',
          params: { unionTypes: ['unknown', 'unknown'] },
        }),
      );
      expect(schema.parse('hello')).toBe('hello');
    });
  });

  describe('validation rules', () => {
    test('min and max on string', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [
            { id: '1', type: 'min', value: '2', message: 'Too short' },
            { id: '2', type: 'max', value: '5', message: 'Too long' },
          ],
        }),
      );
      expect(schema.parse('ab')).toBe('ab');
      expect(() => schema.parse('a')).toThrow();
      expect(() => schema.parse('abcdef')).toThrow();
    });

    test('min and max on number', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'number',
          validations: [
            { id: '1', type: 'min', value: '0', message: 'Too low' },
            { id: '2', type: 'max', value: '100', message: 'Too high' },
          ],
        }),
      );
      expect(schema.parse(50)).toBe(50);
      expect(() => schema.parse(-1)).toThrow();
      expect(() => schema.parse(101)).toThrow();
    });

    test('length on string', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [
            { id: '1', type: 'length', value: '3', message: 'Must be 3' },
          ],
        }),
      );
      expect(schema.parse('abc')).toBe('abc');
      expect(() => schema.parse('ab')).toThrow();
    });

    test('email', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [
            { id: '1', type: 'email', value: '', message: 'Invalid email' },
          ],
        }),
      );
      expect(schema.parse('test@example.com')).toBe('test@example.com');
      expect(() => schema.parse('not-an-email')).toThrow();
    });

    test('url', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [
            { id: '1', type: 'url', value: '', message: 'Invalid URL' },
          ],
        }),
      );
      expect(schema.parse('https://example.com')).toBe('https://example.com');
      expect(() => schema.parse('not-a-url')).toThrow();
    });

    test('uuid', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [
            { id: '1', type: 'uuid', value: '', message: 'Invalid UUID' },
          ],
        }),
      );
      expect(schema.parse('550e8400-e29b-41d4-a716-446655440000')).toBeTruthy();
      expect(() => schema.parse('not-uuid')).toThrow();
    });

    test('regex', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [
            {
              id: '1',
              type: 'regex',
              value: '^[A-Z]+$',
              message: 'Must be uppercase',
            },
          ],
        }),
      );
      expect(schema.parse('ABC')).toBe('ABC');
      expect(() => schema.parse('abc')).toThrow();
    });

    test('startsWith and endsWith', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [
            {
              id: '1',
              type: 'startsWith',
              value: 'hello',
              message: 'Must start with hello',
            },
            {
              id: '2',
              type: 'endsWith',
              value: 'world',
              message: 'Must end with world',
            },
          ],
        }),
      );
      expect(schema.parse('hello world')).toBe('hello world');
      expect(() => schema.parse('hi world')).toThrow();
      expect(() => schema.parse('hello earth')).toThrow();
    });

    test('trim', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [{ id: '1', type: 'trim', value: '', message: '' }],
        }),
      );
      expect(schema.parse('  hello  ')).toBe('hello');
    });

    test('toLowerCase and toUpperCase', () => {
      const lower = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [
            { id: '1', type: 'toLowerCase', value: '', message: '' },
          ],
        }),
      );
      expect(lower.parse('HELLO')).toBe('hello');

      const upper = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [
            { id: '1', type: 'toUpperCase', value: '', message: '' },
          ],
        }),
      );
      expect(upper.parse('hello')).toBe('HELLO');
    });

    test('int, positive, negative', () => {
      const intSchema = buildFieldSchema(
        field({
          name: 'x',
          type: 'number',
          validations: [
            { id: '1', type: 'int', value: '', message: 'Must be int' },
          ],
        }),
      );
      expect(intSchema.parse(5)).toBe(5);
      expect(() => intSchema.parse(5.5)).toThrow();

      const posSchema = buildFieldSchema(
        field({
          name: 'x',
          type: 'number',
          validations: [
            {
              id: '1',
              type: 'positive',
              value: '',
              message: 'Must be positive',
            },
          ],
        }),
      );
      expect(posSchema.parse(1)).toBe(1);
      expect(() => posSchema.parse(-1)).toThrow();
    });

    test('multipleOf', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'number',
          validations: [
            {
              id: '1',
              type: 'multipleOf',
              value: '3',
              message: 'Must be multiple of 3',
            },
          ],
        }),
      );
      expect(schema.parse(9)).toBe(9);
      expect(() => schema.parse(10)).toThrow();
    });

    test('optional', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [{ id: '1', type: 'optional', value: '', message: '' }],
        }),
      );
      expect(schema.parse(undefined)).toBe(undefined);
      expect(schema.parse('hello')).toBe('hello');
    });

    test('nullable', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [{ id: '1', type: 'nullable', value: '', message: '' }],
        }),
      );
      expect(schema.parse(null)).toBe(null);
      expect(schema.parse('hello')).toBe('hello');
    });

    test('nullish', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [{ id: '1', type: 'nullish', value: '', message: '' }],
        }),
      );
      expect(schema.parse(null)).toBe(null);
      expect(schema.parse(undefined)).toBe(undefined);
      expect(schema.parse('hello')).toBe('hello');
    });

    test('default', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [
            { id: '1', type: 'default', value: 'fallback', message: '' },
          ],
        }),
      );
      expect(schema.parse(undefined)).toBe('fallback');
    });

    test('default coerces number', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'number',
          validations: [{ id: '1', type: 'default', value: '42', message: '' }],
        }),
      );
      expect(schema.parse(undefined)).toBe(42);
    });

    test('nonempty on string', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [{ id: '1', type: 'nonempty', value: '', message: '' }],
        }),
      );
      expect(() => schema.parse('')).toThrow();
      expect(schema.parse('a')).toBe('a');
    });

    test('nonempty on array', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'array',
          params: { elementType: 'string' },
          validations: [{ id: '1', type: 'nonempty', value: '', message: '' }],
        }),
      );
      expect(() => schema.parse([])).toThrow();
      expect(schema.parse(['a'])).toEqual(['a']);
    });

    test('readonly', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          validations: [{ id: '1', type: 'readonly', value: '', message: '' }],
        }),
      );
      expect(schema.parse('hello')).toBe('hello');
    });
  });

  describe('description', () => {
    test('applies description from params', () => {
      const schema = buildFieldSchema(
        field({
          name: 'x',
          type: 'string',
          params: { description: 'A test field' },
        }),
      );
      expect(schema.description).toBe('A test field');
    });
  });
});

describe('buildZodSchema', () => {
  test('builds object schema from fields', () => {
    const schema = buildZodSchema([
      field({
        name: 'category',
        type: 'enum',
        params: { enumValues: ['spam', 'important', 'newsletter'] },
        validations: [],
      }),
      field({
        name: 'confidence',
        type: 'number',
        validations: [
          { id: '1', type: 'min', value: '0', message: 'Too low' },
          { id: '2', type: 'max', value: '1', message: 'Too high' },
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

    const result = schema.parse({
      category: 'spam',
      confidence: 0.9,
      summary: 'This is spam',
    });

    expect(result).toEqual({
      category: 'spam',
      confidence: 0.9,
      summary: 'This is spam',
    });

    expect(() =>
      schema.parse({
        category: 'invalid',
        confidence: 0.5,
        summary: 'test',
      }),
    ).toThrow();
  });

  test('empty fields produces empty object schema', () => {
    const schema = buildZodSchema([]);
    expect(schema.parse({})).toEqual({});
  });
});
