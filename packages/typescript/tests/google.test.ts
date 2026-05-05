import { describe, expect, it } from 'vitest';
import { ScopeVeil } from '../src/index.js';

const SENSITIVE = 'this is the secret prompt content';

describe('Google Gemini wrapper', () => {
  it('emits event with usageMetadata mapped + privacy guard', async () => {
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
      models: {
        generateContent: async (_args: unknown) => ({
          modelVersion: 'gemini-2.0-flash-001',
          usageMetadata: {
            promptTokenCount: 25,
            candidatesTokenCount: 50,
            totalTokenCount: 75,
            cachedContentTokenCount: 10,
          },
          candidates: [{ content: { parts: [{ text: SENSITIVE }] } }],
        }),
      },
    };

    const wrapped = monitor.wrapGoogle(fakeClient);
    await wrapped.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: SENSITIVE }] }],
    });
    await monitor.flush();
    await monitor.close();

    expect(seen.length).toBe(1);
    const event = seen[0].events[0];
    expect(event.provider).toBe('google');
    expect(event.model).toBe('gemini-2.0-flash-001');
    expect(event.input_tokens).toBe(25);
    expect(event.output_tokens).toBe(50);
    expect(event.cache_tokens).toBe(10);
    // Privacy: nada do prompt vaza
    expect(JSON.stringify(seen).includes(SENSITIVE)).toBe(false);
  });

  it('emits error event with model fallback when generateContent throws', async () => {
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
      models: {
        generateContent: async () => {
          const e = new Error('quota_exceeded') as Error & { status: number };
          e.status = 429;
          throw e;
        },
      },
    };
    const wrapped = monitor.wrapGoogle(fakeClient);
    let thrown: any;
    try {
      await wrapped.models.generateContent({ model: 'gemini-1.5-pro', contents: [] });
    } catch (e) {
      thrown = e;
    }
    expect(thrown.message).toBe('quota_exceeded');
    await monitor.flush();
    await monitor.close();
    expect(seen.length).toBe(1);
    const event = seen[0].events[0];
    expect(event.is_error).toBe(true);
    expect(event.error_code).toBe('http_429');
    expect(event.model).toBe('gemini-1.5-pro');
    expect(event.provider).toBe('google');
  });
});
