import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  APP_BASE_URL: z.url(),
  QUESTIONNAIRE_TOKEN_SECRET: z.string().min(1),
  TERMS_VERSION: z.string().min(1),
  PRIVACY_VERSION: z.string().min(1),
  SMS_PROVIDER: z.string().min(1),
  SMS_BASE_URL: z.url(),
  SMS_API_KEY: z.string().min(1),
  NOTIFICATION_CRON_SECRET: z.string().min(1),
  PAYMENTS_PROVIDER: z.enum(["MOCK", "STRIPE", "CONEKTA", "OPENPAY"]),
  PAYMENTS_WEBHOOK_SECRET: z.string().min(1)
});

export const env = envSchema.parse(process.env);

if (process.argv[1]?.includes("env.ts")) {
  console.log("Environment variables are valid.");
}
