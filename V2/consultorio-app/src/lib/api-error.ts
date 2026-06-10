import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ServiceError } from "./errors";
import { RateLimitError } from "./rate-limit";

/**
 * Maps errors to HTTP responses without leaking internals: domain errors keep
 * their message and status; everything else becomes the generic fallback.
 */
export function toErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Datos invalidos." }, { status: 400 });
  }

  if (error instanceof RateLimitError) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta de nuevo mas tarde." },
      { status: 429 }
    );
  }

  if (error instanceof ServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("Unhandled API error:", error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

/** First client IP from x-forwarded-for, when present. */
export function requestIpFrom(request: Request): string | undefined {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || undefined;
}
