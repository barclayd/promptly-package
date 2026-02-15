import { defineCommand, runMain } from 'citty';
import { loadConfig } from './config.ts';
import { generate, generateDts } from './generate.ts';

const DEFAULT_DTS_OUTPUT = './promptly-env.d.ts';

const generateCommand = defineCommand({
  meta: {
    name: 'generate',
    description: 'Generate typed TypeScript files from Promptly CMS prompts',
  },
  args: {
    output: {
      type: 'string',
      description:
        'Output path for .d.ts file (default: ./promptly-env.d.ts) or output directory when using config',
      alias: 'o',
    },
    'api-key': {
      type: 'string',
      description: 'API key (defaults to PROMPTLY_API_KEY env var)',
    },
  },
  run: async ({ args }) => {
    console.log('@promptlycms/prompts — generating...\n');

    const config = await loadConfig(process.cwd());

    if (config) {
      if (args.output) {
        config.outputDir = args.output;
      }

      await generate(config);

      // Also generate .d.ts when config exists
      const dtsOutput = DEFAULT_DTS_OUTPUT;
      await generateDts(config.apiKey, dtsOutput);
    } else {
      const apiKey = args['api-key'] ?? process.env.PROMPTLY_API_KEY;
      if (!apiKey) {
        throw new Error(
          'No config file found and no API key provided. Set PROMPTLY_API_KEY or pass --api-key.',
        );
      }

      const dtsOutput = args.output ?? DEFAULT_DTS_OUTPUT;
      await generateDts(apiKey, dtsOutput);
    }

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
