import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

/** Replace purple keyword colors with blue in Night Owl themes */
const replacePurpleTokens = (theme) => {
  const replacements =
    theme.type === 'dark'
      ? { '#C792EA': '#7DCFFF', '#c792ea': '#7dcfff' }
      : { '#994CC3': '#4338CA', '#994cc3': '#4338ca' };
  for (const setting of theme.settings) {
    const fg = setting.settings?.foreground;
    if (fg && replacements[fg]) {
      setting.settings.foreground = replacements[fg];
    }
  }
  return theme;
};

export default defineConfig({
  site: 'https://docs.promptlycms.com',
  integrations: [
    starlight({
      expressiveCode: {
        customizeTheme: replacePurpleTokens,
      },
      title: 'PromptlyCMS',
      logo: {
        src: './src/assets/logo.webp',
        alt: 'PromptlyCMS',
      },
      favicon: '/favicon.ico',
      description:
        'TypeScript SDK for Promptly CMS - type-safe prompts for AI applications made delightfully simple',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/barclayd/promptly-package',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/barclayd/promptly-package/edit/main/docs/',
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
          label: 'API',
          items: [
            { label: 'Overview', slug: 'api/overview' },
            { label: 'Endpoints', slug: 'api/endpoints' },
            { label: 'Rate Limits', slug: 'api/rate-limits' },
            { label: 'Errors', slug: 'api/errors' },
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
