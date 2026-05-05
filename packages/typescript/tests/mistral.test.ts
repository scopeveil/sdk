import { describe, expect, it } from 'vitest';
import { ScopeVeil } from '../src/index.js';

const SENSITIVE = 'this is the secret prompt content';

describe('Mistral wrapper', () => {
  it('emits event with usage mapped + privacy guard', async () => {
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
        complete: async (_args: unknown) => ({
          model: 'mistral-large-latest',
          usage: { prompt_tokens: 30, completion_tokens: 60, total_tokens: 90 },
          choices: [{ message: { role: 'assistant', content: SENSITIVE }, finishReason: 'stop' }],
        }),
      },
    };

    const wrapped = monitor.wrapMistral(fakeClient);
    await wrapped.chat.complete({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: SENSITIVE }],
    });
    await monitor.flush();
    await monitor.close();

    expect(seen.length).toBe(1);
    const event = seen[0].events[0];
    expect(event.provider).toBe('mistral');
    expect(event.model).toBe('mistral-large-latest');
    expect(event.input_tokens).toBe(30);
    expect(event.output_tokens).toBe(60);
    expect(JSON.stringify(seen).includes(SENSITIVE)).toBe(false);
  });

  it('emits error event with model fallback', async () => {
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
        complete: async () => {
          const e = new Error('rate_limited') as Error & { statusCode: number };
          e.statusCode = 429;
          throw e;
        },
      },
    };
    const wrapped = monitor.wrapMistral(fakeClient);
    await expect(
      wrapped.chat.complete({ model: 'mistral-medium-latest', messages: [] }),
    ).rejects.toThrow('rate_limited');
    await monitor.flush();
    await monitor.close();
    expect(seen.length).toBe(1);
    const event = seen[0].events[0];
    expect(event.is_error).toBe(true);
    expect(event.error_code).toBe('http_429');
    expect(event.model).toBe('mistral-medium-latest');
    expect(event.provider).toBe('mistral');
  });
});
