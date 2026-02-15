import { z } from 'zod';
import type {
  SchemaField,
  SchemaFieldParams,
  ValidationRule,
} from '../types.ts';

// --- Layer 1: Type builder map ---

const resolveTypeString = (typeStr: string): z.ZodTypeAny => {
  const builder = TYPE_BUILDERS.get(typeStr);
  if (builder) {
    return builder({
      id: '',
      name: '',
      type: typeStr,
      validations: [],
      params: {},
    });
  }
  return z.string();
};

const buildCoercible = (
  params: SchemaFieldParams,
  coerced: z.ZodTypeAny,
  standard: z.ZodTypeAny,
): z.ZodTypeAny => {
  if (params.coerce) {
    return coerced;
  }
  return standard;
};

const TYPE_BUILDERS = new Map<string, (field: SchemaField) => z.ZodTypeAny>([
  ['string', (f) => buildCoercible(f.params, z.coerce.string(), z.string())],
  ['number', (f) => buildCoercible(f.params, z.coerce.number(), z.number())],
  ['boolean', (f) => buildCoercible(f.params, z.coerce.boolean(), z.boolean())],
  ['date', (f) => buildCoercible(f.params, z.coerce.date(), z.date())],
  ['bigint', (f) => buildCoercible(f.params, z.coerce.bigint(), z.bigint())],
  ['null', () => z.null()],
  ['undefined', () => z.undefined()],
  ['void', () => z.void()],
  ['any', () => z.any()],
  ['unknown', () => z.unknown()],
  ['never', () => z.never()],
  ['nan', () => z.nan()],
  ['symbol', () => z.symbol()],
  [
    'enum',
    (f) => {
      const values = f.params.enumValues ?? [];
      return z.enum(values as [string, ...string[]]);
    },
  ],
  [
    'literal',
    (f) => {
      const value = f.params.enumValues?.[0] ?? '';
      return z.literal(value);
    },
  ],
  [
    'array',
    (f) => {
      if (f.params.isTuple && f.params.tupleTypes) {
        const types = f.params.tupleTypes.map(resolveTypeString);
        return z.tuple(types as [z.ZodTypeAny, ...z.ZodTypeAny[]]);
      }
      const elementSchema = f.params.elementType
        ? resolveTypeString(f.params.elementType)
        : z.unknown();
      return z.array(elementSchema);
    },
  ],
  [
    'object',
    (f) => {
      const schema = z.object({});
      if (f.params.isStrict) {
        return schema.strict();
      }
      if (f.params.isPassthrough) {
        return schema.passthrough();
      }
      return schema;
    },
  ],
  [
    'record',
    (f) => {
      const keySchema = f.params.keyType
        ? resolveTypeString(f.params.keyType)
        : z.string();
      const valueSchema = f.params.valueType
        ? resolveTypeString(f.params.valueType)
        : z.unknown();
      return z.record(keySchema as z.ZodString, valueSchema);
    },
  ],
  [
    'map',
    (f) => {
      const keySchema = f.params.keyType
        ? resolveTypeString(f.params.keyType)
        : z.string();
      const valueSchema = f.params.valueType
        ? resolveTypeString(f.params.valueType)
        : z.unknown();
      return z.map(keySchema, valueSchema);
    },
  ],
  [
    'set',
    (f) => {
      const elementSchema = f.params.elementType
        ? resolveTypeString(f.params.elementType)
        : z.unknown();
      return z.set(elementSchema);
    },
  ],
  [
    'union',
    (f) => {
      if (f.params.isDiscriminatedUnion && f.params.discriminatedUnion) {
        const { discriminator, cases } = f.params.discriminatedUnion;
        const schemas = Object.values(cases).map((c) =>
          z.object({
            [discriminator]: z.literal(c.value),
            ...Object.fromEntries(
              c.fields.map((field) => [field.name, buildFieldSchema(field)]),
            ),
          }),
        );
        return z.discriminatedUnion(
          discriminator,
          schemas as [
            z.ZodDiscriminatedUnionOption<string>,
            ...z.ZodDiscriminatedUnionOption<string>[],
          ],
        );
      }
      const types = (f.params.unionTypes ?? []).map(resolveTypeString);
      return z.union(types as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
    },
  ],
  [
    'intersection',
    (f) => {
      const types = (f.params.unionTypes ?? []).map(resolveTypeString);
      return z.intersection(types[0] ?? z.unknown(), types[1] ?? z.unknown());
    },
  ],
]);

// --- Layer 2: Validation applicators ---

const coerceDefaultValue = (value: string, fieldType: string): unknown => {
  const coercers = new Map<string, (v: string) => unknown>([
    ['number', (v) => Number(v)],
    ['boolean', (v) => v === 'true'],
    ['bigint', (v) => BigInt(v)],
  ]);
  const coercer = coercers.get(fieldType);
  if (coercer) {
    return coercer(value);
  }
  return value;
};

const applySizeValidation = (
  schema: z.ZodTypeAny,
  type: string,
  value: string,
  message: string,
): z.ZodTypeAny => {
  const num = Number(value);
  if (schema instanceof z.ZodString) {
    const methods: Record<string, (n: number, m: string) => z.ZodString> = {
      min: (n, m) => (schema as z.ZodString).min(n, m),
      max: (n, m) => (schema as z.ZodString).max(n, m),
      length: (n, m) => (schema as z.ZodString).length(n, m),
    };
    return methods[type]?.(num, message) ?? schema;
  }
  if (schema instanceof z.ZodNumber) {
    const methods: Record<string, (n: number, m: string) => z.ZodNumber> = {
      min: (n, m) => (schema as z.ZodNumber).min(n, m),
      max: (n, m) => (schema as z.ZodNumber).max(n, m),
    };
    return methods[type]?.(num, message) ?? schema;
  }
  if (schema instanceof z.ZodArray) {
    const methods: Record<string, (n: number) => z.ZodArray<z.ZodTypeAny>> = {
      min: (n) => (schema as z.ZodArray<z.ZodTypeAny>).min(n),
      max: (n) => (schema as z.ZodArray<z.ZodTypeAny>).max(n),
      length: (n) => (schema as z.ZodArray<z.ZodTypeAny>).length(n),
    };
    return methods[type]?.(num) ?? schema;
  }
  return schema;
};

type ValidationApplicator = (
  schema: z.ZodTypeAny,
  rule: ValidationRule,
  field: SchemaField,
) => z.ZodTypeAny;

const VALIDATION_APPLICATORS = new Map<string, ValidationApplicator>([
  // Size validations
  ['min', (s, r) => applySizeValidation(s, 'min', r.value, r.message)],
  ['max', (s, r) => applySizeValidation(s, 'max', r.value, r.message)],
  ['length', (s, r) => applySizeValidation(s, 'length', r.value, r.message)],

  // String validations
  ['email', (s, r) => (s instanceof z.ZodString ? s.email(r.message) : s)],
  ['url', (s, r) => (s instanceof z.ZodString ? s.url(r.message) : s)],
  ['uuid', (s, r) => (s instanceof z.ZodString ? s.uuid(r.message) : s)],
  ['cuid', (s, r) => (s instanceof z.ZodString ? s.cuid(r.message) : s)],
  ['cuid2', (s, r) => (s instanceof z.ZodString ? s.cuid2(r.message) : s)],
  ['ulid', (s, r) => (s instanceof z.ZodString ? s.ulid(r.message) : s)],
  [
    'regex',
    (s, r) =>
      s instanceof z.ZodString ? s.regex(new RegExp(r.value), r.message) : s,
  ],
  [
    'startsWith',
    (s, r) => (s instanceof z.ZodString ? s.startsWith(r.value, r.message) : s),
  ],
  [
    'endsWith',
    (s, r) => (s instanceof z.ZodString ? s.endsWith(r.value, r.message) : s),
  ],
  [
    'datetime',
    (s, _r, f) => {
      if (!(s instanceof z.ZodString)) {
        return s;
      }
      const opts = f.params.stringOptions?.datetime;
      return s.datetime(opts);
    },
  ],
  [
    'ip',
    (s, _r, f) => {
      if (!(s instanceof z.ZodString)) {
        return s;
      }
      const version = f.params.stringOptions?.ip?.version;
      return s.ip({ version });
    },
  ],

  // String transforms
  ['trim', (s) => (s instanceof z.ZodString ? s.trim() : s)],
  ['toLowerCase', (s) => (s instanceof z.ZodString ? s.toLowerCase() : s)],
  ['toUpperCase', (s) => (s instanceof z.ZodString ? s.toUpperCase() : s)],

  // Number validations
  ['int', (s, r) => (s instanceof z.ZodNumber ? s.int(r.message) : s)],
  [
    'positive',
    (s, r) => (s instanceof z.ZodNumber ? s.positive(r.message) : s),
  ],
  [
    'negative',
    (s, r) => (s instanceof z.ZodNumber ? s.negative(r.message) : s),
  ],
  [
    'multipleOf',
    (s, r) =>
      s instanceof z.ZodNumber ? s.multipleOf(Number(r.value), r.message) : s,
  ],
  ['finite', (s, r) => (s instanceof z.ZodNumber ? s.finite(r.message) : s)],
  ['safe', (s, r) => (s instanceof z.ZodNumber ? s.safe(r.message) : s)],

  // Collection
  [
    'nonempty',
    (s) => {
      if (s instanceof z.ZodString) {
        return s.min(1);
      }
      if (s instanceof z.ZodArray) {
        return s.nonempty();
      }
      return s;
    },
  ],

  // Wrapping modifiers
  ['optional', (s) => s.optional()],
  ['nullable', (s) => s.nullable()],
  ['nullish', (s) => s.nullish()],

  // Default & catch
  ['default', (s, r, f) => s.default(coerceDefaultValue(r.value, f.type))],
  ['catch', (s, r, f) => s.catch(coerceDefaultValue(r.value, f.type))],

  // Readonly
  ['readonly', (s) => s.readonly()],
]);

// --- Layer 3: Orchestration ---

export const buildFieldSchema = (field: SchemaField): z.ZodTypeAny => {
  const builder = TYPE_BUILDERS.get(field.type);
  if (!builder) {
    return z.unknown();
  }

  let schema = builder(field);

  for (const rule of field.validations) {
    const applicator = VALIDATION_APPLICATORS.get(rule.type);
    if (applicator) {
      schema = applicator(schema, rule, field);
    }
  }

  if (field.params.description) {
    schema = schema.describe(field.params.description);
  }

  return schema;
};

export const buildZodSchema = (
  fields: SchemaField[],
): z.ZodObject<Record<string, z.ZodTypeAny>> => {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    shape[field.name] = buildFieldSchema(field);
  }
  return z.object(shape);
};
