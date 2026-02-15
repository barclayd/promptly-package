import { createJiti } from 'jiti';
import type { PromptlyConfig } from '../types.ts';

const CONFIG_FILES = [
  'promptly.config.ts',
  'promptly.config.js',
  'promptly.config.json',
];

const DEFAULT_OUTPUT_DIR = './src/generated/prompts';

export const loadConfig = async (cwd: string): Promise<PromptlyConfig> => {
  const jiti = createJiti(cwd);

  for (const file of CONFIG_FILES) {
    const path = `${cwd}/${file}`;
    try {
      const mod = await jiti.import(path, { default: true });
      const config = mod as PromptlyConfig;
      validateConfig(config, file);
      return {
        ...config,
        outputDir: config.outputDir ?? DEFAULT_OUTPUT_DIR,
      };
    } catch (err) {
      const isNotFound =
        err instanceof Error &&
        (('code' in err &&
          (err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') ||
          err.message.includes('Cannot find module'));
      if (isNotFound) {
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `No config file found. Create one of: ${CONFIG_FILES.join(', ')}`,
  );
};

const validateConfig = (config: unknown, file: string): void => {
  if (!config || typeof config !== 'object') {
    throw new Error(`Invalid config in ${file}: must export an object`);
  }

  const c = config as Record<string, unknown>;

  if (!c.apiKey || typeof c.apiKey !== 'string') {
    throw new Error(`Invalid config in ${file}: missing "apiKey" string`);
  }

  if (!Array.isArray(c.prompts) || c.prompts.length === 0) {
    throw new Error(
      `Invalid config in ${file}: "prompts" must be a non-empty array`,
    );
  }

  for (const entry of c.prompts) {
    if (!entry || typeof entry !== 'object') {
      throw new Error(
        `Invalid config in ${file}: each prompt must be an object`,
      );
    }
    const e = entry as Record<string, unknown>;
    if (!e.id || typeof e.id !== 'string') {
      throw new Error(
        `Invalid config in ${file}: each prompt must have an "id" string`,
      );
    }
    if (!e.name || typeof e.name !== 'string') {
      throw new Error(
        `Invalid config in ${file}: each prompt must have a "name" string`,
      );
    }
  }
};
