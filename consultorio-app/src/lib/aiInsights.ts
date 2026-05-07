import type { AIInsightAction } from "@/lib/aiInsightsTypes";

export function buildInsightApplicationKey(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function markInsightAction(
  state: Record<string, AIInsightAction>,
  text: string,
  action: AIInsightAction,
): Record<string, AIInsightAction> {
  const key = buildInsightApplicationKey(text);
  if (!key) return state;
  return { ...state, [key]: action };
}

export function getInsightAction(
  state: Record<string, AIInsightAction>,
  text: string,
): AIInsightAction | undefined {
  const key = buildInsightApplicationKey(text);
  return key ? state[key] : undefined;
}

export function markInsightApplied(
  state: Record<string, boolean | AIInsightAction>,
  text: string,
): Record<string, boolean | AIInsightAction> {
  const key = buildInsightApplicationKey(text);
  if (!key || state[key]) return state;
  return { ...state, [key]: true };
}

export function isInsightApplied(
  state: Record<string, boolean | AIInsightAction>,
  text: string,
): boolean {
  const key = buildInsightApplicationKey(text);
  if (!key) return false;
  const current = state[key];
  return current === true || current === "APPLIED" || current === "EDITED";
}
