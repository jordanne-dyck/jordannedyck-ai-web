// Per-1M-token prices in USD. Source: OpenAI pricing page.
// Keep in sync when adding new models.
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o':         { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':    { input: 0.15,  output: 0.60 },
  'gpt-4-turbo':    { input: 10.00, output: 30.00 },
};

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = PRICING[model];
  if (!price) return 0;
  return (
    (promptTokens / 1_000_000) * price.input +
    (completionTokens / 1_000_000) * price.output
  );
}
