import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { detectProviderName, toCamelCase } from '../client.ts';
import { createErrorFromResponse } from '../errors.ts';
import type {
  ComposerResponse,
  PromptResponse,
  SchemaField,
} from '../types.ts';

const PROVIDER_PACKAGES: Record<string, string> = {
  anthropic: '@ai-sdk/anthropic',
  openai: '@ai-sdk/openai',
  google: '@ai-sdk/google',
  mistral: '@ai-sdk/mistral',
};

const DEFAULT_BASE_URL = 'https://api.promptlycms.com';

export const extractTemplateVariables = (text: string): string[] => {
  const matches = text.matchAll(/\$\{(\w+)\}/g);
  const vars = new Set<string>();
  for (const match of matches) {
    const captured = match[1];
    if (captured) {
      vars.add(captured);
    }
  }
  return [...vars];
};

// Extracts variable names from static segment HTML content.
// Mirrors the regex patterns in src/client.ts (VARIABLE_REF_REGEX, VARIABLE_REF_ALT_REGEX, MUSTACHE_REGEX).
export const extractStaticSegmentVariables = (content: string): string[] => {
  const vars = new Set<string>();

  const varRefRegex =
    /<span[^>]*\sdata-variable-ref(?:="[^"]*")?[^>]*\sdata-field-path="([^"]+)"[^>]*><\/span>/g;
  const varRefAltRegex =
    /<span[^>]*\sdata-field-path="([^"]+)"[^>]*\sdata-variable-ref(?:="[^"]*")?[^>]*><\/span>/g;
  const mustacheRegex = /\{\{(\w[\w.]*)\}\}/g;

  for (const match of content.matchAll(varRefRegex)) {
    if (match[1]) {
      vars.add(match[1]);
    }
  }
  for (const match of content.matchAll(varRefAltRegex)) {
    if (match[1]) {
      vars.add(match[1]);
    }
  }
  for (const match of content.matchAll(mustacheRegex)) {
    if (match[1]) {
      vars.add(match[1]);
    }
  }

  return [...vars];
};

export const fetchAllPrompts = async (
  apiKey: string,
  baseUrl?: string,
): Promise<PromptResponse[]> => {
  const url = new URL('/prompts', baseUrl ?? DEFAULT_BASE_URL);
  url.searchParams.set('include_versions', 'true');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw await createErrorFromResponse(response);
  }

  return response.json() as Promise<PromptResponse[]>;
};

export const fetchAllComposers = async (
  apiKey: string,
  baseUrl?: string,
): Promise<ComposerResponse[]> => {
  const url = new URL('/composers', baseUrl ?? DEFAULT_BASE_URL);
  url.searchParams.set('include_versions', 'true');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw await createErrorFromResponse(response);
  }

  return response.json() as Promise<ComposerResponse[]>;
};

export const extractComposerVariables = (
  composer: ComposerResponse,
): string[] => {
  const vars = new Set<string>();
  for (const segment of composer.segments) {
    if (segment.type === 'prompt') {
      if (!segment.userMessage) {
        continue;
      }
      for (const v of extractTemplateVariables(segment.userMessage)) {
        vars.add(v);
      }
    } else if (segment.type === 'static') {
      for (const v of extractStaticSegmentVariables(segment.content)) {
        vars.add(v);
      }
    } else if (segment.type === 'html_block') {
      for (const v of extractStaticSegmentVariables(segment.html)) {
        vars.add(v);
      }
    }
  }
  return [...vars];
};

export const extractComposerPromptNames = (
  composer: ComposerResponse,
): string[] => {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const segment of composer.segments) {
    if (segment.type !== 'prompt') {
      continue;
    }
    const camelName = toCamelCase(segment.promptName);
    if (seen.has(camelName)) {
      continue;
    }
    seen.add(camelName);
    names.push(camelName);
  }
  return names;
};

export const compareSemver = (a: string, b: string): number => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
};

const variableFingerprint = (variables: string[]): string =>
  [...variables].sort().join(',');

type VersionGroup = {
  versions: string[];
  variables: string[];
};

export const groupAndSortVersions = (
  prompt: PromptResponse,
): VersionGroup[] => {
  const entries: { version: string; variables: string[] }[] = [];

  const latestVars = extractTemplateVariables(prompt.userMessage);

  if (prompt.publishedVersions) {
    for (const pv of prompt.publishedVersions) {
      entries.push({
        version: pv.version,
        variables: extractTemplateVariables(pv.userMessage),
      });
    }
  } else {
    // Backward compat: no publishedVersions — duplicate latest as current version
    entries.push({
      version: prompt.version,
      variables: latestVars,
    });
  }

  // Group by variable fingerprint
  const groups = new Map<string, VersionGroup>();

  for (const entry of entries) {
    const fp = variableFingerprint(entry.variables);
    const existing = groups.get(fp);
    if (existing) {
      existing.versions.push(entry.version);
    } else {
      groups.set(fp, {
        versions: [entry.version],
        variables: entry.variables,
      });
    }
  }

  // Add 'latest' to the group matching current version's fingerprint
  const latestFp = variableFingerprint(latestVars);
  const latestGroup = groups.get(latestFp);
  if (latestGroup) {
    latestGroup.versions.unshift('latest');
  }

  // Sort versions within each group: 'latest' first, then semver descending
  for (const group of groups.values()) {
    group.versions.sort((a, b) => {
      if (a === 'latest') {
        return -1;
      }
      if (b === 'latest') {
        return 1;
      }
      return compareSemver(b, a);
    });
  }

  // Sort groups: group containing 'latest' first, then by highest version descending
  const result = [...groups.values()];
  result.sort((a, b) => {
    const aHasLatest = a.versions[0] === 'latest';
    const bHasLatest = b.versions[0] === 'latest';
    if (aHasLatest && !bHasLatest) {
      return -1;
    }
    if (!aHasLatest && bHasLatest) {
      return 1;
    }
    const aHighest = a.versions.find((v) => v !== 'latest') ?? '';
    const bHighest = b.versions.find((v) => v !== 'latest') ?? '';
    return compareSemver(bHighest, aHighest);
  });

  return result;
};

const ELEMENT_TYPE_MAP: Record<string, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
};

export const schemaFieldToTsType = (field?: SchemaField): string => {
  if (!field) {
    return 'string';
  }

  switch (field.type) {
    case 'number':
    case 'boolean':
      return field.type;
    case 'array': {
      const elementTs =
        ELEMENT_TYPE_MAP[field.params.elementType ?? ''] ?? 'string';
      return `${elementTs}[]`;
    }
    case 'enum': {
      if (field.params.enumValues && field.params.enumValues.length > 0) {
        return field.params.enumValues.map((v) => `'${v}'`).join(' | ');
      }
      return 'string';
    }
    case 'object':
      return 'Record<string, unknown>';
    default:
      return 'string';
  }
};

const buildSchemaMap = (schema: SchemaField[]): Map<string, SchemaField> => {
  const map = new Map<string, SchemaField>();
  for (const field of schema) {
    map.set(field.name, field);
  }
  return map;
};

const TYPE_IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const typePropertyKey = (key: string): string => {
  if (TYPE_IDENTIFIER_RE.test(key)) {
    return key;
  }

  return `'${key.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
};

const generateMappedTypeBlock = (
  group: VersionGroup,
  indent: string,
  schemaMap: Map<string, SchemaField> = new Map(),
): string[] => {
  const lines: string[] = [];
  const { versions, variables } = group;

  if (versions.length === 1) {
    const vKey = `'${versions[0]}'`;
    if (variables.length === 0) {
      lines.push(`${indent}[V in ${vKey}]: Record<string, never>;`);
    } else {
      lines.push(`${indent}[V in ${vKey}]: {`);
      for (const v of variables) {
        lines.push(
          `${indent}  ${v}: ${schemaFieldToTsType(schemaMap.get(v))};`,
        );
      }
      lines.push(`${indent}};`);
    }
  } else {
    lines.push(`${indent}[V in`);
    for (let i = 0; i < versions.length; i++) {
      const vKey = `'${versions[i]}'`;
      const isLast = i === versions.length - 1;
      if (isLast) {
        if (variables.length === 0) {
          lines.push(`${indent}  | ${vKey}]: Record<string, never>;`);
        } else {
          lines.push(`${indent}  | ${vKey}]: {`);
        }
      } else {
        lines.push(`${indent}  | ${vKey}`);
      }
    }
    if (variables.length > 0) {
      for (const v of variables) {
        lines.push(
          `${indent}  ${v}: ${schemaFieldToTsType(schemaMap.get(v))};`,
        );
      }
      lines.push(`${indent}};`);
    }
  }

  return lines;
};

export const generateTypeDeclaration = (
  prompts: PromptResponse[],
  composers: ComposerResponse[] = [],
): string => {
  const lines: string[] = [
    '// Auto-generated by @promptlycms/prompts — do not edit',
    "import '@promptlycms/prompts';",
    '',
    "declare module '@promptlycms/prompts' {",
    '  interface PromptVariableMap {',
  ];

  for (const prompt of prompts) {
    const groups = groupAndSortVersions(prompt);
    const schemaMap = buildSchemaMap(prompt.config.schema);

    if (groups.length === 1) {
      const group = groups[0];
      if (group) {
        lines.push(`    '${prompt.promptId}': {`);
        lines.push(...generateMappedTypeBlock(group, '      ', schemaMap));
        lines.push('    };');
      }
    } else {
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        if (!group) {
          continue;
        }
        if (i === 0) {
          lines.push(`    '${prompt.promptId}': {`);
        } else {
          lines.push('    } & {');
        }
        lines.push(...generateMappedTypeBlock(group, '      ', schemaMap));
      }
      lines.push('    };');
    }
  }

  lines.push('  }');

  if (composers.length > 0) {
    lines.push('  interface ComposerVariableMap {');

    for (const composer of composers) {
      const variables = extractComposerVariables(composer);
      const composerKey = typePropertyKey(composer.composerId);
      const schemaMap = buildSchemaMap(composer.config.schema);
      const versions: string[] = ["'latest'"];
      if (composer.publishedVersions) {
        for (const pv of composer.publishedVersions) {
          versions.push(`'${pv.version}'`);
        }
      } else {
        versions.push(`'${composer.version}'`);
      }

      lines.push(`    ${composerKey}: {`);
      if (versions.length === 1) {
        if (variables.length === 0) {
          lines.push(`      [V in ${versions[0]}]: Record<string, never>;`);
        } else {
          lines.push(`      [V in ${versions[0]}]: {`);
          for (const v of variables) {
            lines.push(
              `        ${v}: ${schemaFieldToTsType(schemaMap.get(v))};`,
            );
          }
          lines.push('      };');
        }
      } else {
        const versionUnion = versions.join(' | ');
        if (variables.length === 0) {
          lines.push(`      [V in ${versionUnion}]: Record<string, never>;`);
        } else {
          lines.push(`      [V in ${versionUnion}]: {`);
          for (const v of variables) {
            lines.push(
              `        ${v}: ${schemaFieldToTsType(schemaMap.get(v))};`,
            );
          }
          lines.push('      };');
        }
      }
      lines.push('    };');
    }

    lines.push('  }');

    lines.push('  interface ComposerPromptMap {');

    for (const composer of composers) {
      const names = extractComposerPromptNames(composer);
      const composerKey = typePropertyKey(composer.composerId);
      if (names.length === 0) {
        lines.push(`    ${composerKey}: never;`);
      } else {
        const union = names.map((n) => `'${n}'`).join(' | ');
        lines.push(`    ${composerKey}: ${union};`);
      }
    }

    lines.push('  }');
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
};

const warnMissingProviders = (
  prompts: PromptResponse[],
  composers: ComposerResponse[] = [],
): void => {
  const require = createRequire(import.meta.url);
  const needed = new Map<string, string[]>();

  const trackModel = (modelId: string, label: string) => {
    const provider = detectProviderName(modelId);
    if (!provider) {
      return;
    }
    const pkg = PROVIDER_PACKAGES[provider];
    if (!pkg) {
      return;
    }
    const existing = needed.get(pkg);
    if (existing) {
      existing.push(label);
    } else {
      needed.set(pkg, [label]);
    }
  };

  for (const prompt of prompts) {
    trackModel(prompt.config.model, prompt.promptName);
  }

  for (const composer of composers) {
    for (const segment of composer.segments) {
      if (segment.type !== 'prompt') {
        continue;
      }
      const modelId = (segment.config as { model?: string }).model;
      if (modelId) {
        trackModel(modelId, `${composer.composerName}/${segment.promptName}`);
      }
    }
  }

  for (const [pkg, promptNames] of needed) {
    try {
      require.resolve(pkg);
    } catch {
      const names = promptNames.map((n) => `"${n}"`).join(', ');
      console.warn(
        `  Warning: ${names} requires ${pkg} — install it: npm install ${pkg}`,
      );
    }
  }
};

export const generate = async (
  apiKey: string,
  outputPath: string,
  baseUrl?: string,
): Promise<void> => {
  const [prompts, composers] = await Promise.all([
    fetchAllPrompts(apiKey, baseUrl),
    fetchAllComposers(apiKey, baseUrl).catch(() => [] as ComposerResponse[]),
  ]);

  if (prompts.length === 0 && composers.length === 0) {
    console.log('  No prompts or composers found for this API key.');
    return;
  }

  if (prompts.length > 0) {
    console.log(`  Found ${prompts.length} prompt(s)`);
  }
  if (composers.length > 0) {
    console.log(`  Found ${composers.length} composer(s)`);
  }
  warnMissingProviders(prompts, composers);

  const content = generateTypeDeclaration(prompts, composers);
  await writeFile(outputPath, content, 'utf-8');
  console.log(`  Generated ${outputPath}`);
};
