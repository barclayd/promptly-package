import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineCommand, runMain } from 'citty';
import { PromptlyError } from '../errors.ts';
import { generate } from './generate.ts';

const detectOutputPath = (): string => {
  const candidates = ['src/types', 'types'];
  for (const dir of candidates) {
    const full = resolve(process.cwd(), dir);
    if (existsSync(full)) {
      return resolve(full, 'promptly-env.d.ts');
    }
  }
  return resolve(process.cwd(), 'promptly-env.d.ts');
};

const loadEnvFile = (): void => {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        continue;
      }
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // No .env file — that's fine
  }
};

loadEnvFile();

const formatPromptlyError = (error: PromptlyError): void => {
  const errorMessages: Record<string, string> = {
    NOT_FOUND:
      'The prompt listing endpoint (GET /prompts) was not found. Check that your API supports this endpoint, or upgrade to the latest Promptly CMS version.',
    INVALID_KEY:
      'Invalid API key. Check your PROMPTLY_API_KEY or pass a valid key with --api-key.',
    UNAUTHORIZED:
      'Unauthorized. Check your PROMPTLY_API_KEY or pass a valid key with --api-key.',
  };

  const mapped = errorMessages[error.code];
  if (mapped) {
    console.error(`Error: ${mapped}`);
    return;
  }

  if (error.code === 'USAGE_LIMIT_EXCEEDED') {
    console.error(`Error: Usage limit exceeded. ${error.message}`);
    if (error.usage) {
      console.error(`Usage: ${JSON.stringify(error.usage)}`);
    }
    if (error.upgradeUrl) {
      console.error(`Upgrade your plan: ${error.upgradeUrl}`);
    }
    return;
  }

  console.error(
    `Error (${error.code}, HTTP ${error.status}): ${error.message}`,
  );
};

const generateCommand = defineCommand({
  meta: {
    name: 'generate',
    description:
      'Generate typed TypeScript declarations from Promptly CMS prompts',
  },
  args: {
    output: {
      type: 'string',
      description:
        'Output path for .d.ts file (auto-detects src/types or types folder)',
      alias: 'o',
    },
    'api-key': {
      type: 'string',
      description: 'API key (defaults to PROMPTLY_API_KEY env var)',
    },
  },
  run: async ({ args }) => {
    console.log('@promptlycms/prompts — generating...\n');

    const apiKey = args['api-key'] ?? process.env.PROMPTLY_API_KEY;
    if (!apiKey) {
      console.error(
        'Error: No API key provided. Set PROMPTLY_API_KEY or pass --api-key.',
      );
      process.exit(1);
    }

    const outputPath = args.output ?? detectOutputPath();

    try {
      await generate(apiKey, outputPath);
      console.log('\nDone!');
    } catch (error) {
      if (error instanceof PromptlyError) {
        formatPromptlyError(error);
      } else {
        console.error(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      process.exit(1);
    }
  },
});

const main = defineCommand({
  meta: {
    name: 'promptly',
    version: '0.1.0',
    description: 'CLI for @promptlycms/prompts',
  },
  subCommands: {
    generate: generateCommand,
  },
});

runMain(main);
