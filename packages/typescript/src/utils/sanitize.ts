import type { LLMEvent } from '../types/event.js';

/**
 * Explicit allowlist: last line of defense for privacy.
 * If anything ever slips past the interceptors, any field outside this
 * list is silently dropped before transport.
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
