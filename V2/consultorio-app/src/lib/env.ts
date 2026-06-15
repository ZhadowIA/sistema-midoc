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
  EMAIL_PROVIDER: z.string().min(1),
  EMAIL_BASE_URL: z.url(),
  EMAIL_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email(),
  NOTIFICATION_CRON_SECRET: z.string().min(1),
  PAYMENTS_PROVIDER: z.enum(["MOCK", "STRIPE", "CONEKTA", "OPENPAY"]),
  PAYMENTS_WEBHOOK_SECRET: z.string().min(1),
  // Llave para cifrar en reposo el secreto TOTP del 2FA. Se deriva a 32 bytes.
  TWO_FACTOR_ENCRYPTION_KEY: z.string().min(16),
  // Llave de Google Maps Embed API para el mapa del perfil publico. Opcional:
  // si falta o es invalida, el perfil muestra un fallback (direccion + enlace).
  GOOGLE_MAPS_EMBED_API_KEY: z.string().min(1).optional()
});

export const env = envSchema.parse(process.env);

if (process.argv[1]?.includes("env.ts")) {
  console.log("Environment variables are valid.");
}
