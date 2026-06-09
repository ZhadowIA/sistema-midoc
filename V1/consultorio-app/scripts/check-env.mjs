import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");

function parseEnvFile(content) {
  const lines = content.split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalIdx = trimmed.indexOf("=");
    if (equalIdx <= 0) continue;
    const key = trimmed.slice(0, equalIdx).trim();
    let value = trimmed.slice(equalIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const envValues = fs.existsSync(envPath)
  ? { ...process.env, ...parseEnvFile(fs.readFileSync(envPath, "utf-8")) }
  : process.env;
const requiredKeys = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "APP_BASE_URL",
  "APP_TIMEZONE",
  "QUESTIONNAIRE_TOKEN_SECRET",
  "TERMS_VERSION",
  "PRIVACY_VERSION",
];

const missing = requiredKeys.filter((key) => !envValues[key] || !String(envValues[key]).trim());
if (missing.length > 0) {
  console.error(`❌ Variables faltantes: ${missing.join(", ")}`);
  process.exit(1);
}

const weakSecretPatterns = ["secret123", "replace_with", "changeme", "test", "123456"];
const weakSecrets = ["NEXTAUTH_SECRET", "QUESTIONNAIRE_TOKEN_SECRET"].filter((key) => {
  const value = String(envValues[key] || "").toLowerCase();
  return value.length < 12 || weakSecretPatterns.some((pattern) => value.includes(pattern));
});

if (weakSecrets.length > 0) {
  console.error(`❌ Secretos débiles detectados: ${weakSecrets.join(", ")}`);
  process.exit(1);
}

const hasOpenAi = Boolean(envValues.OPENAI_API_KEY && String(envValues.OPENAI_API_KEY).trim());
const missingForAiDictation = ["DEEPGRAM_API_KEY", "DEEPGRAM_PROJECT_ID"].filter(
  (key) => !envValues[key] || !String(envValues[key]).trim(),
);
if (hasOpenAi && missingForAiDictation.length > 0) {
  console.warn(
    `⚠️ OPENAI_API_KEY está configurada pero faltan variables para dictado IA en tiempo real: ${missingForAiDictation.join(
      ", ",
    )}`,
  );
}

if (envValues.RECAPTCHA_V3_SECRET && !envValues.NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY) {
  console.warn(
    "⚠️ RECAPTCHA_V3_SECRET está configurado pero falta NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY (captcha v3 quedará incompleto en frontend).",
  );
}

console.info("✅ Variables de entorno mínimas válidas para despliegue.");
