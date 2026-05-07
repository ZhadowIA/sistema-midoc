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

export function emitMetric(input: {
  domain: "auth" | "agenda" | "whatsapp";
  metric: string;
  value?: number;
  tags?: Record<string, string | number | boolean | null | undefined>;
}): void {
  logEvent("info", "metric", {
    domain: input.domain,
    metric: input.metric,
    value: input.value ?? 1,
    tags: input.tags ?? {},
  });
}

type EndpointThreshold = {
  warnMs: number;
  criticalMs: number;
};

const DEFAULT_ENDPOINT_THRESHOLD: EndpointThreshold = {
  warnMs: 800,
  criticalMs: 1500,
};

const ENDPOINT_THRESHOLDS: Record<string, EndpointThreshold> = {
  "api.agenda.dashboard.summary": { warnMs: 700, criticalMs: 1400 },
  "api.agenda.day": { warnMs: 500, criticalMs: 1000 },
  "api.agenda.week": { warnMs: 600, criticalMs: 1200 },
  "api.agenda.availability.slots": { warnMs: 400, criticalMs: 900 },
  "api.public.appointments.create": { warnMs: 900, criticalMs: 1800 },
  "api.notifications.process": { warnMs: 1200, criticalMs: 2500 },
  "api.payments.webhook": { warnMs: 1000, criticalMs: 2200 },
  "api.ai.note.generate": { warnMs: 900, criticalMs: 1800 },
};

export function logEndpointDuration(input: {
  endpoint: string;
  method: string;
  durationMs: number;
  statusCode: number;
  context?: Record<string, unknown>;
}): void {
  const threshold = ENDPOINT_THRESHOLDS[input.endpoint] ?? DEFAULT_ENDPOINT_THRESHOLD;
  const severity =
    input.durationMs >= threshold.criticalMs
      ? "critical"
      : input.durationMs >= threshold.warnMs
        ? "warning"
        : "ok";

  const level: ObservabilityLevel =
    severity === "critical" ? "error" : severity === "warning" ? "warn" : "info";

  logEvent(level, "api.endpoint.duration", {
    endpoint: input.endpoint,
    method: input.method,
    durationMs: input.durationMs,
    statusCode: input.statusCode,
    severity,
    thresholdWarnMs: threshold.warnMs,
    thresholdCriticalMs: threshold.criticalMs,
    ...input.context,
  });
}

export async function withEndpointObservability<T extends Response>(
  input: {
    endpoint: string;
    method: string;
    context?: Record<string, unknown>;
  },
  handler: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  let statusCode = 500;

  try {
    const response = await handler();
    statusCode = response.status;
    return response;
  } finally {
    logEndpointDuration({
      endpoint: input.endpoint,
      method: input.method,
      durationMs: Date.now() - startedAt,
      statusCode,
      context: input.context,
    });
  }
}
