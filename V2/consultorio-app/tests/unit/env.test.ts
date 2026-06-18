import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function validateEnvironment(overrides: NodeJS.ProcessEnv) {
  const tsxCli = resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
  return spawnSync(
    process.execPath,
    [tsxCli, "--env-file=.env", "--env-file=.env.local", "src/lib/env.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...overrides
      },
      encoding: "utf8"
    }
  );
}

describe("environment validation", () => {
  it("accepts a display-name email sender for provider From headers", () => {
    const result = validateEnvironment({
      EMAIL_FROM: "MiDoc <no-reply@midocapp.com.mx>"
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("rejects enabled OpenAI transcription without an API key", () => {
    const result = validateEnvironment({
      OPENAI_TRANSCRIPTION_ENABLED: "true",
      OPENAI_API_KEY: "",
      OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
      OPENAI_DIARIZATION_MODEL: "gpt-4o-transcribe-diarize",
      OPENAI_TRANSCRIPTION_ZDR_APPROVED: "true"
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("OPENAI_API_KEY");
  });

  it("rejects enabled OpenAI transcription without ZDR approval", () => {
    const result = validateEnvironment({
      OPENAI_TRANSCRIPTION_ENABLED: "true",
      OPENAI_API_KEY: "test-only-key",
      OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
      OPENAI_DIARIZATION_MODEL: "gpt-4o-transcribe-diarize",
      OPENAI_TRANSCRIPTION_ZDR_APPROVED: "false"
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("OPENAI_TRANSCRIPTION_ZDR_APPROVED");
  });

  it("accepts fully governed OpenAI transcription configuration", () => {
    const result = validateEnvironment({
      OPENAI_TRANSCRIPTION_ENABLED: "true",
      OPENAI_API_KEY: "test-only-key",
      OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
      OPENAI_DIARIZATION_MODEL: "gpt-4o-transcribe-diarize",
      OPENAI_TRANSCRIPTION_ZDR_APPROVED: "true"
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
