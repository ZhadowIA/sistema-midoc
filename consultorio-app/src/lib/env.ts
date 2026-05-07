import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET es requerida"),
  APP_BASE_URL: z.string().url("APP_BASE_URL debe ser una URL válida"),
  APP_TIMEZONE: z.string().min(1).default("America/Chihuahua"),
  QUESTIONNAIRE_TOKEN_SECRET: z.string().min(1, "QUESTIONNAIRE_TOKEN_SECRET es requerida"),
  NOTIFICATION_CRON_SECRET: z.string().min(8).optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().min(8).optional(),
  WHATSAPP_API_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().min(20).optional(),
  DEEPGRAM_API_KEY: z.string().min(20).optional(),
  DEEPGRAM_PROJECT_ID: z.string().min(8).optional(),
  DEEPGRAM_EPHEMERAL_KEY_TTL_SECONDS: z
    .string()
    .optional()
    .default("900")
    .transform((value) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || String(parsed) !== value.trim()) {
        throw new Error("DEEPGRAM_EPHEMERAL_KEY_TTL_SECONDS debe ser un entero en segundos");
      }
      if (parsed < 300 || parsed > 3600) {
        throw new Error("DEEPGRAM_EPHEMERAL_KEY_TTL_SECONDS debe estar entre 300 y 3600 segundos");
      }
      return parsed;
    }),
  NOTIFICATION_REMINDER_LEAD_MINUTES: z.string().optional(),
  NOTIFICATION_REMINDER_LEAD_HOURS: z.string().optional(),
  NOTIFICATION_REMINDER_WINDOW_MINUTES: z.string().optional(),
  NOTIFICATION_MAX_RETRY_ATTEMPTS: z.string().optional(),
  NOTIFICATION_RETRY_WINDOW_HOURS: z.string().optional(),
  NOTIFICATION_PENDING_ESCALATION_MINUTES: z.string().optional(),
  NOTIFICATION_PENDING_OVERDUE_MINUTES: z.string().optional(),
  NOTIFICATION_PENDING_AUTO_CLOSE_HOURS: z.string().optional(),
  PAYMENTS_PROVIDER: z.enum(["MOCK", "STRIPE", "CONEKTA", "OPENPAY"]).default("MOCK"),
  AZURE_STORAGE_ACCOUNT: z.string().min(3).max(24).optional(),
  AZURE_STORAGE_CONTAINER: z.string().min(3).max(63).optional(),
  TWILIO_ACCOUNT_SID: z.string().min(34).max(34).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(32).optional(),
  TWILIO_FROM_NUMBER: z.string().min(10).optional(),
  RESEND_API_KEY: z.string().min(10).optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
  SECURITY_STATE_BACKEND: z.enum(["MEMORY", "DATABASE"]).optional(),
  PAYMENTS_WEBHOOK_SECRET: z.string().min(8).optional(),
  STRIPE_SECRET_KEY: z.string().min(20).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(20).optional(),
  STRIPE_PRICE_ID: z.string().min(3).optional(),
  STRIPE_PRICE_AGENDA_MONTHLY: z.string().min(3).optional(),
  STRIPE_PRICE_CLINICAL_MONTHLY: z.string().min(3).optional(),
  STRIPE_PRICE_INTEGRAL_MONTHLY: z.string().min(3).optional(),
  STRIPE_PRICE_AI_30_MONTHLY: z.string().min(3).optional(),
  STRIPE_PRICE_AI_60_MONTHLY: z.string().min(3).optional(),
  STRIPE_PRICE_AI_100_MONTHLY: z.string().min(3).optional(),
  STRIPE_DEPOSIT_PRODUCT_ID: z.string().min(3).optional(),
  TERMS_VERSION: z.string().min(1).default("v1"),
  PRIVACY_VERSION: z.string().min(1).default("v1"),
  CLINICAL_HISTORY_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  RECAPTCHA_V3_SECRET: z.string().min(1).optional(),
  RECAPTCHA_V3_MIN_SCORE: z
    .string()
    .optional()
    .default("0.5")
    .transform((value) => {
      const parsed = Number.parseFloat(value);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
        throw new Error("RECAPTCHA_V3_MIN_SCORE debe ser un número entre 0 y 1");
      }
      return parsed;
    }),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(" | ");
    throw new Error(`Variables de entorno inválidas: ${issues}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export function __resetServerEnvForTests(): void {
  cachedEnv = null;
}
