import type { LLMEvent } from '../types/event.js';

/**
 * Allowlist EXPLÍCITA — última linha de defesa de privacidade.
 * Se algum dia algo passar pelos interceptors, qualquer campo fora dessa
 * lista é descartado silenciosamente antes do envio.
 */
const ALLOWED_FIELDS = new Set<keyof LLMEvent>([
  'model',
  'model_version',
  'provider',
  'input_tokens',
  'output_tokens',
  'cache_tokens',
  'latency_ms',
  'ttft_ms',
  'feature_tag',
  'user_id_hash',
  'environment',
  'timestamp',
  'is_error',
  'error_code',
  'error_message',
]);

export function sanitizeEvent(input: Record<string, unknown>): LLMEvent {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (ALLOWED_FIELDS.has(key as keyof LLMEvent)) {
      out[key] = input[key];
    }
  }
  return out as unknown as LLMEvent;
}
