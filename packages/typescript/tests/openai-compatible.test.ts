import { describe, expect, it } from 'vitest';
import { ScopeVeil } from '../src/index.js';

const PROVIDERS = ['groq', 'xai', 'perplexity', 'deepseek', 'together', 'fireworks', 'openrouter'] as const;

describe('OpenAI-compatible providers', () => {
  it.each(PROVIDERS)('reports correct provider=%s for OpenAI-shape clients', async (provider) => {
    const seen: any[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      seen.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response('{"accepted":1}', { status: 202 });
    };
    const monitor = new ScopeVeil({
      apiKey: 'lm_live_test',
      fetchFn: fakeFetch,
      batchSize: 1,
      flushIntervalMs: 50,
    });

    // Cliente OpenAI-shape (mesmo SDK, baseURL diferente em prod)
    const fakeClient = {
      chat: {
        completions: {
          create: async (_args: unknown) => ({
            model: `${provider}-model-x`,
            usage: { prompt_tokens: 10, completion_tokens: 20 },
          }),
        },
      },
    };
    const wrapped = monitor.wrapOpenAICompatible(fakeClient, provider);
    await wrapped.chat.completions.create({
      model: `${provider}-model-x`,
      messages: [{ role: 'user', content: 'hi' }],
    });
    await monitor.flush();
    await monitor.close();

    const event = seen[0].events[0];
    expect(event.provider).toBe(provider);
    expect(event.model).toBe(`${provider}-model-x`);
    expect(event.input_tokens).toBe(10);
    expect(event.output_tokens).toBe(20);
  });

  it('error path reporta provider correto (não fallback pra openai)', async () => {
    const seen: any[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      seen.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response('{"accepted":1}', { status: 202 });
    };
    const monitor = new ScopeVeil({
      apiKey: 'lm_live_test',
      fetchFn: fakeFetch,
      batchSize: 1,
      flushIntervalMs: 50,
    });
    const fakeClient = {
      chat: {
        completions: {
          create: async () => {
            const e = new Error('rate_limit') as Error & { status: number };
            e.status = 429;
            throw e;
          },
        },
      },
    };
    const wrapped = monitor.wrapOpenAICompatible(fakeClient, 'groq');
    await expect(
      wrapped.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [] }),
    ).rejects.toThrow('rate_limit');
    await monitor.flush();
    await monitor.close();
    const event = seen[0].events[0];
    expect(event.provider).toBe('groq');
    expect(event.is_error).toBe(true);
    expect(event.error_code).toBe('http_429');
    expect(event.model).toBe('llama-3.3-70b-versatile');
  });
});
