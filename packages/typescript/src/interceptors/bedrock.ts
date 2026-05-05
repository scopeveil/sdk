import type { ScopeVeil } from '../client.js';
import { hashUserId } from '../utils/hash.js';
import type { LLMEvent } from '../types/event.js';

/**
 * Wrap pra `@aws-sdk/client-bedrock-runtime` (BedrockRuntimeClient).
 *
 * Bedrock tem 2 APIs:
 *   - `ConverseCommand` (recomendado): shape unificado em todos os
 *      providers. response.usage = { inputTokens, outputTokens,
 *      totalTokens, cacheReadInputTokens, cacheWriteInputTokens }
 *   - `InvokeModelCommand` (legacy): shape varia por provider
 *      (anthropic.*, mistral.*, meta.*, etc) — não suportamos aqui.
 *
 * Wrap intercepta `client.send(command)`. Detectamos ConverseCommand
 * por `command.input.modelId` (presente em Converse + ConverseStream).
 * Outros comandos passam through sem instrumentar.
 */

interface BedrockUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
}

interface BedrockResponse {
  usage?: BedrockUsage;
}

interface BedrockCommand {
  input?: { modelId?: string };
  constructor?: { name?: string };
}

interface CallContext {
  feature_tag?: string;
  user_id?: string | number;
  user_id_hash?: string;
  environment?: LLMEvent['environment'];
}

const TAG_KEYS: Array<keyof CallContext> = ['feature_tag', 'user_id', 'user_id_hash', 'environment'];

/**
 * Pra Bedrock, contexto opcional vai num campo `requestMetadata` do
 * próprio comando — campo nativo da Converse API. Mais ergonomico
 * que estender o input do command.
 */
function popContext(command: BedrockCommand): CallContext {
  const input = command.input as Record<string, unknown> | undefined;
  if (!input) return {};
  const meta = input.requestMetadata as Record<string, unknown> | undefined;
  if (!meta) return {};
  const ctx: CallContext = {};
  if (typeof meta.scopeveil_tag === 'string') {
    ctx.feature_tag = meta.scopeveil_tag;
    delete meta.scopeveil_tag;
  }
  for (const k of TAG_KEYS) {
    const key = `scopeveil_${k}`;
    if (typeof meta[key] === 'string' || typeof meta[key] === 'number') {
      (ctx as Record<string, unknown>)[k] = meta[key];
      delete meta[key];
    }
  }
  return ctx;
}

function isConverseCommand(command: unknown): command is BedrockCommand {
  if (!command || typeof command !== 'object') return false;
  const cmd = command as BedrockCommand;
  if (!cmd.input || typeof cmd.input.modelId !== 'string') return false;
  // Detecção heurística: ConverseCommand e ConverseStreamCommand.
  // Outros (InvokeModel...) também têm modelId mas não a mesma response
  // shape, então filtramos por nome de classe quando disponível.
  const name = cmd.constructor?.name;
  return name === 'ConverseCommand' || name === 'ConverseStreamCommand';
}

function extractErrorCode(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
    if (typeof e.name === 'string') return e.name;
    const status = e.$metadata?.httpStatusCode;
    if (typeof status === 'number') return `http_${status}`;
  }
  return '';
}

export function wrapBedrock<T extends object>(client: T, monitor: ScopeVeil): T {
  const original = (client as { send?: (command: unknown) => Promise<unknown> }).send;
  if (typeof original !== 'function') return client;

  const send = async function (this: unknown, command: unknown) {
    if (!isConverseCommand(command)) {
      return original.call(this, command);
    }
    const ctx = popContext(command);
    const modelId = command.input!.modelId!;
    const start = performance.now();
    try {
      const response = (await original.call(this, command)) as BedrockResponse;
      const usage = response.usage ?? {};
      const cacheTokens =
        (usage.cacheReadInputTokens ?? 0) + (usage.cacheWriteInputTokens ?? 0);
      const event: LLMEvent = {
        provider: 'bedrock',
        model: modelId,
        input_tokens: usage.inputTokens ?? 0,
        output_tokens: usage.outputTokens ?? 0,
        cache_tokens: cacheTokens,
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
        provider: 'bedrock',
        model: modelId,
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
      if (prop === 'send') return send;
      return Reflect.get(target, prop, receiver);
    },
  });
}
