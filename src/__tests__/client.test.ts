import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPromptClient } from '../client.ts';
import { PromptlyError } from '../errors.ts';
import type { PromptResponse } from '../types.ts';

type MockFetch = ReturnType<typeof mock<typeof fetch>>;

const mockPromptResponse: PromptResponse = {
  promptId: 'test-id-123',
  promptName: 'Test Prompt',
  version: '1.0.0',
  systemMessage: 'You are a helpful assistant.',
  userMessage: 'Hello {{name}}, please help with {{task}}.',
  config: {
    model: 'claude-haiku-4.5',
    temperature: 0.7,
    schema: [],
    inputData: null,
    inputDataRootName: null,
  },
};

const mockPromptWithSchema: PromptResponse = {
  ...mockPromptResponse,
  config: {
    ...mockPromptResponse.config,
    schema: [
      {
        id: '1',
        name: 'category',
        type: 'enum',
        validations: [],
        params: {
          enumValues: ['spam', 'important'],
          description: 'Email category',
        },
      },
      {
        id: '2',
        name: 'confidence',
        type: 'number',
        validations: [
          { id: 'v1', type: 'min', value: '0', message: 'Min 0' },
          { id: 'v2', type: 'max', value: '1', message: 'Max 1' },
        ],
        params: { description: 'Confidence score' },
      },
    ],
  },
};

const originalFetch = globalThis.fetch;

const mockFetchWith = (response: Response): void => {
  globalThis.fetch = mock(() =>
    Promise.resolve(response),
  ) as unknown as typeof fetch;
};

const getMockCalls = (): unknown[][] =>
  (globalThis.fetch as unknown as MockFetch).mock.calls;

beforeEach(() => {
  mockFetchWith(
    new Response(JSON.stringify(mockPromptResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('createPromptClient', () => {
  describe('get()', () => {
    test('fetches prompt with correct URL and auth header', async () => {
      const client = createPromptClient({ apiKey: 'test-key' });
      const result = await client.get('my-prompt');

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = getMockCalls()[0] as [string, RequestInit];

      expect(url).toBe('https://api.promptlycms.com/prompts/my-prompt');
      expect(init.headers).toEqual({
        Authorization: 'Bearer test-key',
      });
      expect(result).toEqual(mockPromptResponse);
    });

    test('includes version query param', async () => {
      const client = createPromptClient({ apiKey: 'test-key' });
      await client.get('my-prompt', { version: '2.0.0' });

      const [url] = getMockCalls()[0] as [string];
      expect(url).toBe(
        'https://api.promptlycms.com/prompts/my-prompt?version=2.0.0',
      );
    });

    test('uses custom base URL', async () => {
      const client = createPromptClient({
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com',
      });
      await client.get('my-prompt');

      const [url] = getMockCalls()[0] as [string];
      expect(url).toBe('https://custom.api.com/prompts/my-prompt');
    });

    test('throws PromptlyError on 401', async () => {
      mockFetchWith(
        new Response(
          JSON.stringify({
            error: 'Invalid API key',
            code: 'INVALID_KEY',
          }),
          { status: 401 },
        ),
      );

      const client = createPromptClient({ apiKey: 'bad-key' });
      try {
        await client.get('my-prompt');
        expect(true).toBe(false); // should not reach
      } catch (err) {
        expect(err).toBeInstanceOf(PromptlyError);
        const e = err as PromptlyError;
        expect(e.code).toBe('INVALID_KEY');
        expect(e.status).toBe(401);
        expect(e.message).toBe('Invalid API key');
      }
    });

    test('throws PromptlyError on 404', async () => {
      mockFetchWith(
        new Response(
          JSON.stringify({
            error: 'Prompt not found',
            code: 'NOT_FOUND',
          }),
          { status: 404 },
        ),
      );

      const client = createPromptClient({ apiKey: 'test-key' });
      try {
        await client.get('nonexistent');
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(PromptlyError);
        const e = err as PromptlyError;
        expect(e.code).toBe('NOT_FOUND');
        expect(e.status).toBe(404);
      }
    });

    test('throws PromptlyError on 429 with usage and upgradeUrl', async () => {
      mockFetchWith(
        new Response(
          JSON.stringify({
            error: 'Rate limit exceeded',
            code: 'USAGE_LIMIT_EXCEEDED',
            usage: { current: 100, limit: 100 },
            upgradeUrl: 'https://promptlycms.com/upgrade',
          }),
          { status: 429 },
        ),
      );

      const client = createPromptClient({ apiKey: 'test-key' });
      try {
        await client.get('my-prompt');
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(PromptlyError);
        const e = err as PromptlyError;
        expect(e.code).toBe('USAGE_LIMIT_EXCEEDED');
        expect(e.status).toBe(429);
        expect(e.usage).toEqual({ current: 100, limit: 100 });
        expect(e.upgradeUrl).toBe('https://promptlycms.com/upgrade');
      }
    });
  });

  describe('aiParams()', () => {
    test('returns system, prompt, and temperature', async () => {
      const client = createPromptClient({ apiKey: 'test-key' });
      const params = await client.aiParams('my-prompt');

      expect(params.system).toBe('You are a helpful assistant.');
      expect(params.prompt).toBe('Hello {{name}}, please help with {{task}}.');
      expect(params.temperature).toBe(0.7);
      expect(params.output).toBeUndefined();
    });

    test('replaces template variables', async () => {
      const client = createPromptClient({ apiKey: 'test-key' });
      const params = await client.aiParams('my-prompt', {
        variables: { name: 'Alice', task: 'coding' },
      });

      expect(params.prompt).toBe('Hello Alice, please help with coding.');
    });

    test('includes output when schema exists', async () => {
      mockFetchWith(
        new Response(JSON.stringify(mockPromptWithSchema), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const client = createPromptClient({ apiKey: 'test-key' });
      const params = await client.aiParams('my-prompt');

      expect(params.output).toBeDefined();
    });

    test('passes version option through', async () => {
      const client = createPromptClient({ apiKey: 'test-key' });
      await client.aiParams('my-prompt', { version: '1.5.0' });

      const [url] = getMockCalls()[0] as [string];
      expect(url).toContain('version=1.5.0');
    });
  });
});
