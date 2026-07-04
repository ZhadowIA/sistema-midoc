import { ServiceError } from "../../lib/errors";

type FetchImpl = typeof fetch;

export type ResendEmailConfig = {
  apiKey: string;
  baseUrl: string;
  from: string;
  fetchImpl?: FetchImpl;
};

type SendEmailInput = {
  to: string;
  subject: string;
  body: string;
};

type EmailDeliveryResult = {
  provider: "RESEND";
  providerMessageId: string;
};

class ResendEmailError extends ServiceError {}

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function parseJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function readResendError(status: number, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return `Resend rejected (${status})`;
  }

  const name = (body as Record<string, unknown>).name;
  return typeof name === "string" && name
    ? `Resend rejected (${status}, ${name})`
    : `Resend rejected (${status})`;
}

export function createResendEmailProvider(config: ResendEmailConfig) {
  if (!config.apiKey) {
    throw new ResendEmailError("Configura EMAIL_API_KEY para Resend.", 500);
  }

  if (!config.from) {
    throw new ResendEmailError("Configura EMAIL_FROM para Resend.", 500);
  }

  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async sendEmail(input: SendEmailInput): Promise<EmailDeliveryResult> {
      const response = await fetchImpl(`${trimTrailingSlash(config.baseUrl)}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: config.from,
          to: [input.to],
          subject: input.subject,
          text: input.body,
          html: `<p>${escapeHtml(input.body).replaceAll("\n", "<br />")}</p>`,
          tags: [
            {
              name: "category",
              value: "password_reset"
            }
          ]
        })
      });

      const responseBody = await parseJson(response);

      if (!response.ok) {
        throw new ResendEmailError(readResendError(response.status, responseBody), response.status);
      }

      const id =
        responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
          ? (responseBody as Record<string, unknown>).id
          : null;

      if (typeof id !== "string" || !id) {
        throw new ResendEmailError("Resend response did not include an email id.", 502);
      }

      return {
        provider: "RESEND",
        providerMessageId: id
      };
    }
  };
}
