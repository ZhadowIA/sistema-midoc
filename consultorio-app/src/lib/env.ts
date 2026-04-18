import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET es requerida"),
  APP_BASE_URL: z.string().url("APP_BASE_URL debe ser una URL válida"),
  QUESTIONNAIRE_TOKEN_SECRET: z.string().min(1, "QUESTIONNAIRE_TOKEN_SECRET es requerida"),
  NOTIFICATION_CRON_SECRET: z.string().min(8).optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().min(8).optional(),
  WHATSAPP_API_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().min(20).optional(),
  NOTIFICATION_REMINDER_LEAD_MINUTES: z.string().optional(),
  NOTIFICATION_REMINDER_LEAD_HOURS: z.string().optional(),
  NOTIFICATION_REMINDER_WINDOW_MINUTES: z.string().optional(),
  NOTIFICATION_MAX_RETRY_ATTEMPTS: z.string().optional(),
  NOTIFICATION_RETRY_WINDOW_HOURS: z.string().optional(),
  NOTIFICATION_PENDING_ESCALATION_MINUTES: z.string().optional(),
  NOTIFICATION_PENDING_OVERDUE_MINUTES: z.string().optional(),
  NOTIFICATION_PENDING_AUTO_CLOSE_HOURS: z.string().optional(),
  PAYMENTS_PROVIDER: z.enum(["MOCK", "STRIPE", "CONEKTA", "OPENPAY"]).default("MOCK"),
  PAYMENTS_WEBHOOK_SECRET: z.string().min(8).optional(),
  TERMS_VERSION: z.string().min(1).default("v1"),
  PRIVACY_VERSION: z.string().min(1).default("v1"),
  CLINICAL_HISTORY_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  CONSULTA_UNIFIED_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
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
