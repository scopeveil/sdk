import type { ScopeVeil } from '../client.js';
import { calculateCost } from '../pricing/index.js';
import { hashUserId } from '../utils/hash.js';
import type { LLMEvent } from '../types/event.js';

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface AnthropicResponse {
  model?: string;
  usage?: AnthropicUsage;
}

interface CallContext {
  feature_tag?: string;
  user_id?: string | number;
  user_id_hash?: string;
  environment?: LLMEvent['environment'];
}

function popContext(args: unknown): CallContext {
  if (!args || typeof args !== 'object') return {};
  const obj = args as Record<string, unknown>;
  const ctx: CallContext = {};
  if (typeof obj.scopeveil_tag === 'string') ctx.feature_tag = obj.scopeveil_tag;
  if (obj.scopeveil_meta && typeof obj.scopeveil_meta === 'object') {
    const meta = obj.scopeveil_meta as Record<string, unknown>;
    if (typeof meta.feature_tag === 'string') ctx.feature_tag = meta.feature_tag;
    if (typeof meta.user_id_hash === 'string') ctx.user_id_hash = meta.user_id_hash;
    if (meta.user_id !== undefined) ctx.user_id = meta.user_id as string | number;
    if (typeof meta.environment === 'string') ctx.environment = meta.environment as LLMEvent['environment'];
  }
  delete obj.scopeveil_tag;
  delete obj.scopeveil_meta;
  return ctx;
}

export function wrapAnthropic<T extends object>(client: T, monitor: ScopeVeil): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'messages' && value && typeof value === 'object') {
        return wrapMessages(value as Record<string, unknown>, monitor);
      }
      return value;
    },
  });
}

function wrapMessages(messages: Record<string, unknown>, monitor: ScopeVeil) {
  const original = messages.create as ((args: unknown) => Promise<unknown>) | undefined;
  if (typeof original !== 'function') return messages;

  const create = async function (this: unknown, args: unknown) {
    const ctx = popContext(args);
    const start = performance.now();
    try {
      const response = (await original.call(this, args)) as AnthropicResponse;
      const usage = response.usage ?? {};
      const inputTokens = usage.input_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      const cacheTokens = (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
      const model = response.model ?? '';
      const event: LLMEvent = {
        provider: 'anthropic',
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_tokens: cacheTokens,
        latency_ms: Math.round(performance.now() - start),
        feature_tag: ctx.feature_tag ?? '',
        user_id_hash: ctx.user_id_hash ?? hashUserId(ctx.user_id ?? ''),
        cost_usd: calculateCost('anthropic', model, inputTokens, outputTokens, cacheTokens),
        environment: ctx.environment ?? monitor.defaultEnvironment(),
        timestamp: new Date().toISOString(),
      };
      monitor.track(event);
      return response;
    } catch (err) {
      const e = err as Error;
      monitor.track({
        provider: 'anthropic',
        model: '',
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Math.round(performance.now() - start),
        feature_tag: ctx.feature_tag ?? '',
        cost_usd: 0,
        timestamp: new Date().toISOString(),
        is_error: true,
        error_message: e.message?.slice(0, 500) ?? '',
      });
      throw err;
    }
  };

  return new Proxy(messages, {
    get(target, prop, receiver) {
      if (prop === 'create') return create;
      return Reflect.get(target, prop, receiver);
    },
  });
}
