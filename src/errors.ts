import type { ErrorCode, ErrorResponse } from './types.ts';

export class PromptlyError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly usage?: unknown;
  readonly upgradeUrl?: string;

  constructor(
    message: string,
    code: ErrorCode,
    status: number,
    usage?: unknown,
    upgradeUrl?: string,
  ) {
    super(message);
    this.name = 'PromptlyError';
    this.code = code;
    this.status = status;
    this.usage = usage;
    this.upgradeUrl = upgradeUrl;
  }
}

export const createErrorFromResponse = async (
  response: Response,
): Promise<PromptlyError> => {
  try {
    const body = (await response.json()) as ErrorResponse;
    return new PromptlyError(
      body.error,
      body.code,
      response.status,
      body.usage,
      body.upgradeUrl,
    );
  } catch {
    return new PromptlyError(
      `HTTP ${response.status}: ${response.statusText}`,
      'BAD_REQUEST',
      response.status,
    );
  }
};
