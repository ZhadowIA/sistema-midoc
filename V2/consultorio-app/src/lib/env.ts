import { z } from "zod";

const emailAddressSchema = z.string().email();
const emailSenderSchema = z.string().trim().refine(
  (value) => {
    if (emailAddressSchema.safeParse(value).success) {
      return true;
    }

    const displayNameMatch = /^.+<([^<>]+)>$/.exec(value);
    return displayNameMatch ? emailAddressSchema.safeParse(displayNameMatch[1].trim()).success : false;
  },
  { message: "Invalid email sender" }
);

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    NEXTAUTH_SECRET: z.string().min(1),
    APP_BASE_URL: z.url(),
    QUESTIONNAIRE_TOKEN_SECRET: z.string().min(1),
    TERMS_VERSION: z.string().min(1),
    PRIVACY_VERSION: z.string().min(1),
    SMS_PROVIDER: z.string().min(1),
    SMS_BASE_URL: z.url(),
    SMS_API_KEY: z.string().min(1),
    WHATSAPP_PROVIDER: z.string().min(1).default("mock"),
    PHONE_NOTIFICATION_CHANNEL: z.enum(["SMS", "WHATSAPP"]).default("SMS"),
    TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    TWILIO_MESSAGING_SERVICE_SID: z.string().min(1).optional(),
    TWILIO_FROM_PHONE_NUMBER: z.string().min(1).optional(),
    TWILIO_WHATSAPP_MESSAGING_SERVICE_SID: z.string().min(1).optional(),
    TWILIO_WHATSAPP_FROM_PHONE_NUMBER: z.string().min(1).optional(),
    EMAIL_PROVIDER: z.string().min(1),
    EMAIL_BASE_URL: z.url(),
    EMAIL_API_KEY: z.string().min(1),
    EMAIL_FROM: emailSenderSchema,
    NOTIFICATION_CRON_SECRET: z.string().min(1),
    PAYMENTS_PROVIDER: z.enum(["MOCK", "STRIPE", "CONEKTA", "OPENPAY"]),
    PAYMENTS_WEBHOOK_SECRET: z.string().min(1),
    // Llave para cifrar en reposo el secreto TOTP del 2FA. Se deriva a 32 bytes.
    TWO_FACTOR_ENCRYPTION_KEY: z.string().min(16),
    // Llave de Google Maps Embed API para el mapa del perfil publico. Opcional:
    // si falta o es invalida, el perfil muestra un fallback (direccion + enlace).
    GOOGLE_MAPS_EMBED_API_KEY: z.string().min(1).optional(),
    // Proveedor de la preconsulta guiada por IA (paso 19, rebanada 8). `fake` es
    // un proveedor determinista sin red, default para dev/pruebas. Los proveedores
    // reales se cablean en staging con BAA (paso 16); las llaves abajo son
    // opcionales y solo se usan con su proveedor seleccionado.
    AI_PROVIDER: z.enum(["fake", "openai", "anthropic", "gemini"]).default("fake"),
    AI_MODEL: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (value.SMS_PROVIDER.toLowerCase() !== "twilio") {
      if (value.WHATSAPP_PROVIDER.toLowerCase() !== "twilio") {
        return;
      }
    }

    if (value.WHATSAPP_PROVIDER.toLowerCase() === "twilio") {
      if (!value.TWILIO_ACCOUNT_SID) {
        ctx.addIssue({
          code: "custom",
          path: ["TWILIO_ACCOUNT_SID"],
          message: "Required when WHATSAPP_PROVIDER=twilio"
        });
      }

      if (!value.TWILIO_AUTH_TOKEN) {
        ctx.addIssue({
          code: "custom",
          path: ["TWILIO_AUTH_TOKEN"],
          message: "Required when WHATSAPP_PROVIDER=twilio"
        });
      }

      if (!value.TWILIO_WHATSAPP_MESSAGING_SERVICE_SID && !value.TWILIO_WHATSAPP_FROM_PHONE_NUMBER) {
        ctx.addIssue({
          code: "custom",
          path: ["TWILIO_WHATSAPP_MESSAGING_SERVICE_SID"],
          message:
            "Set TWILIO_WHATSAPP_MESSAGING_SERVICE_SID or TWILIO_WHATSAPP_FROM_PHONE_NUMBER when WHATSAPP_PROVIDER=twilio"
        });
      }
    }

    if (value.SMS_PROVIDER.toLowerCase() === "twilio" && !value.TWILIO_ACCOUNT_SID) {
      ctx.addIssue({
        code: "custom",
        path: ["TWILIO_ACCOUNT_SID"],
        message: "Required when SMS_PROVIDER=twilio"
      });
    }

    if (value.SMS_PROVIDER.toLowerCase() === "twilio" && !value.TWILIO_AUTH_TOKEN) {
      ctx.addIssue({
        code: "custom",
        path: ["TWILIO_AUTH_TOKEN"],
        message: "Required when SMS_PROVIDER=twilio"
      });
    }

    if (
      value.SMS_PROVIDER.toLowerCase() === "twilio" &&
      !value.TWILIO_MESSAGING_SERVICE_SID &&
      !value.TWILIO_FROM_PHONE_NUMBER
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["TWILIO_MESSAGING_SERVICE_SID"],
        message: "Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_PHONE_NUMBER when SMS_PROVIDER=twilio"
      });
    }
  });

export const env = envSchema.parse(process.env);

if (process.argv[1]?.includes("env.ts")) {
  console.log("Environment variables are valid.");
}
