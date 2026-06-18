import { ServiceError } from "../../lib/errors";

type FetchImpl = typeof fetch;

export type TwilioSmsConfig = {
  accountSid: string;
  authToken: string;
  baseUrl: string;
  fromPhoneNumber?: string;
  messagingServiceSid?: string;
  fetchImpl?: FetchImpl;
};

type SendSmsInput = {
  to: string;
  body: string;
};

export type SmsDeliveryResult = {
  provider: "TWILIO";
  providerMessageId: string;
};

export type WhatsAppDeliveryResult = {
  provider: "TWILIO_WHATSAPP";
  providerMessageId: string;
};

class TwilioSmsError extends ServiceError {}

class TwilioWhatsAppError extends ServiceError {}

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildEndpoint(baseUrl: string, accountSid: string) {
  return `${trimTrailingSlash(baseUrl)}/2010-04-01/Accounts/${accountSid}/Messages.json`;
}

function readTwilioError(channel: "SMS" | "WhatsApp", status: number, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return `Twilio ${channel} rejected (${status})`;
  }

  const code = (body as Record<string, unknown>).code;
  return typeof code === "number" || typeof code === "string"
    ? `Twilio ${channel} rejected (${status}, code ${code})`
    : `Twilio ${channel} rejected (${status})`;
}

async function parseJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export function createTwilioSmsProvider(config: TwilioSmsConfig) {
  if (!config.accountSid) {
    throw new TwilioSmsError("Configura TWILIO_ACCOUNT_SID.", 500);
  }

  if (!config.authToken) {
    throw new TwilioSmsError("Configura TWILIO_AUTH_TOKEN.", 500);
  }

  if (!config.messagingServiceSid && !config.fromPhoneNumber) {
    throw new TwilioSmsError("Configura TWILIO_MESSAGING_SERVICE_SID o TWILIO_FROM_PHONE_NUMBER.", 500);
  }

  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async sendSms(input: SendSmsInput): Promise<SmsDeliveryResult> {
      const body = new URLSearchParams({
        To: input.to,
        Body: input.body
      });

      if (config.messagingServiceSid) {
        body.set("MessagingServiceSid", config.messagingServiceSid);
      } else if (config.fromPhoneNumber) {
        body.set("From", config.fromPhoneNumber);
      }

      const response = await fetchImpl(buildEndpoint(config.baseUrl, config.accountSid), {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: body.toString()
      });

      const responseBody = await parseJson(response);

      if (!response.ok) {
        throw new TwilioSmsError(readTwilioError("SMS", response.status, responseBody), response.status);
      }

      const sid =
        responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
          ? (responseBody as Record<string, unknown>).sid
          : null;

      if (typeof sid !== "string" || !sid) {
        throw new TwilioSmsError("Twilio SMS response did not include a message SID.", 502);
      }

      return {
        provider: "TWILIO",
        providerMessageId: sid
      };
    }
  };
}

function formatWhatsAppAddress(phoneNumber: string) {
  if (phoneNumber.startsWith("whatsapp:+")) {
    return phoneNumber;
  }

  if (!/^\+\d{8,15}$/.test(phoneNumber)) {
    throw new TwilioWhatsAppError("WhatsApp requiere numeros en formato E.164, por ejemplo +526141234567.", 400);
  }

  return `whatsapp:${phoneNumber}`;
}

export function createTwilioWhatsAppProvider(config: TwilioSmsConfig) {
  if (!config.accountSid) {
    throw new TwilioWhatsAppError("Configura TWILIO_ACCOUNT_SID.", 500);
  }

  if (!config.authToken) {
    throw new TwilioWhatsAppError("Configura TWILIO_AUTH_TOKEN.", 500);
  }

  if (!config.messagingServiceSid && !config.fromPhoneNumber) {
    throw new TwilioWhatsAppError(
      "Configura TWILIO_WHATSAPP_MESSAGING_SERVICE_SID o TWILIO_WHATSAPP_FROM_PHONE_NUMBER.",
      500
    );
  }

  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    formatAddress: formatWhatsAppAddress,
    async sendWhatsApp(input: SendSmsInput): Promise<WhatsAppDeliveryResult> {
      const body = new URLSearchParams({
        To: formatWhatsAppAddress(input.to),
        Body: input.body
      });

      if (config.messagingServiceSid) {
        body.set("MessagingServiceSid", config.messagingServiceSid);
      } else if (config.fromPhoneNumber) {
        body.set("From", formatWhatsAppAddress(config.fromPhoneNumber));
      }

      const response = await fetchImpl(buildEndpoint(config.baseUrl, config.accountSid), {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: body.toString()
      });

      const responseBody = await parseJson(response);

      if (!response.ok) {
        throw new TwilioWhatsAppError(readTwilioError("WhatsApp", response.status, responseBody), response.status);
      }

      const sid =
        responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
          ? (responseBody as Record<string, unknown>).sid
          : null;

      if (typeof sid !== "string" || !sid) {
        throw new TwilioWhatsAppError("Twilio WhatsApp response did not include a message SID.", 502);
      }

      return {
        provider: "TWILIO_WHATSAPP",
        providerMessageId: sid
      };
    }
  };
}
