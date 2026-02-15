import { createErrorFromResponse, PromptlyError } from './errors.ts';
import { buildZodSchema } from './schema/builder.ts';
import type {
  AiParams,
  AiParamsOptions,
  GetOptions,
  PromptlyClient,
  PromptlyClientConfig,
  PromptMessage,
  PromptRequest,
  PromptResponse,
} from './types.ts';

const DEFAULT_BASE_URL = 'https://api.promptlycms.com';

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

  try {
    switch (providerName) {
      case 'anthropic': {
        const { anthropic } = await import('@ai-sdk/anthropic');
        return anthropic(modelId);
      }
      case 'openai': {
        const { openai } = await import('@ai-sdk/openai');
        return openai(modelId);
      }
      case 'google': {
        const { google } = await import('@ai-sdk/google');
        return google(modelId);
      }
      case 'mistral': {
        const { mistral } = await import('@ai-sdk/mistral');
        return mistral(modelId);
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
  variables: Record<string, string>,
): string => {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`\${${key}}`, value);
  }
  return result;
};

const createPromptMessage = (template: string): PromptMessage => {
  const fn = (variables: Record<string, string>): string =>
    interpolate(template, variables);
  fn.toString = () => template;
  return fn as PromptMessage;
};

const createModelResolver = (
  config?: PromptlyClientConfig,
): ((modelId: string) => Promise<import('ai').LanguageModel | undefined>) => {
  if (config?.model) {
    const userResolver = config.model;
    return async (modelId: string) => userResolver(modelId);
  }

  return (modelId: string) => resolveModel(modelId);
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

  const aiParams = async (promptId: string, options?: AiParamsOptions) => {
    const prompt = await fetchPrompt(promptId, {
      version: options?.version,
    });

    const userMessage = options?.variables
      ? interpolate(prompt.userMessage, options.variables)
      : prompt.userMessage;

    const model = await modelResolver(prompt.config.model);

    const result = {
      system: prompt.systemMessage,
      prompt: userMessage,
      temperature: prompt.config.temperature,
      model,
    } as AiParams;

    if (prompt.config.schema && prompt.config.schema.length > 0) {
      const schema = buildZodSchema(prompt.config.schema);
      const { Output } = await import('ai');
      result.output = Output.object({ schema });
    }

    return result;
  };

  return { getPrompt, getPrompts, aiParams } as PromptlyClient;
};
