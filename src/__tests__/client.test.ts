import { afterEach, expect, mock, test } from 'bun:test';
import { createPromptClient } from '../client.ts';
import { PromptlyError } from '../errors.ts';
import type { PromptResponse } from '../types.ts';

type MockFetch = ReturnType<typeof mock<typeof fetch>>;

const mockPromptResponse: PromptResponse = {
  promptId: 'test-id-123',
  promptName: 'Test Prompt',
  version: '1.0.0',
  systemMessage: 'You are a helpful assistant.',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
  userMessage: 'Hello ${name}, please help with ${task}.',
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

const setup = (response?: PromptResponse) => {
  const data = response ?? mockPromptResponse;
  globalThis.fetch = mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  ) as unknown as typeof fetch;

  const client = createPromptClient({ apiKey: 'test-key' });
  const getMockCalls = (): unknown[][] =>
    (globalThis.fetch as unknown as MockFetch).mock.calls;

  return { client, getMockCalls };
};

const setupError = (body: Record<string, unknown>, status: number) => {
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  ) as unknown as typeof fetch;

  const client = createPromptClient({ apiKey: 'test-key' });
  return { client };
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('get() fetches prompt with correct URL and auth header', async () => {
  const { client, getMockCalls } = setup();
  const result = await client.get('my-prompt');

  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  const [url, init] = getMockCalls()[0] as [string, RequestInit];

  expect(url).toBe('https://api.promptlycms.com/prompts/my-prompt');
  expect(init.headers).toEqual({
    Authorization: 'Bearer test-key',
  });
  expect(result.promptId).toBe(mockPromptResponse.promptId);
  expect(result.systemMessage).toBe(mockPromptResponse.systemMessage);
  expect(String(result.userMessage)).toBe(mockPromptResponse.userMessage);
  expect(result.config).toEqual(mockPromptResponse.config);
  expect(result.temperature).toBe(mockPromptResponse.config.temperature);
});

test('get() includes version query param', async () => {
  const { client, getMockCalls } = setup();
  await client.get('my-prompt', { version: '2.0.0' });

  const [url] = getMockCalls()[0] as [string];
  expect(url).toBe(
    'https://api.promptlycms.com/prompts/my-prompt?version=2.0.0',
  );
});

test('get() uses custom base URL', async () => {
  setup();
  const client = createPromptClient({
    apiKey: 'test-key',
    baseUrl: 'https://custom.api.com',
  });
  await client.get('my-prompt');

  const getMockCalls = (): unknown[][] =>
    (globalThis.fetch as unknown as MockFetch).mock.calls;
  const [url] = getMockCalls()[0] as [string];
  expect(url).toBe('https://custom.api.com/prompts/my-prompt');
});

test('get() throws PromptlyError on 401', async () => {
  const { client } = setupError(
    { error: 'Invalid API key', code: 'INVALID_KEY' },
    401,
  );

  try {
    await client.get('my-prompt');
    expect(true).toBe(false);
  } catch (err) {
    expect(err).toBeInstanceOf(PromptlyError);
    const e = err as PromptlyError;
    expect(e.code).toBe('INVALID_KEY');
    expect(e.status).toBe(401);
    expect(e.message).toBe('Invalid API key');
  }
});

test('get() throws PromptlyError on 404', async () => {
  const { client } = setupError(
    { error: 'Prompt not found', code: 'NOT_FOUND' },
    404,
  );

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

test('get() throws PromptlyError on 429 with usage and upgradeUrl', async () => {
  const { client } = setupError(
    {
      error: 'Rate limit exceeded',
      code: 'USAGE_LIMIT_EXCEEDED',
      usage: { current: 100, limit: 100 },
      upgradeUrl: 'https://promptlycms.com/upgrade',
    },
    429,
  );

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

test('aiParams() returns system, prompt, and temperature', async () => {
  const { client } = setup();
  const params = await client.aiParams('my-prompt');

  expect(params.system).toBe('You are a helpful assistant.');
  expect(params.prompt).toBe(mockPromptResponse.userMessage);
  expect(params.temperature).toBe(0.7);
  expect(params.output).toBeUndefined();
});

test('aiParams() replaces template variables', async () => {
  const { client } = setup();
  const params = await client.aiParams('my-prompt', {
    variables: { name: 'Alice', task: 'coding' },
  });

  expect(params.prompt).toBe('Hello Alice, please help with coding.');
});

test('aiParams() includes output when schema exists', async () => {
  const { client } = setup(mockPromptWithSchema);
  const params = await client.aiParams('my-prompt');

  expect(params.output).toBeDefined();
});

test('aiParams() passes version option through', async () => {
  const { client, getMockCalls } = setup();
  await client.aiParams('my-prompt', { version: '1.5.0' });

  const [url] = getMockCalls()[0] as [string];
  expect(url).toContain('version=1.5.0');
});

test('get() returns callable userMessage that interpolates variables', async () => {
  const { client } = setup();
  const result = await client.get('my-prompt');

  expect(result.userMessage({ name: 'Alice', task: 'coding' })).toBe(
    'Hello Alice, please help with coding.',
  );
});

test('get() returns userMessage with toString() for raw template', async () => {
  const { client } = setup();
  const result = await client.get('my-prompt');

  expect(result.userMessage.toString()).toBe(mockPromptResponse.userMessage);
  expect(String(result.userMessage)).toBe(mockPromptResponse.userMessage);
});

test('get() returns temperature at top level', async () => {
  const { client } = setup();
  const result = await client.get('my-prompt');

  expect(result.temperature).toBe(0.7);
  expect(result.temperature).toBe(result.config.temperature);
});

// --- getPrompts() tests ---

const mockSecondPromptResponse: PromptResponse = {
  promptId: 'second-id-456',
  promptName: 'Second Prompt',
  version: '2.0.0',
  systemMessage: 'You are a second assistant.',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
  userMessage: 'Email to ${email} about ${subject}.',
  config: {
    model: 'claude-sonnet-4.5',
    temperature: 0.5,
    schema: [],
    inputData: null,
    inputDataRootName: null,
  },
};

const setupMulti = (responses: PromptResponse[]) => {
  let callIndex = 0;
  globalThis.fetch = mock(() => {
    const data = responses[callIndex] ?? responses[0];
    callIndex++;
    return Promise.resolve(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;

  const client = createPromptClient({ apiKey: 'test-key' });
  const getMockCalls = (): unknown[][] =>
    (globalThis.fetch as unknown as MockFetch).mock.calls;

  return { client, getMockCalls };
};

test('getPrompts() fetches multiple prompts in parallel', async () => {
  const { client } = setupMulti([mockPromptResponse, mockSecondPromptResponse]);

  const results = await client.getPrompts([
    { promptId: 'test-id-123' },
    { promptId: 'second-id-456' },
  ]);

  expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  expect(results).toHaveLength(2);
});

test('getPrompts() returns results in same order as input', async () => {
  const { client } = setupMulti([mockPromptResponse, mockSecondPromptResponse]);

  const [first, second] = await client.getPrompts([
    { promptId: 'test-id-123' },
    { promptId: 'second-id-456' },
  ]);

  expect(first.promptId).toBe('test-id-123');
  expect(first.temperature).toBe(0.7);
  expect(typeof first.userMessage).toBe('function');
  expect(first.userMessage({ name: 'Alice', task: 'coding' })).toBe(
    'Hello Alice, please help with coding.',
  );

  expect(second.promptId).toBe('second-id-456');
  expect(second.temperature).toBe(0.5);
  expect(second.userMessage({ email: 'a@b.com', subject: 'Hi' })).toBe(
    'Email to a@b.com about Hi.',
  );
});

test('getPrompts() passes version option per entry', async () => {
  const { client, getMockCalls } = setupMulti([
    mockPromptResponse,
    mockSecondPromptResponse,
  ]);

  await client.getPrompts([
    { promptId: 'test-id-123', version: '1.0.0' },
    { promptId: 'second-id-456', version: '2.0.0' },
  ]);

  const [firstUrl] = getMockCalls()[0] as [string];
  const [secondUrl] = getMockCalls()[1] as [string];

  expect(firstUrl).toContain('version=1.0.0');
  expect(secondUrl).toContain('version=2.0.0');
});
