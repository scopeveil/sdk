import type { ScopeVeil } from '../client.js';
import { hashUserId } from '../utils/hash.js';
import type { LLMEvent } from '../types/event.js';

/**
 * Wrap pra `ollama` SDK (ollama-js).
 *
 * Shape: `client.chat({ model, messages })` ou `client.generate(...)`
 * Response (não-streaming):
 *   {
 *     model: 'llama3.2',
 *     prompt_eval_count: 100,    // input tokens
 *     eval_count: 50,            // output tokens
 *     prompt_eval_duration: ns,
 *     eval_duration: ns,
 *     total_duration: ns,
 *     message: { role, content }
 *   }
 *
 * Diferente dos providers SaaS: Ollama é self-hosted, então o
 * billing aspect é "irrelevante" — mas latência/tokens ainda
 * importam pra capacity planning. cost_usd vai ser 0 server-side.
 *
 * Streaming: o último chunk tem o eval_count + prompt_eval_count.
 * Não wrap aqui — caller que precisa juntar os chunks.
 */

interface OllamaResponse {
  model?: string;
  prompt_eval_count?: number;
  eval_count?: number;
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

function wrapMethod(
  client: Record<string, unknown>,
  prop: string,
  monitor: ScopeVeil,
): ((args: unknown) => Promise<unknown>) | undefined {
  const original = client[prop] as ((args: unknown) => Promise<unknown>) | undefined;
  if (typeof original !== 'function') return undefined;

  return async function (this: unknown, args: unknown) {
    // Streaming retorna AsyncGenerator — não instrumentamos aqui
    // (o caller precisa consumir e os tokens só aparecem no último
    // chunk). Pass through quando stream=true.
    if (args && typeof args === 'object' && (args as { stream?: unknown }).stream === true) {
      return original.call(this, args);
    }

    const ctx = popContext(args);
    const fallbackModel = extractModel(args);
    const start = performance.now();
    try {
      const response = (await original.call(this, args)) as OllamaResponse;
      const event: LLMEvent = {
        provider: 'ollama',
        model: response.model || fallbackModel || 'unknown',
        input_tokens: response.prompt_eval_count ?? 0,
        output_tokens: response.eval_count ?? 0,
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
        provider: 'ollama',
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
}

export function wrapOllama<T extends object>(client: T, monitor: ScopeVeil): T {
  const target = client as Record<string, unknown>;
  const chat = wrapMethod(target, 'chat', monitor);
  const generate = wrapMethod(target, 'generate', monitor);

  return new Proxy(client, {
    get(t, prop, receiver) {
      if (prop === 'chat' && chat) return chat;
      if (prop === 'generate' && generate) return generate;
      return Reflect.get(t, prop, receiver);
    },
  });
}
