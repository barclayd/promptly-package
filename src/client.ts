import { createErrorFromResponse, PromptlyError } from './errors.ts';
import type {
  ComposerGenerateFn,
  ComposerPrompt,
  ComposerRequest,
  ComposerResponse,
  FormatInput,
  GetComposerOptions,
  GetOptions,
  PromptlyClient,
  PromptlyClientConfig,
  PromptMessage,
  PromptRequest,
  PromptResponse,
} from './types.ts';

const DEFAULT_BASE_URL = 'https://api.promptlycms.com';

const MODEL_ID_MAP: Record<string, string> = {
  // Anthropic: CMS display IDs → API model IDs
  'claude-opus-4.6': 'claude-opus-4-6-20250917',
  'claude-sonnet-4.6': 'claude-sonnet-4-6',
  'claude-sonnet-4.5': 'claude-sonnet-4-5-20250929',
  'claude-haiku-4.5': 'claude-haiku-4-5-20251001',
  'claude-opus-4': 'claude-opus-4-20250514',
  'claude-sonnet-4': 'claude-sonnet-4-20250514',
  'claude-3.7-sonnet': 'claude-3-7-sonnet-20250219',
  // Google: CMS display IDs → Gemini SDK model names
  'gemini-3-pro': 'gemini-3.0-pro',
  'gemini-3-flash': 'gemini-3.0-flash',
  'gemini-3-deep-think': 'gemini-3.0-deep-think',
  'gemini-2.5-pro': 'gemini-2.5-pro-latest',
  'gemini-2.5-flash': 'gemini-2.5-flash-preview-05-20',
};

export const getSdkModelId = (modelId: string): string =>
  MODEL_ID_MAP[modelId] ?? modelId;

const PROVIDER_PREFIXES: [string, string][] = [
  ['claude', 'anthropic'],
  ['gpt', 'openai'],
  ['o1', 'openai'],
  ['o3', 'openai'],
  ['o4', 'openai'],
  ['chatgpt', 'openai'],
  ['gemini', 'google'],
  ['mistral', 'mistral'],
  ['mixtral', 'mistral'],
  ['codestral', 'mistral'],
];

export const detectProviderName = (modelId: string): string | undefined => {
  const lower = modelId.toLowerCase();
  for (const [prefix, provider] of PROVIDER_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return provider;
    }
  }
  return undefined;
};

// Uses string-literal imports so bundlers (esbuild, webpack) can
// statically resolve each provider package at build time.
// `import(variable)` is invisible to bundlers and fails at runtime.
export const resolveModel = async (
  modelId: string,
): Promise<import('ai').LanguageModel | undefined> => {
  const providerName = detectProviderName(modelId);
  if (!providerName) {
    return undefined;
  }

  const sdkModelId = getSdkModelId(modelId);

  try {
    switch (providerName) {
      case 'anthropic': {
        const { anthropic } = await import('@ai-sdk/anthropic');
        return anthropic(sdkModelId);
      }
      case 'openai': {
        const { openai } = await import('@ai-sdk/openai');
        return openai(sdkModelId);
      }
      case 'google': {
        const { google } = await import('@ai-sdk/google');
        return google(sdkModelId);
      }
      case 'mistral': {
        const { mistral } = await import('@ai-sdk/mistral');
        return mistral(sdkModelId);
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
};

export const interpolate = (
  template: string,
  variables: Record<string, unknown>,
): string => {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`\${${key}}`, String(value));
  }
  return result;
};

const createPromptMessage = (template: string): PromptMessage => {
  const fn = (variables: Record<string, unknown>): string =>
    interpolate(template, variables);
  fn.toString = () => template;
  return fn as PromptMessage;
};

const PROVIDER_PACKAGES: Record<string, string> = {
  anthropic: '@ai-sdk/anthropic',
  openai: '@ai-sdk/openai',
  google: '@ai-sdk/google',
  mistral: '@ai-sdk/mistral',
};

const createModelResolver = (
  config?: PromptlyClientConfig,
): ((modelId: string) => Promise<import('ai').LanguageModel>) => {
  if (config?.model) {
    const userResolver = config.model;
    return async (modelId: string) => userResolver(modelId);
  }

  return async (modelId: string) => {
    const model = await resolveModel(modelId);
    if (model) {
      return model;
    }

    const providerName = detectProviderName(modelId);
    const pkg = providerName ? PROVIDER_PACKAGES[providerName] : undefined;
    const hint = pkg
      ? `Make sure "${pkg}" is installed: npm install ${pkg}`
      : `Supported model prefixes: ${PROVIDER_PREFIXES.map(([p]) => p).join(', ')}`;

    throw new PromptlyError(
      `Failed to resolve model "${modelId}". ${hint}`,
      'BAD_REQUEST',
      0,
    );
  };
};

export const toCamelCase = (name: string): string =>
  name
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char: string) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase());

const VARIABLE_REF_REGEX =
  /<span[^>]*\sdata-variable-ref(?:="[^"]*")?[^>]*\sdata-field-path="([^"]+)"[^>]*><\/span>/g;

const VARIABLE_REF_ALT_REGEX =
  /<span[^>]*\sdata-field-path="([^"]+)"[^>]*\sdata-variable-ref(?:="[^"]*")?[^>]*><\/span>/g;

const MUSTACHE_REGEX = /\{\{(\w[\w.]*)\}\}/g;

export const interpolateStaticSegment = (
  content: string,
  input: Record<string, unknown>,
): string => {
  let result = content;

  // Replace <span data-variable-ref data-field-path="X"></span> (both attribute orderings)
  result = result.replace(VARIABLE_REF_REGEX, (_, fieldPath: string) =>
    fieldPath in input ? String(input[fieldPath]) : '',
  );
  result = result.replace(VARIABLE_REF_ALT_REGEX, (_, fieldPath: string) =>
    fieldPath in input ? String(input[fieldPath]) : '',
  );

  // Replace {{fieldPath}} mustache patterns
  result = result.replace(MUSTACHE_REGEX, (_, fieldPath: string) =>
    fieldPath in input ? String(input[fieldPath]) : '',
  );

  return result;
};

export const createPromptlyClient = (
  config?: PromptlyClientConfig,
): PromptlyClient => {
  const apiKey = config?.apiKey ?? process.env.PROMPTLY_API_KEY;
  if (!apiKey) {
    throw new PromptlyError(
      'Missing API key. Pass { apiKey } to createPromptlyClient() or set PROMPTLY_API_KEY environment variable.',
      'UNAUTHORIZED',
      0,
    );
  }
  const baseUrl = config?.baseUrl ?? DEFAULT_BASE_URL;
  const modelResolver = createModelResolver(config);

  const fetchPrompt = async (
    promptId: string,
    options?: GetOptions,
  ): Promise<PromptResponse> => {
    const url = new URL(`/prompts/${promptId}`, baseUrl);
    if (options?.version) {
      url.searchParams.set('version', options.version);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw await createErrorFromResponse(response);
    }

    return response.json() as Promise<PromptResponse>;
  };

  const getPrompt = async <T extends string, V extends string = 'latest'>(
    promptId: T,
    options?: GetOptions<V>,
  ) => {
    const response = await fetchPrompt(promptId, options);
    const model = await modelResolver(response.config.model);
    return {
      ...response,
      userMessage: createPromptMessage(response.userMessage),
      temperature: response.config.temperature,
      model,
    };
  };

  const getPrompts = async (entries: readonly PromptRequest[]) => {
    const results = await Promise.all(
      entries.map((entry) =>
        getPrompt(entry.promptId, { version: entry.version }),
      ),
    );
    return results;
  };

  const fetchComposer = async (
    composerId: string,
    options?: { version?: string },
  ): Promise<ComposerResponse> => {
    const url = new URL(`/composers/${composerId}`, baseUrl);
    if (options?.version) {
      url.searchParams.set('version', options.version);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw await createErrorFromResponse(response);
    }

    return response.json() as Promise<ComposerResponse>;
  };

  const getComposer = async <T extends string, V extends string = 'latest'>(
    composerId: T,
    options?: GetComposerOptions<T, V>,
  ) => {
    const response = await fetchComposer(composerId, options);
    const input = (options?.input as Record<string, unknown> | undefined) ?? {};

    // Track processed segments for format() and de-duplicated prompts
    const promptsByName = new Map<string, ComposerPrompt>();
    const promptsOrdered: ComposerPrompt[] = [];
    const processedSegments: Array<
      | { type: 'static'; content: string }
      | { type: 'prompt'; camelName: string }
    > = [];

    for (const segment of response.segments) {
      if (segment.type === 'static') {
        processedSegments.push({
          type: 'static',
          content: interpolateStaticSegment(segment.content, input),
        });
        continue;
      }

      const camelName = toCamelCase(segment.promptName);

      if (!promptsByName.has(camelName)) {
        const segmentConfig = segment.config as {
          model?: string;
          temperature?: number;
        };
        const model = await modelResolver(segmentConfig.model ?? '');
        const userMessage = segment.userMessage
          ? interpolate(segment.userMessage, input)
          : '';
        const temperature = segmentConfig.temperature ?? 0.7;

        const composerPrompt: ComposerPrompt = {
          model,
          system: segment.systemMessage ?? undefined,
          prompt: userMessage,
          temperature,
          promptId: segment.promptId,
          promptName: segment.promptName,
        };

        promptsByName.set(camelName, composerPrompt);
        promptsOrdered.push(composerPrompt);
      }

      processedSegments.push({ type: 'prompt', camelName });
    }

    const formatComposer = (results: Record<string, FormatInput>): string => {
      const parts: string[] = [];
      for (const seg of processedSegments) {
        if (seg.type === 'static') {
          parts.push(seg.content);
          continue;
        }
        const val = results[seg.camelName];
        if (val === undefined) {
          continue;
        }
        parts.push(typeof val === 'string' ? val : val.text);
      }
      return parts.join('');
    };

    const compose = async (generate: ComposerGenerateFn): Promise<string> => {
      const entries = [...promptsByName.entries()];
      const results = await Promise.all(
        entries.map(([, prompt]) => generate(prompt)),
      );
      const resultMap: Record<string, FormatInput> = {};
      entries.forEach(([name], i) => {
        resultMap[name] = results[i] ?? '';
      });
      return formatComposer(resultMap);
    };

    const result: Record<string, unknown> = {
      composerId: response.composerId,
      composerName: response.composerName,
      version: response.version,
      config: response.config,
      segments: response.segments,
      prompts: promptsOrdered,
      formatComposer,
      compose,
    };

    for (const [name, prompt] of promptsByName) {
      result[name] = prompt;
    }

    return result;
  };

  const getComposers = async (entries: readonly ComposerRequest[]) => {
    const results = await Promise.all(
      entries.map((entry) =>
        getComposer(entry.composerId, {
          input: entry.input,
          version: entry.version,
        }),
      ),
    );
    return results;
  };

  return {
    getPrompt,
    getPrompts,
    getComposer,
    getComposers,
  } as PromptlyClient;
};
