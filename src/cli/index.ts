import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineCommand, runMain } from 'citty';
import { generate } from './generate.ts';

const DEFAULT_DTS_OUTPUT = './promptly-env.d.ts';

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

const generateCommand = defineCommand({
  meta: {
    name: 'generate',
    description:
      'Generate typed TypeScript declarations from Promptly CMS prompts',
  },
  args: {
    output: {
      type: 'string',
      description: 'Output path for .d.ts file (default: ./promptly-env.d.ts)',
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
      throw new Error(
        'No API key provided. Set PROMPTLY_API_KEY or pass --api-key.',
      );
    }

    const outputPath = args.output ?? DEFAULT_DTS_OUTPUT;
    await generate(apiKey, outputPath);

    console.log('\nDone!');
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
