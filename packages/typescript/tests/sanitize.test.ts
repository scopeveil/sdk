import { describe, expect, it } from 'vitest';
import { sanitizeEvent } from '../src/utils/sanitize.js';

describe('sanitizeEvent', () => {
  it('keeps only allowlisted fields', () => {
    const out = sanitizeEvent({
      model: 'gpt-4o',
      provider: 'openai',
      input_tokens: 1,
      output_tokens: 1,
      latency_ms: 1,
      timestamp: '2026-05-03T00:00:00.000Z',
      prompt_text: 'do not pass go',
      user_email: 'leak@example.com',
    });
    expect('prompt_text' in out).toBe(false);
    expect('user_email' in out).toBe(false);
    expect(out.model).toBe('gpt-4o');
  });

  it('strips cost_usd if a caller tries to inject it (server computes cost)', () => {
    const out = sanitizeEvent({
      model: 'gpt-4o',
      provider: 'openai',
      input_tokens: 1,
      output_tokens: 1,
      latency_ms: 1,
      timestamp: '2026-05-03T00:00:00.000Z',
      cost_usd: 999, // tentativa de adulteração
    });
    expect('cost_usd' in out).toBe(false);
  });
});
