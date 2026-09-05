import { describe, expect, it } from "vitest";

import { envSchema } from "../../src/lib/env-schema";

// Base minima valida (proveedores mock para no disparar las reglas de Twilio).
// Permite probar el gate de transcripcion OpenAI de forma determinista, sin
// depender de `.env` ni de secretos reales.
function baseEnv(overrides: Record<string, string> = {}) {
  return {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/midoc",
    SESSION_SECRET: "test-secret",
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

describe("env schema Deepgram transcription gate", () => {
  it("rejects enabling Deepgram transcription without an API key", () => {
    const result = envSchema.safeParse(
      baseEnv({
        DEEPGRAM_TRANSCRIPTION_ENABLED: "true",
        DEEPGRAM_TRANSCRIPTION_BAA_APPROVED: "true"
        // DEEPGRAM_API_KEY ausente a proposito
      })
    );

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("DEEPGRAM_API_KEY");
  });

  it("rejects enabling Deepgram transcription without verified BAA / no-retention", () => {
    const result = envSchema.safeParse(
      baseEnv({
        DEEPGRAM_TRANSCRIPTION_ENABLED: "true",
        DEEPGRAM_API_KEY: "dg-test-key",
        DEEPGRAM_TRANSCRIPTION_BAA_APPROVED: "false"
      })
    );

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("DEEPGRAM_TRANSCRIPTION_BAA_APPROVED");
  });

  it("accepts a fully configured Deepgram environment", () => {
    const result = envSchema.safeParse(
      baseEnv({
        DEEPGRAM_TRANSCRIPTION_ENABLED: "true",
        DEEPGRAM_API_KEY: "dg-test-key",
        DEEPGRAM_TRANSCRIPTION_BAA_APPROVED: "true"
      })
    );

    expect(result.success).toBe(true);
  });

  it("applies safe defaults (disabled, nova-3, multi)", () => {
    const result = envSchema.safeParse(baseEnv());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DEEPGRAM_TRANSCRIPTION_ENABLED).toBe(false);
      expect(result.data.DEEPGRAM_TRANSCRIPTION_MODEL).toBe("nova-3");
      expect(result.data.DEEPGRAM_TRANSCRIPTION_LANGUAGE).toBe("multi");
      expect(result.data.DEEPGRAM_TRANSCRIPTION_BAA_APPROVED).toBe(false);
    }
  });
});

// El nombre heredado (`NEXTAUTH_SECRET`, del andamiaje inicial: V2 nunca uso
// next-auth) se sigue aceptando para no forzar una rotacion en produccion.
function envSin(clave: string) {
  const env: Record<string, string> = baseEnv();
  delete env[clave];
  return env;
}

describe("secreto de sesion: nombre nuevo y heredado", () => {
  it("acepta solo el nombre heredado y lo expone como SESSION_SECRET", () => {
    const result = envSchema.safeParse({
      ...envSin("SESSION_SECRET"),
      NEXTAUTH_SECRET: "heredado"
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.SESSION_SECRET).toBe("heredado");
  });

  it("el nombre nuevo gana cuando estan los dos", () => {
    const result = envSchema.safeParse(baseEnv({ NEXTAUTH_SECRET: "heredado" }));

    expect(result.success && result.data.SESSION_SECRET).toBe("test-secret");
  });

  it("rechaza el entorno cuando falta cualquiera de los dos", () => {
    const result = envSchema.safeParse(envSin("SESSION_SECRET"));

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("SESSION_SECRET");
  });
});
