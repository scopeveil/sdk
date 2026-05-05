import { describe, expect, it } from 'vitest';
import { ScopeVeil } from '../src/index.js';

const SENSITIVE_STRINGS = [
  'this is the secret prompt content',
  'do not leak this completion text',
  'system: you are a helpful assistant',
  'user.email@example.com',
  'CC# 4242-4242-4242-4242',
];

describe('SDK privacy guarantees', () => {
  it('OpenAI wrapper never sends prompt content to the transport', async () => {
    const seen: unknown[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      seen.push(body);
      return new Response('{"accepted":1}', { status: 202 });
    };

    const monitor = new ScopeVeil({
      apiKey: 'lm_live_test',
      endpoint: 'http://localhost:51549',
      fetchFn: fakeFetch,
      batchSize: 1,
      flushIntervalMs: 50,
    });

    const fakeOpenAI = {
      chat: {
        completions: {
          create: async (_args: unknown) => ({
            model: 'gpt-4o',
            usage: { prompt_tokens: 100, completion_tokens: 200 },
            choices: [{ message: { content: SENSITIVE_STRINGS[1] } }],
          }),
        },
      },
    };

    const wrapped = monitor.wrapOpenAI(fakeOpenAI);

    await wrapped.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SENSITIVE_STRINGS[2] },
        { role: 'user', content: SENSITIVE_STRINGS[0] },
      ],
      scopeveil_tag: 'unit-test',
    });

    await monitor.flush();
    await monitor.close();

    const serialized = JSON.stringify(seen);
    for (const sensitive of SENSITIVE_STRINGS) {
      expect(serialized.includes(sensitive)).toBe(false);
    }
    expect(seen.length).toBeGreaterThan(0);
  });

  it('Anthropic wrapper never sends prompt content to the transport', async () => {
    const seen: unknown[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      seen.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response('{"accepted":1}', { status: 202 });
    };

    const monitor = new ScopeVeil({
      apiKey: 'lm_live_test',
      endpoint: 'http://localhost:51549',
      fetchFn: fakeFetch,
      batchSize: 1,
      flushIntervalMs: 50,
    });

    const fakeAnthropic = {
      messages: {
        create: async (_args: unknown) => ({
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 50, output_tokens: 75 },
          content: [{ type: 'text', text: SENSITIVE_STRINGS[1] }],
        }),
      },
    };

    const wrapped = monitor.wrapAnthropic(fakeAnthropic);
    await wrapped.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: SENSITIVE_STRINGS[0] }],
      system: SENSITIVE_STRINGS[2],
    });

    await monitor.flush();
    await monitor.close();

    const serialized = JSON.stringify(seen);
    for (const sensitive of SENSITIVE_STRINGS) {
      expect(serialized.includes(sensitive)).toBe(false);
    }
  });

  it('Google Gemini wrapper never sends prompt content', async () => {
    const seen: unknown[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      seen.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response('{"accepted":1}', { status: 202 });
    };
    const monitor = new ScopeVeil({ apiKey: 'lm_live_test', fetchFn: fakeFetch, batchSize: 1 });
    const fakeClient = {
      models: {
        generateContent: async (_args: unknown) => ({
          modelVersion: 'gemini-2.0-flash-001',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
          candidates: [{ content: { parts: [{ text: SENSITIVE_STRINGS[1] }] } }],
        }),
      },
    };
    const wrapped = monitor.wrapGoogle(fakeClient);
    await wrapped.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: SENSITIVE_STRINGS[0] }] }],
    });
    await monitor.flush();
    await monitor.close();
    for (const s of SENSITIVE_STRINGS) {
      expect(JSON.stringify(seen).includes(s)).toBe(false);
    }
  });

  it('Mistral wrapper never sends prompt content', async () => {
    const seen: unknown[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      seen.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response('{"accepted":1}', { status: 202 });
    };
    const monitor = new ScopeVeil({ apiKey: 'lm_live_test', fetchFn: fakeFetch, batchSize: 1 });
    const fakeClient = {
      chat: {
        complete: async (_args: unknown) => ({
          model: 'mistral-large-latest',
          usage: { prompt_tokens: 10, completion_tokens: 20 },
          choices: [{ message: { role: 'assistant', content: SENSITIVE_STRINGS[1] } }],
        }),
      },
    };
    const wrapped = monitor.wrapMistral(fakeClient);
    await wrapped.chat.complete({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: SENSITIVE_STRINGS[0] }],
    });
    await monitor.flush();
    await monitor.close();
    for (const s of SENSITIVE_STRINGS) {
      expect(JSON.stringify(seen).includes(s)).toBe(false);
    }
  });

  it('Cohere wrapper never sends prompt content', async () => {
    const seen: unknown[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      seen.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response('{"accepted":1}', { status: 202 });
    };
    const monitor = new ScopeVeil({ apiKey: 'lm_live_test', fetchFn: fakeFetch, batchSize: 1 });
    const fakeClient = {
      chat: async () => ({
        text: SENSITIVE_STRINGS[1],
        model: 'command-r-plus',
        usage: { billed_units: { input_tokens: 5, output_tokens: 10 } },
      }),
    };
    const wrapped = monitor.wrapCohere(fakeClient);
    await wrapped.chat({ model: 'command-r-plus', message: SENSITIVE_STRINGS[0] });
    await monitor.flush();
    await monitor.close();
    for (const s of SENSITIVE_STRINGS) {
      expect(JSON.stringify(seen).includes(s)).toBe(false);
    }
  });

  it('Bedrock wrapper never sends prompt content', async () => {
    const seen: unknown[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      seen.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response('{"accepted":1}', { status: 202 });
    };
    const monitor = new ScopeVeil({ apiKey: 'lm_live_test', fetchFn: fakeFetch, batchSize: 1 });
    class ConverseCommand {
      constructor(public input: any) {}
    }
    const fakeClient = {
      send: async (_cmd: any) => ({
        output: { message: { content: [{ text: SENSITIVE_STRINGS[1] }] } },
        usage: { inputTokens: 10, outputTokens: 20 },
      }),
    };
    const wrapped = monitor.wrapBedrock(fakeClient);
    await wrapped.send(
      new ConverseCommand({
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        messages: [{ role: 'user', content: [{ text: SENSITIVE_STRINGS[0] }] }],
      }),
    );
    await monitor.flush();
    await monitor.close();
    for (const s of SENSITIVE_STRINGS) {
      expect(JSON.stringify(seen).includes(s)).toBe(false);
    }
  });

  it('Ollama wrapper never sends prompt content', async () => {
    const seen: unknown[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      seen.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response('{"accepted":1}', { status: 202 });
    };
    const monitor = new ScopeVeil({ apiKey: 'lm_live_test', fetchFn: fakeFetch, batchSize: 1 });
    const fakeClient = {
      chat: async () => ({
        model: 'llama3.2',
        message: { role: 'assistant', content: SENSITIVE_STRINGS[1] },
        prompt_eval_count: 10,
        eval_count: 20,
      }),
    };
    const wrapped = monitor.wrapOllama(fakeClient);
    await wrapped.chat({
      model: 'llama3.2',
      messages: [{ role: 'user', content: SENSITIVE_STRINGS[0] }],
    });
    await monitor.flush();
    await monitor.close();
    for (const s of SENSITIVE_STRINGS) {
      expect(JSON.stringify(seen).includes(s)).toBe(false);
    }
  });

  it('Azure OpenAI wrapper never sends prompt content', async () => {
    const seen: unknown[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      seen.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response('{"accepted":1}', { status: 202 });
    };
    const monitor = new ScopeVeil({ apiKey: 'lm_live_test', fetchFn: fakeFetch, batchSize: 1 });
    const fakeClient = {
      chat: {
        completions: {
          create: async (_args: unknown) => ({
            model: 'gpt-4o',
            usage: { prompt_tokens: 10, completion_tokens: 20 },
            choices: [{ message: { content: SENSITIVE_STRINGS[1] } }],
          }),
        },
      },
    };
    const wrapped = monitor.wrapAzureOpenAI(fakeClient);
    await wrapped.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: SENSITIVE_STRINGS[0] }],
    });
    await monitor.flush();
    await monitor.close();
    for (const s of SENSITIVE_STRINGS) {
      expect(JSON.stringify(seen).includes(s)).toBe(false);
    }
  });

  it('strips unknown fields via the sanitize allowlist', async () => {
    let captured: unknown = null;
    const fakeFetch: typeof fetch = async (_url, init) => {
      captured = JSON.parse(String(init?.body ?? '{}'));
      return new Response('', { status: 202 });
    };

    const monitor = new ScopeVeil({
      apiKey: 'lm_live_test',
      fetchFn: fakeFetch,
      batchSize: 1,
      flushIntervalMs: 50,
    });

    monitor.track({
      provider: 'openai',
      model: 'gpt-4o',
      input_tokens: 1,
      output_tokens: 2,
      latency_ms: 10,
      timestamp: new Date().toISOString(),
      // @ts-expect-error — testing that this is stripped
      prompt_text: SENSITIVE_STRINGS[0],
      // @ts-expect-error
      raw_email: 'user@example.com',
      // @ts-expect-error
      cost_usd: 999,
    });

    await monitor.flush();
    await monitor.close();

    expect(captured).not.toBeNull();
    const event = (captured as { events: Record<string, unknown>[] }).events[0]!;
    expect('prompt_text' in event).toBe(false);
    expect('raw_email' in event).toBe(false);
    expect('cost_usd' in event).toBe(false); // proteção contra adulteração de billing
  });
});
