import { describe, expect, it } from 'vitest';
import { calculateCost } from '../src/pricing/index.js';

describe('calculateCost', () => {
  it('computes OpenAI gpt-4o cost', () => {
    // 1000 input ($0.0025) + 500 output ($0.005) = 0.0075
    const cost = calculateCost('openai', 'gpt-4o', 1000, 500);
    expect(cost).toBeCloseTo(0.0075, 6);
  });

  it('returns 0 for unknown models without crashing', () => {
    expect(calculateCost('openai', 'gpt-9000', 1000, 500)).toBe(0);
    expect(calculateCost('unknown', 'whatever', 100, 50)).toBe(0);
  });

  it('applies cache_read pricing when present', () => {
    // claude-sonnet-4-6: cache_read = 0.0000003
    const cost = calculateCost('anthropic', 'claude-sonnet-4-6', 0, 0, 1000);
    expect(cost).toBeCloseTo(0.0003, 6);
  });
});
