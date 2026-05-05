import { describe, expect, it } from 'vitest';
import { ScopeVeil } from '../src/index.js';

describe('Azure OpenAI wrapper', () => {
  it('reports provider=azure (não openai) com mesma shape de OpenAI', async () => {
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

    // Azure usa SDK `openai` oficial — shape idêntica
    const fakeClient = {
      chat: {
        completions: {
          create: async (_args: unknown) => ({
            model: 'gpt-4o',
            usage: { prompt_tokens: 50, completion_tokens: 100 },
          }),
        },
      },
    };
    const wrapped = monitor.wrapAzureOpenAI(fakeClient);
    await wrapped.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    });
    await monitor.flush();
    await monitor.close();

    const event = seen[0].events[0];
    expect(event.provider).toBe('azure');
    expect(event.model).toBe('gpt-4o');
    expect(event.input_tokens).toBe(50);
    expect(event.output_tokens).toBe(100);
  });

  it('error path também marca provider=azure', async () => {
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
            const e = new Error('content_filter') as Error & { status: number };
            e.status = 400;
            throw e;
          },
        },
      },
    };
    const wrapped = monitor.wrapAzureOpenAI(fakeClient);
    await expect(
      wrapped.chat.completions.create({ model: 'gpt-4o', messages: [] }),
    ).rejects.toThrow('content_filter');
    await monitor.flush();
    await monitor.close();
    const event = seen[0].events[0];
    expect(event.provider).toBe('azure');
    expect(event.is_error).toBe(true);
  });
});
