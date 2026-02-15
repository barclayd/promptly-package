import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { detectProviderName } from '../client.ts';
import { createErrorFromResponse } from '../errors.ts';
import type { PromptResponse } from '../types.ts';

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

const generateMappedTypeBlock = (
  group: VersionGroup,
  indent: string,
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
        lines.push(`${indent}  ${v}: string;`);
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
        lines.push(`${indent}  ${v}: string;`);
      }
      lines.push(`${indent}};`);
    }
  }

  return lines;
};

export const generateTypeDeclaration = (prompts: PromptResponse[]): string => {
  const lines: string[] = [
    '// Auto-generated by @promptlycms/prompts — do not edit',
    "import '@promptlycms/prompts';",
    '',
    "declare module '@promptlycms/prompts' {",
    '  interface PromptVariableMap {',
  ];

  for (const prompt of prompts) {
    const groups = groupAndSortVersions(prompt);

    if (groups.length === 1) {
      const group = groups[0];
      if (group) {
        lines.push(`    '${prompt.promptId}': {`);
        lines.push(...generateMappedTypeBlock(group, '      '));
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
        lines.push(...generateMappedTypeBlock(group, '      '));
      }
      lines.push('    };');
    }
  }

  lines.push('  }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
};

const warnMissingProviders = (prompts: PromptResponse[]): void => {
  const require = createRequire(import.meta.url);
  const needed = new Map<string, string[]>();

  for (const prompt of prompts) {
    const provider = detectProviderName(prompt.config.model);
    if (!provider) {
      continue;
    }
    const pkg = PROVIDER_PACKAGES[provider];
    if (!pkg) {
      continue;
    }
    const existing = needed.get(pkg);
    if (existing) {
      existing.push(prompt.promptName);
    } else {
      needed.set(pkg, [prompt.promptName]);
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
  const prompts = await fetchAllPrompts(apiKey, baseUrl);

  if (prompts.length === 0) {
    console.log('  No prompts found for this API key.');
    return;
  }

  console.log(`  Found ${prompts.length} prompt(s)`);
  warnMissingProviders(prompts);

  const content = generateTypeDeclaration(prompts);
  await writeFile(outputPath, content, 'utf-8');
  console.log(`  Generated ${outputPath}`);
};
