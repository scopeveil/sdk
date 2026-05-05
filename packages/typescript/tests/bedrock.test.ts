import { describe, expect, it } from 'vitest';
import { ScopeVeil } from '../src/index.js';

const SENSITIVE = 'bedrock secret prompt content';

class ConverseCommand {
  constructor(public input: any) {}
}

class OtherCommand {
  constructor(public input: any) {}
}

describe('Bedrock wrapper', () => {
  it('emits event for ConverseCommand with usage mapped + privacy', async () => {
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
      send: async (cmd: any) => ({
        output: { message: { content: [{ text: SENSITIVE }] } },
        stopReason: 'end_turn',
        usage: {
          inputTokens: 30,
          outputTokens: 100,
          totalTokens: 130,
          cacheReadInputTokens: 5,
          cacheWriteInputTokens: 0,
        },
      }),
    };
    const wrapped = monitor.wrapBedrock(fakeClient);
    const cmd = new ConverseCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      messages: [{ role: 'user', content: [{ text: SENSITIVE }] }],
    });
    await wrapped.send(cmd);
    await monitor.flush();
    await monitor.close();

    expect(seen.length).toBe(1);
    const event = seen[0].events[0];
    expect(event.provider).toBe('bedrock');
    expect(event.model).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0');
    expect(event.input_tokens).toBe(30);
    expect(event.output_tokens).toBe(100);
    expect(event.cache_tokens).toBe(5);
    expect(JSON.stringify(seen).includes(SENSITIVE)).toBe(false);
  });

  it('passes through non-Converse commands without instrumenting', async () => {
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
    let originalSendCalled = false;
    const fakeClient = {
      send: async (_cmd: any) => {
        originalSendCalled = true;
        return { someResult: true };
      },
    };
    const wrapped = monitor.wrapBedrock(fakeClient);
    const cmd = new OtherCommand({ modelId: 'anything' });
    const result = await wrapped.send(cmd);
    expect(originalSendCalled).toBe(true);
    expect((result as any).someResult).toBe(true);
    await monitor.flush();
    await monitor.close();
    expect(seen.length).toBe(0);
  });

  it('emits error event with bedrock error name as code', async () => {
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
      send: async (_cmd: any) => {
        const e = new Error('Throughput throttled') as Error & {
          name: string;
          $metadata: { httpStatusCode: number };
        };
        e.name = 'ThrottlingException';
        e.$metadata = { httpStatusCode: 429 };
        throw e;
      },
    };
    const wrapped = monitor.wrapBedrock(fakeClient);
    const cmd = new ConverseCommand({
      modelId: 'meta.llama3-70b-instruct-v1:0',
      messages: [],
    });
    await expect(wrapped.send(cmd)).rejects.toThrow('Throughput throttled');
    await monitor.flush();
    await monitor.close();
    const event = seen[0].events[0];
    expect(event.is_error).toBe(true);
    expect(event.error_code).toBe('ThrottlingException');
    expect(event.model).toBe('meta.llama3-70b-instruct-v1:0');
    expect(event.provider).toBe('bedrock');
  });
});
