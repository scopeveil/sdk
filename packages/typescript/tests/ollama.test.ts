import { describe, expect, it } from 'vitest';
import { ScopeVeil } from '../src/index.js';

const SENSITIVE = 'ollama secret prompt content';

describe('Ollama wrapper', () => {
  it('emits event with prompt_eval_count + eval_count', async () => {
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
        model: 'llama3.2',
        message: { role: 'assistant', content: SENSITIVE },
        prompt_eval_count: 80,
        eval_count: 40,
        prompt_eval_duration: 1_000_000,
        eval_duration: 500_000,
        total_duration: 1_600_000,
      }),
    };
    const wrapped = monitor.wrapOllama(fakeClient);
    await wrapped.chat({
      model: 'llama3.2',
      messages: [{ role: 'user', content: SENSITIVE }],
    });
    await monitor.flush();
    await monitor.close();
    expect(seen.length).toBe(1);
    const event = seen[0].events[0];
    expect(event.provider).toBe('ollama');
    expect(event.model).toBe('llama3.2');
    expect(event.input_tokens).toBe(80);
    expect(event.output_tokens).toBe(40);
    expect(JSON.stringify(seen).includes(SENSITIVE)).toBe(false);
  });

  it('wraps generate() too', async () => {
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
      generate: async () => ({
        model: 'codellama',
        response: 'output',
        prompt_eval_count: 22,
        eval_count: 11,
      }),
    };
    const wrapped = monitor.wrapOllama(fakeClient);
    await wrapped.generate({ model: 'codellama', prompt: 'def hello' });
    await monitor.flush();
    await monitor.close();
    const event = seen[0].events[0];
    expect(event.provider).toBe('ollama');
    expect(event.model).toBe('codellama');
    expect(event.input_tokens).toBe(22);
    expect(event.output_tokens).toBe(11);
  });

  it('passes streaming through without instrumenting', async () => {
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
    let originalCalled = false;
    const fakeClient = {
      chat: async (_args: any) => {
        originalCalled = true;
        return { stream: 'returned-as-is' } as any;
      },
    };
    const wrapped = monitor.wrapOllama(fakeClient);
    await wrapped.chat({ model: 'llama3.2', messages: [], stream: true });
    expect(originalCalled).toBe(true);
    await monitor.flush();
    await monitor.close();
    // streaming não emite (wrapMethod retorna early se stream=true)
    expect(seen.length).toBe(0);
  });
});
