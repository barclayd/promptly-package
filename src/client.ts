import { createErrorFromResponse } from './errors.ts';
import { buildZodSchema } from './schema/builder.ts';
import type {
  AiParams,
  AiParamsOptions,
  GetOptions,
  PromptClient,
  PromptClientConfig,
  PromptResponse,
} from './types.ts';

const DEFAULT_BASE_URL = 'https://api.promptlycms.com';

const replaceVariables = (
  text: string,
  variables: Record<string, string>,
): string => {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
};

export const createPromptClient = (
  config: PromptClientConfig,
): PromptClient => {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

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
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw await createErrorFromResponse(response);
    }

    return response.json() as Promise<PromptResponse>;
  };

  const get = (
    promptId: string,
    options?: GetOptions,
  ): Promise<PromptResponse> => fetchPrompt(promptId, options);

  const aiParams = async (
    promptId: string,
    options?: AiParamsOptions,
  ): Promise<AiParams> => {
    const prompt = await fetchPrompt(promptId, {
      version: options?.version,
    });

    let userMessage = prompt.userMessage;
    if (options?.variables) {
      userMessage = replaceVariables(userMessage, options.variables);
    }

    const result: AiParams = {
      system: prompt.systemMessage,
      prompt: userMessage,
      temperature: prompt.config.temperature,
    };

    if (prompt.config.schema && prompt.config.schema.length > 0) {
      const schema = buildZodSchema(prompt.config.schema);
      const { Output } = await import('ai');
      result.output = Output.object({ schema });
    }

    return result;
  };

  return { get, aiParams };
};
