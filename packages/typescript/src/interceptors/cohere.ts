import type { ScopeVeil } from '../client.js';
import { hashUserId } from '../utils/hash.js';
import type { LLMEvent } from '../types/event.js';

/**
 * Wrap pra `cohere-ai` SDK (CohereClient).
 *
 * Shape: `client.chat({ model, message })`
 * Response:
 *   {
 *     text: '...',
 *     usage: {
 *       billed_units: { input_tokens, output_tokens },
 *       tokens: { input_tokens, output_tokens },
 *     },
 *   }
 *
 * Reportamos `billed_units` (o que o cliente paga por). `tokens`
 * pode ser maior porque inclui tokens internos do model que Cohere
 * absorve. billed_units é o que importa pra cost tracking.
 */

interface CohereUsageUnit {
  input_tokens?: number;
  output_tokens?: number;
}

interface CohereResponse {
  model?: string;
  usage?: {
    billed_units?: CohereUsageUnit;
    tokens?: CohereUsageUnit;
  };
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
    if (typeof e.statusCode === 'number') return `http_${e.statusCode}`;
    if (typeof e.status === 'number') return `http_${e.status}`;
  }
  return '';
}

export function wrapCohere<T extends object>(client: T, monitor: ScopeVeil): T {
  const original = (client as Record<string, unknown>).chat as
    | ((args: unknown) => Promise<unknown>)
    | undefined;
  if (typeof original !== 'function') return client;

  const chat = async function (this: unknown, args: unknown) {
    const ctx = popContext(args);
    const fallbackModel = extractModel(args);
    const start = performance.now();
    try {
      const response = (await original.call(this, args)) as CohereResponse;
      const billed = response.usage?.billed_units ?? {};
      const event: LLMEvent = {
        provider: 'cohere',
        model: response.model || fallbackModel || 'unknown',
        input_tokens: billed.input_tokens ?? 0,
        output_tokens: billed.output_tokens ?? 0,
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
        provider: 'cohere',
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

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'chat') return chat;
      return Reflect.get(target, prop, receiver);
    },
  });
}
