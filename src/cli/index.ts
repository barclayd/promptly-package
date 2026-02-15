import { defineCommand, runMain } from 'citty';
import { loadConfig } from './config.ts';
import { generate } from './generate.ts';

const generateCommand = defineCommand({
  meta: {
    name: 'generate',
    description: 'Generate typed TypeScript files from Promptly CMS prompts',
  },
  args: {
    output: {
      type: 'string',
      description: 'Output directory (overrides config)',
      alias: 'o',
    },
  },
  run: async ({ args }) => {
    console.log('@promptlycms/prompts — generating...\n');

    const config = await loadConfig(process.cwd());

    if (args.output) {
      config.outputDir = args.output;
    }

    await generate(config);

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
