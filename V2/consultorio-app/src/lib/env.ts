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
  // WhatsApp via Twilio reusa las credenciales de Twilio (SMS_API_KEY); solo
  // cambia el proveedor y el remitente. Defaults para no romper entornos sin
  // WhatsApp configurado.
  WHATSAPP_PROVIDER: z.string().min(1).default("mock"),
  // Remitente de WhatsApp en formato Twilio, p. ej. "whatsapp:+14155238886".
  // Opcional: solo se usa cuando el proveedor real esta cableado (paso 17).
  WHATSAPP_FROM: z.string().min(1).optional(),
  // Canal por defecto para notificaciones a un telefono: SMS (actual) o
  // WHATSAPP (opt-in). El correo siempre va por EMAIL aparte.
  PHONE_NOTIFICATION_CHANNEL: z.enum(["SMS", "WHATSAPP"]).default("SMS"),
  EMAIL_PROVIDER: z.string().min(1),
  EMAIL_BASE_URL: z.url(),
  EMAIL_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email(),
  NOTIFICATION_CRON_SECRET: z.string().min(1),
  PAYMENTS_PROVIDER: z.enum(["MOCK", "STRIPE", "CONEKTA", "OPENPAY"]),
  PAYMENTS_WEBHOOK_SECRET: z.string().min(1),
  // Llave para cifrar en reposo el secreto TOTP del 2FA. Se deriva a 32 bytes.
  TWO_FACTOR_ENCRYPTION_KEY: z.string().min(16)
});

export const env = envSchema.parse(process.env);

if (process.argv[1]?.includes("env.ts")) {
  console.log("Environment variables are valid.");
}
