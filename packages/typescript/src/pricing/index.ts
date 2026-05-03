import models from './models.json' with { type: 'json' };

interface ModelPricing {
  input: number;
  output: number;
  cache_read?: number;
}

type PricingTable = Record<string, Record<string, ModelPricing>>;

const TABLE: PricingTable = models as PricingTable;

export function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheTokens = 0,
): number {
  const providerPricing = TABLE[provider];
  if (!providerPricing) return 0;
  const pricing = providerPricing[model];
  if (!pricing) return 0;

  const cacheCost = (pricing.cache_read ?? pricing.input * 0.1) * cacheTokens;
  return inputTokens * pricing.input + outputTokens * pricing.output + cacheCost;
}
