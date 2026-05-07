export type AiModelPrice = {
  inputPer1kUsd: number
  outputPer1kUsd: number
}

export const AI_MODEL_PRICING_USD: Record<string, AiModelPrice> = {
  'gpt-4o': { inputPer1kUsd: 0.005, outputPer1kUsd: 0.015 },
  'whisper-1': { inputPer1kUsd: 0, outputPer1kUsd: 0 },
}

export const DEFAULT_AI_MODEL_PRICE: AiModelPrice = {
  inputPer1kUsd: 0.005,
  outputPer1kUsd: 0.015,
}

