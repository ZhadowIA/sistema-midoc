import { describe, expect, it } from "vitest";

import { envSchema } from "../../src/lib/env-schema";

// Base minima valida (proveedores mock para no disparar las reglas de Twilio).
// Permite probar el gate de transcripcion OpenAI de forma determinista, sin
// depender de `.env` ni de secretos reales.
function baseEnv(overrides: Record<string, string> = {}) {
  return {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/midoc",
    NEXTAUTH_SECRET: "test-secret",
    APP_BASE_URL: "https://app.midoc.test",
    QUESTIONNAIRE_TOKEN_SECRET: "test-questionnaire-secret",
    TERMS_VERSION: "1",
    PRIVACY_VERSION: "1",
    SMS_PROVIDER: "mock",
    SMS_BASE_URL: "https://sms.midoc.test",
    SMS_API_KEY: "test-sms-key",
    EMAIL_PROVIDER: "mock",
    EMAIL_BASE_URL: "https://email.midoc.test",
    EMAIL_API_KEY: "test-email-key",
    EMAIL_FROM: "MiDoc <no-reply@midocapp.com.mx>",
    NOTIFICATION_CRON_SECRET: "test-cron-secret",
    PAYMENTS_PROVIDER: "MOCK",
    PAYMENTS_WEBHOOK_SECRET: "test-webhook-secret",
    TWO_FACTOR_ENCRYPTION_KEY: "0123456789abcdef",
    ...overrides
  };
}

function issuePaths(result: ReturnType<typeof envSchema.safeParse>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("env schema OpenAI transcription gate", () => {
  it("accepts an environment with cloud transcription disabled", () => {
    const result = envSchema.safeParse(baseEnv());
    expect(result.success).toBe(true);
  });

  it("rejects enabling cloud transcription without an API key", () => {
    const result = envSchema.safeParse(
      baseEnv({
        OPENAI_TRANSCRIPTION_ENABLED: "true",
        OPENAI_TRANSCRIPTION_ZDR_APPROVED: "true"
        // OPENAI_API_KEY ausente a proposito
      })
    );

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("OPENAI_API_KEY");
  });

  it("rejects enabling cloud transcription without verified Zero Data Retention", () => {
    const result = envSchema.safeParse(
      baseEnv({
        OPENAI_TRANSCRIPTION_ENABLED: "true",
        OPENAI_API_KEY: "sk-test-key",
        OPENAI_TRANSCRIPTION_ZDR_APPROVED: "false"
      })
    );

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("OPENAI_TRANSCRIPTION_ZDR_APPROVED");
  });

  it("accepts a fully configured cloud transcription environment", () => {
    const result = envSchema.safeParse(
      baseEnv({
        OPENAI_TRANSCRIPTION_ENABLED: "true",
        OPENAI_API_KEY: "sk-test-key",
        OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
        OPENAI_DIARIZATION_MODEL: "gpt-4o-transcribe-diarize",
        OPENAI_TRANSCRIPTION_ZDR_APPROVED: "true"
      })
    );

    expect(result.success).toBe(true);
  });

  it("applies safe defaults for the transcription model and disabled flag", () => {
    const result = envSchema.safeParse(baseEnv());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.OPENAI_TRANSCRIPTION_ENABLED).toBe(false);
      expect(result.data.OPENAI_TRANSCRIPTION_MODEL).toBe("gpt-4o-mini-transcribe");
      expect(result.data.OPENAI_DIARIZATION_MODEL).toBe("gpt-4o-transcribe-diarize");
      expect(result.data.OPENAI_TRANSCRIPTION_ZDR_APPROVED).toBe(false);
    }
  });
});
