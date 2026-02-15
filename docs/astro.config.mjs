import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://docs.promptlycms.com',
  integrations: [
    starlight({
      title: 'PromptlyCMS',
      description:
        'TypeScript SDK for Promptly CMS — type-safe prompts for AI applications made delightfully simple',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/barclayd/promptly-package',
        },
      ],
      editLink: {
        baseUrl:
          'https://github.com/barclayd/promptly-package/edit/main/docs/',
      },
      customCss: ['./src/styles/custom.css'],
      head: [
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://docs.promptlycms.com/og-image.png',
          },
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' },
            {
              label: 'Type Generation',
              slug: 'getting-started/type-generation',
            },
          ],
        },
        {
          label: 'Guides',
          items: [
            {
              label: 'Fetching Prompts',
              slug: 'guides/fetching-prompts',
            },
            {
              label: 'AI SDK Integration',
              slug: 'guides/ai-sdk-integration',
            },
            { label: 'Model Resolution', slug: 'guides/model-resolution' },
            {
              label: 'Structured Output',
              slug: 'guides/structured-output',
            },
            { label: 'Error Handling', slug: 'guides/error-handling' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Client API', slug: 'reference/client-api' },
            { label: 'Schema API', slug: 'reference/schema-api' },
            { label: 'CLI', slug: 'reference/cli' },
            { label: 'Types', slug: 'reference/types' },
          ],
        },
      ],
    }),
  ],
});
