type ObservabilityLevel = "info" | "warn" | "error";

type ObservabilityLog = {
  level: ObservabilityLevel;
  event: string;
  timestamp: string;
  context?: Record<string, unknown>;
};

export function logEvent(level: ObservabilityLevel, event: string, context?: Record<string, unknown>): void {
  const payload: ObservabilityLog = {
    level,
    event,
    timestamp: new Date().toISOString(),
    context,
  };

  const serialized = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialized);
    return;
  }
  if (level === "warn") {
    console.warn(serialized);
    return;
  }
  console.info(serialized);
}

export function captureError(event: string, error: unknown, context?: Record<string, unknown>): void {
  const normalized =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) };

  logEvent("error", event, {
    ...context,
    error: normalized,
  });
}
