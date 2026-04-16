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

if (!fs.existsSync(envPath)) {
  console.error("❌ No se encontró archivo .env en la raíz del proyecto.");
  process.exit(1);
}

const envValues = parseEnvFile(fs.readFileSync(envPath, "utf-8"));
const requiredKeys = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "APP_BASE_URL",
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

console.info("✅ Variables de entorno mínimas válidas para despliegue.");
