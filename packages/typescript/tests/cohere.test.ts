import { describe, expect, it } from 'vitest';
import { ScopeVeil } from '../src/index.js';

const SENSITIVE = 'cohere secret prompt content';

describe('Cohere wrapper', () => {
  it('emits event with billed_units mapped + privacy guard', async () => {
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
      chat: async (_args: unknown) => ({
        text: SENSITIVE,
        model: 'command-r-plus',
        usage: {
          billed_units: { input_tokens: 12, output_tokens: 34 },
          tokens: { input_tokens: 80, output_tokens: 34 },
        },
      }),
    };
    const wrapped = monitor.wrapCohere(fakeClient);
    await wrapped.chat({ model: 'command-r-plus', message: SENSITIVE });
    await monitor.flush();
    await monitor.close();

    expect(seen.length).toBe(1);
    const event = seen[0].events[0];
    expect(event.provider).toBe('cohere');
    expect(event.model).toBe('command-r-plus');
    // billed_units (não tokens) — cliente paga por isso
    expect(event.input_tokens).toBe(12);
    expect(event.output_tokens).toBe(34);
    expect(JSON.stringify(seen).includes(SENSITIVE)).toBe(false);
  });

  it('emits error event with model fallback when chat throws', async () => {
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
      chat: async () => {
        const e = new Error('quota exceeded') as Error & { statusCode: number };
        e.statusCode = 429;
        throw e;
      },
    };
    const wrapped = monitor.wrapCohere(fakeClient);
    await expect(wrapped.chat({ model: 'command-r', message: 'hi' })).rejects.toThrow('quota exceeded');
    await monitor.flush();
    await monitor.close();
    const event = seen[0].events[0];
    expect(event.is_error).toBe(true);
    expect(event.error_code).toBe('http_429');
    expect(event.model).toBe('command-r');
    expect(event.provider).toBe('cohere');
  });
});
