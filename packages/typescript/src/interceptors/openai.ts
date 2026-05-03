import type { ScopeVeil } from '../client.js';
import { calculateCost } from '../pricing/index.js';
import { hashUserId } from '../utils/hash.js';
import type { LLMEvent } from '../types/event.js';

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

interface OpenAIChatResponse {
  model?: string;
  usage?: OpenAIUsage;
}

interface CallContext {
  feature_tag?: string;
  user_id?: string | number;
  user_id_hash?: string;
  environment?: LLMEvent['environment'];
}

const TAG_KEYS: Array<keyof CallContext> = ['feature_tag', 'user_id', 'user_id_hash', 'environment'];

function popContext(args: unknown): CallContext {
  if (!args || typeof args !== 'object') return {};
  const obj = args as Record<string, unknown>;
  const ctx: CallContext = {};
  if (typeof obj.scopeveil_tag === 'string') ctx.feature_tag = obj.scopeveil_tag;
  if (obj.scopeveil_meta) {
    const meta = obj.scopeveil_meta as Record<string, unknown>;
    for (const k of TAG_KEYS) {
      if (meta[k] !== undefined) (ctx as Record<string, unknown>)[k] = meta[k];
    }
  }
  // Always strip our metadata before forwarding to the real OpenAI client.
  delete obj.scopeveil_tag;
  delete obj.scopeveil_meta;
  return ctx;
}

function emit(monitor: ScopeVeil, ctx: CallContext, response: OpenAIChatResponse, latencyMs: number, isError: boolean, errorMessage = '') {
  const usage = response.usage ?? {};
  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  const cacheTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const model = response.model ?? '';

  const event: LLMEvent = {
    provider: 'openai',
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_tokens: cacheTokens,
    latency_ms: Math.round(latencyMs),
    feature_tag: ctx.feature_tag ?? '',
    user_id_hash: ctx.user_id_hash ?? hashUserId(ctx.user_id ?? ''),
    cost_usd: calculateCost('openai', model, inputTokens, outputTokens, cacheTokens),
    environment: ctx.environment ?? monitor.defaultEnvironment(),
    timestamp: new Date().toISOString(),
    is_error: isError,
    error_message: errorMessage.slice(0, 500),
  };

  monitor.track(event);
}

export function wrapOpenAI<T extends object>(client: T, monitor: ScopeVeil): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'chat' && value && typeof value === 'object') {
        return wrapChat(value as Record<string, unknown>, monitor);
      }
      if (prop === 'embeddings' && value && typeof value === 'object') {
        return wrapEmbeddings(value as Record<string, unknown>, monitor);
      }
      return value;
    },
  });
}

function wrapChat(chat: Record<string, unknown>, monitor: ScopeVeil) {
  return new Proxy(chat, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'completions' && value && typeof value === 'object') {
        return wrapCompletions(value as Record<string, unknown>, monitor);
      }
      return value;
    },
  });
}

function wrapCompletions(completions: Record<string, unknown>, monitor: ScopeVeil) {
  const original = completions.create as ((args: unknown) => Promise<unknown>) | undefined;
  if (typeof original !== 'function') return completions;

  const create = async function (this: unknown, args: unknown) {
    const ctx = popContext(args);
    const start = performance.now();
    try {
      const response = (await original.call(this, args)) as OpenAIChatResponse;
      emit(monitor, ctx, response, performance.now() - start, false);
      return response;
    } catch (err) {
      const e = err as Error;
      emit(monitor, ctx, {} as OpenAIChatResponse, performance.now() - start, true, e.message);
      throw err;
    }
  };

  return new Proxy(completions, {
    get(target, prop, receiver) {
      if (prop === 'create') return create;
      return Reflect.get(target, prop, receiver);
    },
  });
}

function wrapEmbeddings(embeddings: Record<string, unknown>, monitor: ScopeVeil) {
  const original = embeddings.create as ((args: unknown) => Promise<unknown>) | undefined;
  if (typeof original !== 'function') return embeddings;

  const create = async function (this: unknown, args: unknown) {
    const ctx = popContext(args);
    const start = performance.now();
    try {
      const response = (await original.call(this, args)) as OpenAIChatResponse;
      const usage = response.usage ?? {};
      const event: LLMEvent = {
        provider: 'openai',
        model: response.model ?? '',
        input_tokens: usage.prompt_tokens ?? usage.total_tokens ?? 0,
        output_tokens: 0,
        latency_ms: Math.round(performance.now() - start),
        feature_tag: ctx.feature_tag ?? '',
        user_id_hash: ctx.user_id_hash ?? hashUserId(ctx.user_id ?? ''),
        cost_usd: calculateCost('openai', response.model ?? '', usage.prompt_tokens ?? usage.total_tokens ?? 0, 0, 0),
        environment: ctx.environment ?? monitor.defaultEnvironment(),
        timestamp: new Date().toISOString(),
      };
      monitor.track(event);
      return response;
    } catch (err) {
      throw err;
    }
  };

  return new Proxy(embeddings, {
    get(target, prop, receiver) {
      if (prop === 'create') return create;
      return Reflect.get(target, prop, receiver);
    },
  });
}
