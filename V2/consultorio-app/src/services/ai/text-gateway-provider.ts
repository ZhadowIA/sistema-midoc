// Proveedores de la pasarela de IA de texto (paso 30). Reciben contenido YA
// seudonimizado por la app del medico y lo mandan al proveedor con la clave del
// servidor. No guardan nada: ni entrada ni salida salen de esta llamada.

export interface GatewayGenerationRequest {
  model: string;
  /** Contexto seudonimizado que arma la app. */
  input: string;
  /** Esquema JSON de la respuesta cuando el uso pide salida estructurada. */
  responseSchema: Record<string, unknown> | null;
  temperature: number;
}

export interface GatewayGenerationResult {
  text: string;
  model: string;
  latencyMs: number;
}

/** Falla del proveedor. `retryable` = sobrecarga, limite de tasa o caida momentanea. */
export class GatewayProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}

export interface TextGatewayProvider {
  readonly name: string;
  generate(request: GatewayGenerationRequest): Promise<GatewayGenerationResult>;
}

type FetchLike = typeof fetch;

const SYSTEM_INSTRUCTION =
  "Eres apoyo documental clinico. No inventes informacion. Devuelve solo contenido derivado de la entrada y marca faltantes o ambiguedades.";

function isTransient(status: number) {
  return status === 429 || status >= 500;
}

async function withRetries(
  attempt: () => Promise<Response>,
  waitMs = (n: number) => 400 * n
): Promise<Response> {
  let last: Response | null = null;
  for (let n = 1; n <= 3; n += 1) {
    try {
      last = await attempt();
    } catch (error) {
      if (n === 3) {
        throw new GatewayProviderError(`El proveedor no respondio: ${(error as Error).message}`, true);
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs(n)));
      continue;
    }
    if (!isTransient(last.status) || n === 3) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs(n)));
  }
  return last as Response;
}

function rejectByStatus(provider: string, status: number): never {
  if (isTransient(status)) {
    throw new GatewayProviderError(`${provider} esta sobrecargado o no disponible (${status}).`, true);
  }
  throw new GatewayProviderError(`${provider} rechazo la solicitud (${status}).`, false);
}

/** Gemini por su API REST oficial. */
export class GeminiGatewayProvider implements TextGatewayProvider {
  readonly name = "gemini-gateway";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly waitMs?: (n: number) => number
  ) {}

  async generate(request: GatewayGenerationRequest): Promise<GatewayGenerationResult> {
    const started = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`;
    const generationConfig: Record<string, unknown> = { temperature: request.temperature };
    if (request.responseSchema) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseJsonSchema = request.responseSchema;
    }
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: "user", parts: [{ text: request.input }] }],
      generationConfig
    });
    const response = await withRetries(
      () =>
        this.fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
          body
        }),
      this.waitMs
    );
    if (!response.ok) {
      rejectByStatus("Gemini", response.status);
    }
    const data = (await response.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!text.trim()) {
      throw new GatewayProviderError("Gemini no devolvio texto utilizable.", false);
    }
    return { text, model: request.model, latencyMs: Date.now() - started };
  }
}

/** OpenAI por chat completions; con esquema usa salida estructurada. */
export class OpenAiGatewayProvider implements TextGatewayProvider {
  readonly name = "openai-gateway";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly waitMs?: (n: number) => number
  ) {}

  async generate(request: GatewayGenerationRequest): Promise<GatewayGenerationResult> {
    const started = Date.now();
    const body: Record<string, unknown> = {
      model: request.model,
      temperature: request.temperature,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: request.input }
      ]
    };
    if (request.responseSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "midoc_output", schema: request.responseSchema }
      };
    }
    const response = await withRetries(
      () =>
        this.fetchImpl("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify(body)
        }),
      this.waitMs
    );
    if (!response.ok) {
      rejectByStatus("OpenAI", response.status);
    }
    const data = (await response.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) {
      throw new GatewayProviderError("OpenAI no devolvio texto utilizable.", false);
    }
    return { text, model: data.model ?? request.model, latencyMs: Date.now() - started };
  }
}

/**
 * Proveedor determinista solo para desarrollo y pruebas (nunca en produccion):
 * no hace red y devuelve un borrador marcado como de prueba.
 */
export class FakeGatewayProvider implements TextGatewayProvider {
  readonly name = "fake-gateway";

  async generate(request: GatewayGenerationRequest): Promise<GatewayGenerationResult> {
    const text = request.responseSchema
      ? JSON.stringify({ borrador_de_prueba: true })
      : `[Borrador de prueba de la pasarela MiDoc] ${request.input.trim().slice(0, 200)}`;
    return { text, model: request.model, latencyMs: 1 };
  }
}
