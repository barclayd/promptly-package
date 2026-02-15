import type { SchemaField, ValidationRule } from '../types.ts';

const escapeString = (str: string): string =>
  str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');

// --- Simple type source map ---

const SIMPLE_TYPE_SOURCE = new Map<string, string>([
  ['string', 'z.string()'],
  ['number', 'z.number()'],
  ['boolean', 'z.boolean()'],
  ['date', 'z.date()'],
  ['bigint', 'z.bigint()'],
  ['null', 'z.null()'],
  ['undefined', 'z.undefined()'],
  ['void', 'z.void()'],
  ['any', 'z.any()'],
  ['unknown', 'z.unknown()'],
  ['never', 'z.never()'],
  ['nan', 'z.nan()'],
  ['symbol', 'z.symbol()'],
]);

const COERCE_TYPE_SOURCE = new Map<string, string>([
  ['string', 'z.coerce.string()'],
  ['number', 'z.coerce.number()'],
  ['boolean', 'z.coerce.boolean()'],
  ['date', 'z.coerce.date()'],
  ['bigint', 'z.coerce.bigint()'],
]);

const resolveTypeSource = (typeStr: string): string =>
  SIMPLE_TYPE_SOURCE.get(typeStr) ?? 'z.unknown()';

// --- Validation source map ---

const VALIDATION_SOURCE_MAP = new Map<
  string,
  (rule: ValidationRule, field: SchemaField) => string | null
>([
  ['min', (r) => `.min(${Number(r.value)}, '${escapeString(r.message)}')`],
  ['max', (r) => `.max(${Number(r.value)}, '${escapeString(r.message)}')`],
  [
    'length',
    (r) => `.length(${Number(r.value)}, '${escapeString(r.message)}')`,
  ],
  ['email', (r) => `.email('${escapeString(r.message)}')`],
  ['url', (r) => `.url('${escapeString(r.message)}')`],
  ['uuid', (r) => `.uuid('${escapeString(r.message)}')`],
  ['cuid', (r) => `.cuid('${escapeString(r.message)}')`],
  ['cuid2', (r) => `.cuid2('${escapeString(r.message)}')`],
  ['ulid', (r) => `.ulid('${escapeString(r.message)}')`],
  [
    'regex',
    (r) =>
      `.regex(new RegExp('${escapeString(r.value)}'), '${escapeString(r.message)}')`,
  ],
  [
    'startsWith',
    (r) =>
      `.startsWith('${escapeString(r.value)}', '${escapeString(r.message)}')`,
  ],
  [
    'endsWith',
    (r) =>
      `.endsWith('${escapeString(r.value)}', '${escapeString(r.message)}')`,
  ],
  [
    'datetime',
    (_r, f) => {
      const opts = f.params.stringOptions?.datetime;
      if (!opts) {
        return '.datetime()';
      }
      const parts: string[] = [];
      if (opts.offset !== undefined) {
        parts.push(`offset: ${opts.offset}`);
      }
      if (opts.precision !== undefined) {
        parts.push(`precision: ${opts.precision}`);
      }
      return `.datetime({ ${parts.join(', ')} })`;
    },
  ],
  [
    'ip',
    (_r, f) => {
      const version = f.params.stringOptions?.ip?.version;
      if (version === 'v6') {
        return '.ipv6()';
      }
      return '.ipv4()';
    },
  ],
  ['trim', () => '.trim()'],
  ['toLowerCase', () => '.toLowerCase()'],
  ['toUpperCase', () => '.toUpperCase()'],
  ['int', (r) => `.int('${escapeString(r.message)}')`],
  ['positive', (r) => `.positive('${escapeString(r.message)}')`],
  ['negative', (r) => `.negative('${escapeString(r.message)}')`],
  [
    'multipleOf',
    (r) => `.multipleOf(${Number(r.value)}, '${escapeString(r.message)}')`,
  ],
  ['finite', (r) => `.finite('${escapeString(r.message)}')`],
  ['safe', (r) => `.safe('${escapeString(r.message)}')`],
  ['nonempty', () => '.nonempty()'],
  ['optional', () => '.optional()'],
  ['nullable', () => '.nullable()'],
  ['nullish', () => '.nullish()'],
  [
    'default',
    (r, f) => {
      const coerced = coerceDefaultSource(r.value, f.type);
      return `.default(${coerced})`;
    },
  ],
  [
    'catch',
    (r, f) => {
      const coerced = coerceDefaultSource(r.value, f.type);
      return `.catch(${coerced})`;
    },
  ],
  ['readonly', () => '.readonly()'],
]);

const coerceDefaultSource = (value: string, fieldType: string): string => {
  if (fieldType === 'number') {
    return String(Number(value));
  }
  if (fieldType === 'boolean') {
    return value === 'true' ? 'true' : 'false';
  }
  if (fieldType === 'bigint') {
    return `BigInt('${escapeString(value)}')`;
  }
  return `'${escapeString(value)}'`;
};

// --- Field source builder ---

const buildFieldSource = (field: SchemaField): string => {
  let source = buildBaseTypeSource(field);

  for (const rule of field.validations) {
    const generator = VALIDATION_SOURCE_MAP.get(rule.type);
    if (generator) {
      const fragment = generator(rule, field);
      if (fragment) {
        source += fragment;
      }
    }
  }

  if (field.params.description) {
    source += `.describe('${escapeString(field.params.description)}')`;
  }

  return source;
};

const buildBaseTypeSource = (field: SchemaField): string => {
  if (field.params.coerce) {
    const coerced = COERCE_TYPE_SOURCE.get(field.type);
    if (coerced) {
      return coerced;
    }
  }

  const simple = SIMPLE_TYPE_SOURCE.get(field.type);
  if (simple) {
    return simple;
  }

  if (field.type === 'enum' && field.params.enumValues) {
    const values = field.params.enumValues
      .map((v) => `'${escapeString(v)}'`)
      .join(', ');
    return `z.enum([${values}])`;
  }

  if (field.type === 'literal' && field.params.enumValues?.[0]) {
    return `z.literal('${escapeString(field.params.enumValues[0])}')`;
  }

  if (field.type === 'array') {
    if (field.params.isTuple && field.params.tupleTypes) {
      const types = field.params.tupleTypes.map(resolveTypeSource).join(', ');
      return `z.tuple([${types}])`;
    }
    const element = field.params.elementType
      ? resolveTypeSource(field.params.elementType)
      : 'z.unknown()';
    return `z.array(${element})`;
  }

  if (field.type === 'object') {
    let source = 'z.object({})';
    if (field.params.isStrict) {
      source += '.strict()';
    } else if (field.params.isPassthrough) {
      source += '.passthrough()';
    }
    return source;
  }

  if (field.type === 'record') {
    const key = field.params.keyType
      ? resolveTypeSource(field.params.keyType)
      : 'z.string()';
    const value = field.params.valueType
      ? resolveTypeSource(field.params.valueType)
      : 'z.unknown()';
    return `z.record(${key}, ${value})`;
  }

  if (field.type === 'map') {
    const key = field.params.keyType
      ? resolveTypeSource(field.params.keyType)
      : 'z.string()';
    const value = field.params.valueType
      ? resolveTypeSource(field.params.valueType)
      : 'z.unknown()';
    return `z.map(${key}, ${value})`;
  }

  if (field.type === 'set') {
    const element = field.params.elementType
      ? resolveTypeSource(field.params.elementType)
      : 'z.unknown()';
    return `z.set(${element})`;
  }

  if (field.type === 'union') {
    const types = (field.params.unionTypes ?? [])
      .map(resolveTypeSource)
      .join(', ');
    return `z.union([${types}])`;
  }

  if (field.type === 'intersection') {
    const types = (field.params.unionTypes ?? []).map(resolveTypeSource);
    return `z.intersection(${types[0] ?? 'z.unknown()'}, ${types[1] ?? 'z.unknown()'})`;
  }

  return 'z.unknown()';
};

// --- Public API ---

export const schemaFieldsToZodSource = (fields: SchemaField[]): string => {
  const entries = fields.map(
    (field) => `  ${field.name}: ${buildFieldSource(field)},`,
  );
  return `z.object({\n${entries.join('\n')}\n})`;
};
