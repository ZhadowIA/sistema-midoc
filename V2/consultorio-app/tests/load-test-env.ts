import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Shared test environment loader. Used by the Vitest setup file (so modules that
// validate configuration at import time, like src/lib/env.ts, can run) and by
// the E2E global setup (so the spawned `next dev` inherits a complete env).
// Precedence mirrors Next.js: an already-defined process.env value wins, then
// .env.local, then .env, then hermetic mock defaults.

function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const withoutExport = line.startsWith("export ") ? line.slice(7) : line;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) {
      continue;
    }

    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadEnvFile(fileName: string): Record<string, string> {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) {
    return {};
  }

  return parseEnvFile(readFileSync(filePath, "utf8"));
}

// Non-secret placeholders for provider config that src/lib/env.ts requires but
// that a developer's local .env may predate (the EMAIL_* block was added in
// paso 7). Applied only when still unset; tests run against mock providers.
const testDefaults: Record<string, string> = {
  EMAIL_PROVIDER: "mock",
  EMAIL_BASE_URL: "https://email.example.com",
  EMAIL_API_KEY: "mock-email-key",
  EMAIL_FROM: "no-responder@midoc.example.com",
  SMS_PROVIDER: "mock",
  SMS_BASE_URL: "https://sms.example.com",
  SMS_API_KEY: "mock-sms-key",
  WHATSAPP_PROVIDER: "mock",
  PHONE_NOTIFICATION_CHANNEL: "SMS",
  // Placeholder no secreto para 2FA (paso 12): los tests cifran/descifran contra esta llave.
  TWO_FACTOR_ENCRYPTION_KEY: "test-two-factor-encryption-key-please-change"
};

let loaded = false;

export function loadTestEnv(): void {
  if (loaded) {
    return;
  }
  loaded = true;

  // Lower precedence first; later spreads override earlier ones among files.
  const merged = {
    ...loadEnvFile(".env"),
    ...loadEnvFile(".env.local")
  };

  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(testDefaults)) {
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}
