export function buildInsightApplicationKey(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function markInsightApplied(
  state: Record<string, boolean>,
  text: string,
): Record<string, boolean> {
  const key = buildInsightApplicationKey(text);
  if (!key || state[key]) return state;
  return { ...state, [key]: true };
}

export function isInsightApplied(
  state: Record<string, boolean>,
  text: string,
): boolean {
  const key = buildInsightApplicationKey(text);
  return Boolean(key && state[key]);
}

