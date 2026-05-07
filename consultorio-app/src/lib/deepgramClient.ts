import { getServerEnv } from "./env";

export const DEFAULT_DEEPGRAM_EPHEMERAL_KEY_TTL_SECONDS = 15 * 60;

export type EphemeralKey = {
  apiKey: string;
  expiresAt: string;
};

type CreateKeyResponse = {
  key: string;
  api_key_id: string;
  expiration_date?: string | null;
};

export function getDeepgramEphemeralKeyTtlSeconds(): number {
  return getServerEnv().DEEPGRAM_EPHEMERAL_KEY_TTL_SECONDS;
}

export async function mintEphemeralKey(options: {
  comment: string;
  ttlSeconds?: number;
}): Promise<EphemeralKey> {
  const env = getServerEnv();
  if (!env.DEEPGRAM_API_KEY || !env.DEEPGRAM_PROJECT_ID) {
    throw new Error("Deepgram no está configurado (faltan DEEPGRAM_API_KEY o DEEPGRAM_PROJECT_ID).");
  }

  const ttl = options.ttlSeconds ?? env.DEEPGRAM_EPHEMERAL_KEY_TTL_SECONDS ?? DEFAULT_DEEPGRAM_EPHEMERAL_KEY_TTL_SECONDS;
  const res = await fetch(
    `https://api.deepgram.com/v1/projects/${env.DEEPGRAM_PROJECT_ID}/keys`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment: options.comment,
        scopes: ["usage:write"],
        time_to_live_in_seconds: ttl,
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Deepgram key mint falló (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as CreateKeyResponse;
  const expiresAt =
    data.expiration_date ?? new Date(Date.now() + ttl * 1000).toISOString();
  return { apiKey: data.key, expiresAt };
}
