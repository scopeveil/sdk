import type { ScopeVeil } from '../client.js';
import { hashUserId } from '../utils/hash.js';
import type { LLMEvent } from '../types/event.js';

/**
 * Wrap pra `@mistralai/mistralai` SDK.
 *
 * Shape: `client.chat.complete({ model, messages })`
 *   (note: `complete`, não `completions.create` como OpenAI)
 * Response:
 *   {
 *     model: 'mistral-large-latest',
 *     usage: { prompt_tokens, completion_tokens, total_tokens },
 *     choices: [{ message: ..., finishReason: ... }],
 *   }
 */

interface MistralUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface MistralResponse {
  model?: string;
  usage?: MistralUsage;
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
  delete obj.scopeveil_tag;
  delete obj.scopeveil_meta;
  return ctx;
}

function extractModel(args: unknown): string {
  if (args && typeof args === 'object' && 'model' in args) {
    const m = (args as { model: unknown }).model;
    if (typeof m === 'string') return m;
  }
  return '';
}

function extractErrorCode(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; status?: unknown; statusCode?: unknown };
    if (typeof e.code === 'string') return e.code;
    if (typeof e.status === 'number') return `http_${e.status}`;
    if (typeof e.statusCode === 'number') return `http_${e.statusCode}`;
  }
  return '';
}

export function wrapMistral<T extends object>(client: T, monitor: ScopeVeil): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'chat' && value && typeof value === 'object') {
        return wrapChat(value as Record<string, unknown>, monitor);
      }
      return value;
    },
  });
}

function wrapChat(chat: Record<string, unknown>, monitor: ScopeVeil) {
  const original = chat.complete as ((args: unknown) => Promise<unknown>) | undefined;
  if (typeof original !== 'function') return chat;

  const complete = async function (this: unknown, args: unknown) {
    const ctx = popContext(args);
    const fallbackModel = extractModel(args);
    const start = performance.now();
    try {
      const response = (await original.call(this, args)) as MistralResponse;
      const usage = response.usage ?? {};
      const event: LLMEvent = {
        provider: 'mistral',
        model: response.model || fallbackModel || 'unknown',
        input_tokens: usage.prompt_tokens ?? 0,
        output_tokens: usage.completion_tokens ?? 0,
        latency_ms: Math.round(performance.now() - start),
        feature_tag: ctx.feature_tag ?? '',
        user_id_hash: ctx.user_id_hash ?? hashUserId(ctx.user_id ?? ''),
        environment: ctx.environment ?? monitor.defaultEnvironment(),
        timestamp: new Date().toISOString(),
      };
      monitor.track(event);
      return response;
    } catch (err) {
      const e = err as Error;
      monitor.track({
        provider: 'mistral',
        model: fallbackModel || 'unknown',
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Math.round(performance.now() - start),
        feature_tag: ctx.feature_tag ?? '',
        user_id_hash: ctx.user_id_hash ?? hashUserId(ctx.user_id ?? ''),
        environment: ctx.environment ?? monitor.defaultEnvironment(),
        timestamp: new Date().toISOString(),
        is_error: true,
        error_message: e.message?.slice(0, 500) ?? '',
        error_code: extractErrorCode(err).slice(0, 100),
      });
      throw err;
    }
  };

  return new Proxy(chat, {
    get(target, prop, receiver) {
      if (prop === 'complete') return complete;
      return Reflect.get(target, prop, receiver);
    },
  });
}
