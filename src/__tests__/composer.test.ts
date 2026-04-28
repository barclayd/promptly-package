import { afterEach, expect, mock, test } from 'bun:test';
import {
  createPromptlyClient,
  interpolateStaticSegment,
  toCamelCase,
} from '../client.ts';
import { PromptlyError } from '../errors.ts';
import type { ComposerId, ComposerResponse } from '../types.ts';

type MockFetch = ReturnType<typeof mock<typeof fetch>>;

const stubModel = ((id: string) => ({ modelId: id })) as (
  id: string,
) => import('ai').LanguageModel;

const mockComposerResponse: ComposerResponse = {
  composerId: 'comp-123',
  composerName: 'Test Composer',
  version: '1.0.0',
  config: {
    schema: [],
    inputData: null,
    inputDataRootName: null,
  },
  segments: [
    { type: 'static', content: '<p>Hello</p>' },
    {
      type: 'prompt',
      promptId: 'prompt-a',
      promptName: 'Intro Prompt',
      version: '1.0.0',
      systemMessage: 'You are helpful.',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      userMessage: 'Write an intro for ${name}.',
      config: { model: 'claude-haiku-4.5', temperature: 0.7 },
    },
    { type: 'static', content: '<p>---</p>' },
    {
      type: 'prompt',
      promptId: 'prompt-b',
      promptName: 'Review Prompt',
      version: '2.0.0',
      systemMessage: null,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
      userMessage: 'Review ${topic} for ${name}.',
      config: { model: 'claude-sonnet-4.5', temperature: 0.5 },
    },
    { type: 'static', content: '<p>End</p>' },
  ],
};

const originalFetch = globalThis.fetch;
const originalEnvKey = process.env.PROMPTLY_API_KEY;

const setup = (response?: ComposerResponse) => {
  const data = response ?? mockComposerResponse;
  globalThis.fetch = mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  ) as unknown as typeof fetch;

  const client = createPromptlyClient({
    apiKey: 'test-key',
    model: stubModel,
  });
  const getMockCalls = (): unknown[][] =>
    (globalThis.fetch as unknown as MockFetch).mock.calls;

  return { client, getMockCalls };
};

const setupError = (body: Record<string, unknown>, status: number) => {
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  ) as unknown as typeof fetch;

  const client = createPromptlyClient({ apiKey: 'test-key' });
  return { client };
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.PROMPTLY_API_KEY = originalEnvKey;
});

// --- toCamelCase() ---

test('toCamelCase() converts space-separated names', () => {
  expect(toCamelCase('Intro Prompt')).toBe('introPrompt');
  expect(toCamelCase('My Long Prompt Name')).toBe('myLongPromptName');
});

test('toCamelCase() converts hyphenated names', () => {
  expect(toCamelCase('review-prompt')).toBe('reviewPrompt');
  expect(toCamelCase('my-long-name')).toBe('myLongName');
});

test('toCamelCase() handles single word', () => {
  expect(toCamelCase('intro')).toBe('intro');
  expect(toCamelCase('Review')).toBe('review');
});

test('toCamelCase() lowercases first character', () => {
  expect(toCamelCase('Intro')).toBe('intro');
  expect(toCamelCase('HELLO')).toBe('hELLO');
});

// --- interpolateStaticSegment() ---

test('interpolateStaticSegment() replaces data-variable-ref spans', () => {
  const content =
    '<p>Hello <span data-variable-ref data-field-path="name"></span>!</p>';
  expect(interpolateStaticSegment(content, { name: 'Dan' })).toBe(
    '<p>Hello Dan!</p>',
  );
});

test('interpolateStaticSegment() replaces spans with alt attribute ordering', () => {
  const content =
    '<p><span data-field-path="email" data-variable-ref></span></p>';
  expect(interpolateStaticSegment(content, { email: 'a@b.com' })).toBe(
    '<p>a@b.com</p>',
  );
});

test('interpolateStaticSegment() replaces {{fieldPath}} mustache patterns', () => {
  const content = '<a href="https://example.com?q={{query}}">link</a>';
  expect(interpolateStaticSegment(content, { query: 'hello' })).toBe(
    '<a href="https://example.com?q=hello">link</a>',
  );
});

test('interpolateStaticSegment() handles missing input keys gracefully', () => {
  const content =
    '<p><span data-variable-ref data-field-path="missing"></span></p>';
  expect(interpolateStaticSegment(content, {})).toBe('<p></p>');
});

test('interpolateStaticSegment() handles multiple replacements', () => {
  const content =
    '<p><span data-variable-ref data-field-path="a"></span> and <span data-variable-ref data-field-path="b"></span></p>';
  expect(interpolateStaticSegment(content, { a: 'X', b: 'Y' })).toBe(
    '<p>X and Y</p>',
  );
});

// --- getComposer() ---

test('getComposer() fetches composer with correct URL and auth header', async () => {
  const { client, getMockCalls } = setup();
  const result = await client.getComposer('comp-123');

  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  const [url, init] = getMockCalls()[0] as [string, RequestInit];

  expect(url).toBe('https://api.promptlycms.com/composers/comp-123');
  expect(init.headers).toEqual({ Authorization: 'Bearer test-key' });
  expect(result.composerId).toBe('comp-123');
  expect(result.composerName).toBe('Test Composer');
  expect(result.version).toBe('1.0.0');
});

test('getComposer() includes version query param', async () => {
  const { client, getMockCalls } = setup();
  await client.getComposer('comp-123', { version: '2.0.0' });

  const [url] = getMockCalls()[0] as [string];
  expect(url).toBe(
    'https://api.promptlycms.com/composers/comp-123?version=2.0.0',
  );
});

test('getComposer() returns named prompt properties as camelCase', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123');

  const introPrompt = (result as Record<string, unknown>).introPrompt as {
    promptName: string;
    promptId: string;
  };
  const reviewPrompt = (result as Record<string, unknown>).reviewPrompt as {
    promptName: string;
    promptId: string;
  };

  expect(introPrompt).toBeDefined();
  expect(introPrompt.promptName).toBe('Intro Prompt');
  expect(introPrompt.promptId).toBe('prompt-a');

  expect(reviewPrompt).toBeDefined();
  expect(reviewPrompt.promptName).toBe('Review Prompt');
  expect(reviewPrompt.promptId).toBe('prompt-b');
});

test('getComposer() returns prompts array in document order', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123');

  expect(result.prompts).toHaveLength(2);
  expect(result.prompts[0]?.promptId).toBe('prompt-a');
  expect(result.prompts[1]?.promptId).toBe('prompt-b');
});

test('getComposer() deduplicates same prompt appearing multiple times', async () => {
  const dupeResponse: ComposerResponse = {
    ...mockComposerResponse,
    segments: [
      {
        type: 'prompt',
        promptId: 'prompt-a',
        promptName: 'Intro Prompt',
        version: '1.0.0',
        systemMessage: null,
        // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
        userMessage: 'Hello ${name}.',
        config: { model: 'claude-haiku-4.5', temperature: 0.7 },
      },
      { type: 'static', content: '<hr>' },
      {
        type: 'prompt',
        promptId: 'prompt-a',
        promptName: 'Intro Prompt',
        version: '1.0.0',
        systemMessage: null,
        // biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
        userMessage: 'Hello ${name}.',
        config: { model: 'claude-haiku-4.5', temperature: 0.7 },
      },
    ],
  };
  const { client } = setup(dupeResponse);
  const result = await client.getComposer('comp-123');

  expect(result.prompts).toHaveLength(1);
  expect(result.prompts[0]?.promptId).toBe('prompt-a');
});

// biome-ignore lint/suspicious/noTemplateCurlyInString: CMS template variable syntax
test('getComposer() interpolates ${var} in prompt userMessages with input', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123', {
    input: { name: 'Dan', topic: 'AI' },
  });

  expect(result.prompts[0]?.prompt).toBe('Write an intro for Dan.');
  expect(result.prompts[1]?.prompt).toBe('Review AI for Dan.');
});

test('getComposer() resolves model for each prompt segment', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123');

  expect(result.prompts[0]?.model).toBeDefined();
  expect((result.prompts[0]?.model as { modelId: string }).modelId).toBe(
    'claude-haiku-4.5',
  );
  expect((result.prompts[1]?.model as { modelId: string }).modelId).toBe(
    'claude-sonnet-4.5',
  );
});

test('getComposer() prompt segments have AI SDK compatible shape', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123', {
    input: { name: 'Dan', topic: 'AI' },
  });

  // biome-ignore lint/style/noNonNullAssertion: test assertion after length check
  const prompt = result.prompts[0]!;
  expect(prompt).toHaveProperty('model');
  expect(prompt).toHaveProperty('system');
  expect(prompt).toHaveProperty('prompt');
  expect(prompt).toHaveProperty('temperature');
  expect(prompt.system).toBe('You are helpful.');
  expect(prompt.temperature).toBe(0.7);
});

test('getComposer() sets system to undefined when systemMessage is null', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123');

  expect(result.prompts[1]?.system).toBeUndefined();
});

test('getComposer() throws PromptlyError on 404', async () => {
  const { client } = setupError(
    { error: 'Composer not found', code: 'NOT_FOUND' },
    404,
  );

  try {
    await client.getComposer('nonexistent' as ComposerId);
    expect(true).toBe(false);
  } catch (err) {
    expect(err).toBeInstanceOf(PromptlyError);
    const e = err as PromptlyError;
    expect(e.code).toBe('NOT_FOUND');
    expect(e.status).toBe(404);
  }
});

test('getComposer() throws PromptlyError on 401', async () => {
  const { client } = setupError(
    { error: 'Invalid API key', code: 'INVALID_KEY' },
    401,
  );

  try {
    await client.getComposer('comp-123');
    expect(true).toBe(false);
  } catch (err) {
    expect(err).toBeInstanceOf(PromptlyError);
    const e = err as PromptlyError;
    expect(e.code).toBe('INVALID_KEY');
    expect(e.status).toBe(401);
  }
});

test('getComposer() interpolates static segment variable refs with input', async () => {
  const varRefResponse: ComposerResponse = {
    ...mockComposerResponse,
    segments: [
      {
        type: 'static',
        content:
          '<p>Hello <span data-variable-ref data-field-path="name"></span>!</p>',
      },
    ],
  };
  const { client } = setup(varRefResponse);
  const result = await client.getComposer('comp-123', {
    input: { name: 'Dan' },
  });

  // formatComposer with no prompt results should return interpolated static content
  const output = result.formatComposer({} as Record<string, string>);
  expect(output).toBe('<p>Hello Dan!</p>');
});

// --- html_block segments ---

const HTML_BLOCK_CONTENT =
  '<!--[if mso]><table><tr><td><![endif]-->\n<div style="text-align: center;">\n  <a href="https://example.com">Click <span data-variable-ref data-field-path="name"></span></a>\n</div>\n<!--[if mso]></td></tr></table><![endif]-->';

test('getComposer() preserves html_block segment in response.segments', async () => {
  const htmlBlockResponse: ComposerResponse = {
    ...mockComposerResponse,
    segments: [
      { type: 'static', content: '<p>Before</p>' },
      { type: 'html_block', html: HTML_BLOCK_CONTENT },
      { type: 'static', content: '<p>After</p>' },
    ],
  };
  const { client } = setup(htmlBlockResponse);
  const result = await client.getComposer('comp-123', { input: { name: 'X' } });

  expect(result.segments).toHaveLength(3);
  const block = result.segments[1];
  expect(block?.type).toBe('html_block');
  if (block?.type === 'html_block') {
    expect(block.html).toBe(HTML_BLOCK_CONTENT);
  }
});

test('getComposer() interpolates variable refs inside html_block via formatComposer', async () => {
  const htmlBlockResponse: ComposerResponse = {
    ...mockComposerResponse,
    segments: [
      {
        type: 'html_block',
        html: '<div><a href="https://example.com">Hi <span data-variable-ref data-field-path="name"></span></a></div>',
      },
    ],
  };
  const { client } = setup(htmlBlockResponse);
  const result = await client.getComposer('comp-123', {
    input: { name: 'Dan' },
  });

  const output = result.formatComposer({} as Record<string, string>);
  expect(output).toBe('<div><a href="https://example.com">Hi Dan</a></div>');
});

test('getComposer() preserves MSO conditional comments byte-exactly inside html_block', async () => {
  const htmlBlockResponse: ComposerResponse = {
    ...mockComposerResponse,
    segments: [{ type: 'html_block', html: HTML_BLOCK_CONTENT }],
  };
  const { client } = setup(htmlBlockResponse);
  const result = await client.getComposer('comp-123', {
    input: { name: 'Dan' },
  });

  const output = result.formatComposer({} as Record<string, string>);
  // MSO comments and structure preserved; only the variable ref is replaced.
  expect(output).toContain('<!--[if mso]><table><tr><td><![endif]-->');
  expect(output).toContain('<!--[if mso]></td></tr></table><![endif]-->');
  expect(output).toContain('Click Dan');
  expect(output).not.toContain('data-variable-ref');
});

test('getComposer() passes embedded prompt-refs through html_block as opaque HTML', async () => {
  const htmlBlockResponse: ComposerResponse = {
    ...mockComposerResponse,
    segments: [
      {
        type: 'html_block',
        html: '<div>Wrapper <span data-prompt-ref="" data-prompt-id="prompt-a" data-prompt-name="Intro Prompt"></span></div>',
      },
    ],
  };
  const { client } = setup(htmlBlockResponse);
  const result = await client.getComposer('comp-123');

  // Prompt-refs inside html_block are NOT extracted as named prompts.
  expect(result.prompts).toHaveLength(0);

  // The raw span passes through formatComposer untouched.
  const output = result.formatComposer({} as Record<string, string>);
  expect(output).toContain('data-prompt-ref');
  expect(output).toContain('data-prompt-id="prompt-a"');
});

// --- formatComposer() ---

test('formatComposer() assembles static and prompt results in document order', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123', {
    input: { name: 'Dan', topic: 'AI' },
  });

  const output = result.formatComposer({
    introPrompt: { text: 'Intro text here.' },
    reviewPrompt: { text: 'Review text here.' },
  });

  expect(output).toBe(
    '<p>Hello</p>Intro text here.<p>---</p>Review text here.<p>End</p>',
  );
});

test('formatComposer() accepts raw string values', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123', {
    input: { name: 'Dan', topic: 'AI' },
  });

  const output = result.formatComposer({
    introPrompt: 'Raw intro.',
    reviewPrompt: 'Raw review.',
  });

  expect(output).toBe('<p>Hello</p>Raw intro.<p>---</p>Raw review.<p>End</p>');
});

test('formatComposer() accepts { text: string } values', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123', {
    input: { name: 'Dan', topic: 'AI' },
  });

  const output = result.formatComposer({
    introPrompt: { text: 'Generated intro.' },
    reviewPrompt: { text: 'Generated review.' },
  });

  expect(output).toContain('Generated intro.');
  expect(output).toContain('Generated review.');
});

test('formatComposer() reuses same result for duplicate prompt positions', async () => {
  const dupeResponse: ComposerResponse = {
    ...mockComposerResponse,
    segments: [
      {
        type: 'prompt',
        promptId: 'prompt-a',
        promptName: 'Intro Prompt',
        version: '1.0.0',
        systemMessage: null,
        userMessage: 'Hello.',
        config: { model: 'claude-haiku-4.5', temperature: 0.7 },
      },
      { type: 'static', content: ' | ' },
      {
        type: 'prompt',
        promptId: 'prompt-a',
        promptName: 'Intro Prompt',
        version: '1.0.0',
        systemMessage: null,
        userMessage: 'Hello.',
        config: { model: 'claude-haiku-4.5', temperature: 0.7 },
      },
    ],
  };
  const { client } = setup(dupeResponse);
  const result = await client.getComposer('comp-123');

  const output = result.formatComposer({
    introPrompt: 'Result A',
  } as Record<string, string>);
  expect(output).toBe('Result A | Result A');
});

test('formatComposer() skips missing results', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123');

  const output = result.formatComposer({
    introPrompt: 'Only intro.',
  } as Record<string, string>);

  expect(output).toBe('<p>Hello</p>Only intro.<p>---</p><p>End</p>');
});

// --- compose() ---

test('compose() calls generate for each prompt and assembles output', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123', {
    input: { name: 'Dan', topic: 'AI' },
  });

  const mockGenerate = async () => ({ text: 'Generated.' });
  const output = await result.compose(mockGenerate);

  expect(output).toBe('<p>Hello</p>Generated.<p>---</p>Generated.<p>End</p>');
});

test('compose() passes ComposerPrompt with correct fields to generate function', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123', {
    input: { name: 'Dan', topic: 'AI' },
  });

  const receivedPrompts: unknown[] = [];
  const mockGenerate = async (prompt: unknown) => {
    receivedPrompts.push(prompt);
    return { text: 'ok' };
  };

  await result.compose(mockGenerate);

  expect(receivedPrompts).toHaveLength(2);
  const first = receivedPrompts[0] as Record<string, unknown>;
  expect(first).toHaveProperty('model');
  expect(first).toHaveProperty('system');
  expect(first).toHaveProperty('prompt');
  expect(first).toHaveProperty('temperature');
  expect(first.prompt).toBe('Write an intro for Dan.');
});

test('compose() works with raw string return from generate', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123', {
    input: { name: 'Dan', topic: 'AI' },
  });

  const mockGenerate = async () => 'Raw text.';
  const output = await result.compose(mockGenerate);

  expect(output).toBe('<p>Hello</p>Raw text.<p>---</p>Raw text.<p>End</p>');
});

test('compose() runs prompts in parallel', async () => {
  const { client } = setup();
  const result = await client.getComposer('comp-123', {
    input: { name: 'Dan', topic: 'AI' },
  });

  const callOrder: string[] = [];
  const mockGenerate = async (prompt: { promptName: string }) => {
    callOrder.push(`start:${prompt.promptName}`);
    await new Promise((r) => setTimeout(r, 10));
    callOrder.push(`end:${prompt.promptName}`);
    return { text: prompt.promptName };
  };

  await result.compose(mockGenerate);

  // Both should start before either ends (parallel execution via Promise.all)
  expect(callOrder[0]).toBe('start:Intro Prompt');
  expect(callOrder[1]).toBe('start:Review Prompt');
});

// --- getComposers() ---

test('getComposers() fetches multiple composers in parallel', async () => {
  let callIndex = 0;
  const responses = [
    mockComposerResponse,
    { ...mockComposerResponse, composerId: 'comp-456', composerName: 'Second' },
  ];
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

  const client = createPromptlyClient({
    apiKey: 'test-key',
    model: stubModel,
  });
  const results = await client.getComposers([
    { composerId: 'comp-123' },
    { composerId: 'comp-456' },
  ]);

  expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  expect(results).toHaveLength(2);
  expect(results[0].composerId).toBe('comp-123');
  expect(results[1].composerId).toBe('comp-456');
});

test('getComposers() passes version and input per entry', async () => {
  let callIndex = 0;
  const responses = [mockComposerResponse, mockComposerResponse];
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

  const client = createPromptlyClient({
    apiKey: 'test-key',
    model: stubModel,
  });
  const getMockCalls = (): unknown[][] =>
    (globalThis.fetch as unknown as MockFetch).mock.calls;

  await client.getComposers([
    { composerId: 'comp-123', version: '1.0.0', input: { name: 'A' } },
    { composerId: 'comp-456', version: '2.0.0', input: { name: 'B' } },
  ]);

  const [firstUrl] = getMockCalls()[0] as [string];
  const [secondUrl] = getMockCalls()[1] as [string];

  expect(firstUrl).toContain('version=1.0.0');
  expect(secondUrl).toContain('version=2.0.0');
});
