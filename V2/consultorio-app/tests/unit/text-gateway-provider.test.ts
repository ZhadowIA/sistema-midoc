import { describe, expect, it } from "vitest";

import {
  GatewayProviderError,
  GeminiGatewayProvider,
  OpenAiGatewayProvider
} from "../../src/services/ai/text-gateway-provider";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const noWait = () => 0;
const request = { model: "m-1", input: "contexto seudonimizado", responseSchema: null, temperature: 0.2 };

describe("text gateway providers (paso 30)", () => {
  it("Gemini sends the server key and the response schema, and reads the text", async () => {
    const { impl, calls } = fakeFetch([
      { status: 200, body: { candidates: [{ content: { parts: [{ text: "borrador" }] } }] } }
    ]);
    const provider = new GeminiGatewayProvider("clave-servidor", impl, noWait);
    const result = await provider.generate({ ...request, responseSchema: { type: "object" } });
    expect(result.text).toBe("borrador");
    expect(calls[0].url).toContain("/models/m-1:generateContent");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("clave-servidor");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", responseJsonSchema: { type: "object" } });
  });

  it("retries transient failures and then succeeds", async () => {
    const { impl, calls } = fakeFetch([
      { status: 503, body: {} },
      { status: 200, body: { choices: [{ message: { content: "ok" } }], model: "m-1" } }
    ]);
    const result = await new OpenAiGatewayProvider("k", impl, noWait).generate(request);
    expect(result.text).toBe("ok");
    expect(calls).toHaveLength(2);
  });

  it("reports overload as retryable and rejections as not retryable", async () => {
    const overloaded = fakeFetch([{ status: 429, body: {} }, { status: 429, body: {} }, { status: 429, body: {} }]);
    await expect(new OpenAiGatewayProvider("k", overloaded.impl, noWait).generate(request)).rejects.toMatchObject({
      retryable: true
    });
    const rejected = fakeFetch([{ status: 400, body: {} }]);
    const error = await new GeminiGatewayProvider("k", rejected.impl, noWait).generate(request).catch((e) => e);
    expect(error).toBeInstanceOf(GatewayProviderError);
    expect(error.retryable).toBe(false);
    expect(rejected.calls).toHaveLength(1);
  });

  it("uses structured output with OpenAI when a schema is given and rejects empty answers", async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: "" } }] } }]);
    await expect(
      new OpenAiGatewayProvider("k", impl, noWait).generate({ ...request, responseSchema: { type: "object" } })
    ).rejects.toMatchObject({ retryable: false });
    expect(JSON.parse(String(calls[0].init.body)).response_format.type).toBe("json_schema");
  });
});
