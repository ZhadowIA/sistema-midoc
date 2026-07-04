import { z } from "zod";

// Definicion pura del esquema de entorno, SIN efectos: no lee `process.env`.
// `env.ts` la importa y ejecuta el parse en tiempo de arranque. Separarlas
// permite probar el esquema (p. ej. el gate de transcripcion OpenAI) de forma
// determinista, sin necesidad de `.env` ni secretos reales.

const emailAddressSchema = z.string().email();
const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional()
);
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

export const envSchema = z
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
    GOOGLE_MAPS_EMBED_API_KEY: optionalNonEmptyString,
    // Proveedor de la preconsulta guiada por IA (paso 19, rebanada 8). `fake` es
    // un proveedor determinista sin red, default para dev/pruebas. Los proveedores
    // reales se cablean en staging con BAA (paso 16); las llaves abajo son
    // opcionales y solo se usan con su proveedor seleccionado.
    AI_PROVIDER: z.enum(["fake", "openai", "anthropic", "gemini"]).default("fake"),
    AI_MODEL: optionalNonEmptyString,
    OPENAI_API_KEY: optionalNonEmptyString,
    ANTHROPIC_API_KEY: optionalNonEmptyString,
    GEMINI_API_KEY: optionalNonEmptyString,
    // Transcripcion en nube gobernada por el portal (Ruta B, paso 15 ext.).
    // Deshabilitada por defecto. Cuando se habilita exige clave de OpenAI y
    // confirmacion de Zero Data Retention; el BAA real se verifica fuera de banda
    // (paso 16). Una variable NO sustituye el contrato, solo evita activarla por
    // accidente. Modelos configurables por entorno.
    OPENAI_TRANSCRIPTION_ENABLED: z.stringbool().default(false),
    OPENAI_TRANSCRIPTION_MODEL: z.string().min(1).default("gpt-4o-mini-transcribe"),
    OPENAI_DIARIZATION_MODEL: z.string().min(1).default("gpt-4o-transcribe-diarize"),
    OPENAI_TRANSCRIPTION_ZDR_APPROVED: z.stringbool().default(false),
    // Segundo proveedor de transcripcion en nube (RF41: contrato agnostico).
    // Mismo gate que OpenAI: deshabilitado por defecto; al habilitarlo exige la
    // clave y la confirmacion de BAA/no-retencion verificada fuera de banda.
    DEEPGRAM_API_KEY: optionalNonEmptyString,
    DEEPGRAM_TRANSCRIPTION_ENABLED: z.stringbool().default(false),
    DEEPGRAM_TRANSCRIPTION_MODEL: z.string().min(1).default("nova-3"),
    DEEPGRAM_TRANSCRIPTION_LANGUAGE: z.string().min(1).default("multi"),
    DEEPGRAM_TRANSCRIPTION_BAA_APPROVED: z.stringbool().default(false)
  })
  .superRefine((value, ctx) => {
    if (value.SMS_PROVIDER.toLowerCase() !== "twilio") {
      if (value.WHATSAPP_PROVIDER.toLowerCase() !== "twilio") {
        // continua para evaluar el gate de transcripcion mas abajo.
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

    // Gate de transcripcion en nube: si se habilita, la clave y el ZDR aprobado
    // son obligatorios. El audio es contenido CLINICO; sin estos controles no
    // debe salir del equipo.
    if (value.OPENAI_TRANSCRIPTION_ENABLED) {
      if (!value.OPENAI_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["OPENAI_API_KEY"],
          message: "Required when OPENAI_TRANSCRIPTION_ENABLED=true"
        });
      }

      if (!value.OPENAI_TRANSCRIPTION_ZDR_APPROVED) {
        ctx.addIssue({
          code: "custom",
          path: ["OPENAI_TRANSCRIPTION_ZDR_APPROVED"],
          message:
            "OPENAI_TRANSCRIPTION_ZDR_APPROVED must be true (Zero Data Retention verified) when OPENAI_TRANSCRIPTION_ENABLED=true"
        });
      }
    }

    // Mismo gate para Deepgram: clave y BAA/no-retencion aprobados o no se activa.
    if (value.DEEPGRAM_TRANSCRIPTION_ENABLED) {
      if (!value.DEEPGRAM_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["DEEPGRAM_API_KEY"],
          message: "Required when DEEPGRAM_TRANSCRIPTION_ENABLED=true"
        });
      }

      if (!value.DEEPGRAM_TRANSCRIPTION_BAA_APPROVED) {
        ctx.addIssue({
          code: "custom",
          path: ["DEEPGRAM_TRANSCRIPTION_BAA_APPROVED"],
          message:
            "DEEPGRAM_TRANSCRIPTION_BAA_APPROVED must be true (BAA / no-retention verified) when DEEPGRAM_TRANSCRIPTION_ENABLED=true"
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;
