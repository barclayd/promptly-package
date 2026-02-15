import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      schema: 'src/schema/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    external: ['zod', 'ai', /^@ai-sdk\//],
    clean: true,
  },
  {
    entry: {
      cli: 'src/cli/index.ts',
    },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    external: ['zod', 'ai', /^@ai-sdk\//],
  },
]);
