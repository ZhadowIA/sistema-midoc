import { describe, expect, it } from "vitest";

import {
  DeepgramTranscriptionProvider,
  resolveDeepgramTranscriptionProvider,
  type DeepgramTransport
} from "../../src/services/ai/deepgram-transcription-provider";

const CONFIG = {
  apiKey: "secret",
  model: "nova-3",
  language: "multi"
};

// Transport inyectable que captura la peticion y devuelve una respuesta fija.
function captureTransport(response: { ok?: boolean; status?: number; body: unknown }): {
  transport: DeepgramTransport;
  calls: Array<{ url: string; headers: Record<string, string>; body: Uint8Array }>;
} {
  const calls: Array<{ url: string; headers: Record<string, string>; body: Uint8Array }> = [];
  const transport: DeepgramTransport = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.body
    };
  };
  return { transport, calls };
}

const audio = Buffer.from([0, 1, 2, 3]);

function standardBody(transcript: string, duration?: number) {
  return {
    metadata: duration === undefined ? {} : { duration },
    results: {
      channels: [{ alternatives: [{ transcript }] }]
    }
  };
}

describe("DeepgramTranscriptionProvider request shaping", () => {
  it("builds a standard request with raw bytes and Token auth", async () => {
    const { transport, calls } = captureTransport({ body: standardBody("hola", 42) });
    const provider = new DeepgramTranscriptionProvider(CONFIG, transport);

    await provider.transcribe({ audio, mode: "standard" });

    const [call] = calls;
    const url = new URL(call.url);
    expect(call.headers.Authorization).toBe("Token secret");
    expect(call.headers["Content-Type"]).toBe("audio/wav");
    expect(url.pathname).toBe("/v1/listen");
    expect(url.searchParams.get("model")).toBe("nova-3");
    expect(url.searchParams.get("language")).toBe("multi");
    expect(url.searchParams.get("diarize")).toBeNull();
    expect(url.searchParams.get("utterances")).toBeNull();
    expect(Array.from(call.body)).toEqual([0, 1, 2, 3]);
  });

  it("activates diarization with utterances in diarized mode", async () => {
    const { transport, calls } = captureTransport({
      body: {
        metadata: { duration: 7 },
        results: {
          channels: [{ alternatives: [{ transcript: "dialogo" }] }],
          utterances: [{ speaker: 0, start: 0, end: 1, transcript: "hola" }]
        }
      }
    });
    const provider = new DeepgramTranscriptionProvider(CONFIG, transport);

    await provider.transcribe({ audio, mode: "diarized" });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("diarize")).toBe("true");
    expect(url.searchParams.get("utterances")).toBe("true");
  });

  it("never sends patient identifiers or filename metadata", async () => {
    const { transport, calls } = captureTransport({ body: standardBody("hola") });
    const provider = new DeepgramTranscriptionProvider(CONFIG, transport);

    await provider.transcribe({ audio, mode: "standard" });

    const url = new URL(calls[0].url);
    // Solo parametros de procesamiento: los bytes viajan sin nombre de archivo.
    for (const key of url.searchParams.keys()) {
      expect(["model", "language", "smart_format"]).toContain(key);
    }
  });
});

describe("DeepgramTranscriptionProvider response parsing", () => {
  it("parses a standard response and reports duration when present", async () => {
    const { transport } = captureTransport({
      body: standardBody("  paciente con dolor  ", 90)
    });
    const provider = new DeepgramTranscriptionProvider(CONFIG, transport);

    const result = await provider.transcribe({ audio, mode: "standard" });

    expect(result.text).toBe("paciente con dolor");
    expect(result.segments).toBeNull();
    expect(result.reportedDurationSeconds).toBe(90);
    expect(result.model).toBe("nova-3");
  });

  it("maps utterances into anonymous speaker segments", async () => {
    const { transport } = captureTransport({
      body: {
        metadata: { duration: 7 },
        results: {
          channels: [{ alternatives: [{ transcript: "dialogo" }] }],
          utterances: [
            { speaker: 0, start: 0, end: 3.2, transcript: "Buenos dias " },
            { speaker: 1, start: 3.2, end: 7, transcript: "Tengo dolor" }
          ]
        }
      }
    });
    const provider = new DeepgramTranscriptionProvider(CONFIG, transport);

    const result = await provider.transcribe({ audio, mode: "diarized" });

    expect(result.segments).toHaveLength(2);
    expect(result.segments?.[0]).toEqual({
      speaker: "speaker_0",
      startSeconds: 0,
      endSeconds: 3.2,
      text: "Buenos dias"
    });
    expect(result.segments?.[1].speaker).toBe("speaker_1");
    expect(result.reportedDurationSeconds).toBe(7);
  });

  it("rejects a diarized response without utterances", async () => {
    const { transport } = captureTransport({ body: standardBody("hola") });
    const provider = new DeepgramTranscriptionProvider(CONFIG, transport);

    await expect(provider.transcribe({ audio, mode: "diarized" })).rejects.toThrow(
      /invalid diarized response/i
    );
  });

  it("sanitizes provider failures without leaking the response body", async () => {
    const { transport } = captureTransport({
      ok: false,
      status: 500,
      body: { error: "secret internal detail" }
    });
    const provider = new DeepgramTranscriptionProvider(CONFIG, transport);

    await expect(provider.transcribe({ audio, mode: "standard" })).rejects.toThrow(
      /transcription provider/i
    );
    await expect(provider.transcribe({ audio, mode: "standard" })).rejects.not.toThrow(
      /secret internal detail/
    );
  });

  it("rejects a malformed response shape", async () => {
    const { transport } = captureTransport({ body: { unexpected: true } });
    const provider = new DeepgramTranscriptionProvider(CONFIG, transport);

    await expect(provider.transcribe({ audio, mode: "standard" })).rejects.toThrow();
  });
});

describe("resolveDeepgramTranscriptionProvider (env gate)", () => {
  const enabled = {
    enabled: true,
    apiKey: "dg-test",
    model: "nova-3",
    language: "multi",
    baaApproved: true
  };

  it("builds a provider when enabled, keyed and BAA-approved", () => {
    const provider = resolveDeepgramTranscriptionProvider(enabled);
    expect(provider.name).toBe("deepgram");
  });

  it("refuses (403) when the feature is disabled", () => {
    expect(() => resolveDeepgramTranscriptionProvider({ ...enabled, enabled: false })).toThrow(
      expect.objectContaining({ status: 403 })
    );
  });

  it("refuses (403) without an API key", () => {
    expect(() => resolveDeepgramTranscriptionProvider({ ...enabled, apiKey: "" })).toThrow(
      expect.objectContaining({ status: 403 })
    );
  });

  it("refuses (403) without verified BAA / no-retention", () => {
    expect(() => resolveDeepgramTranscriptionProvider({ ...enabled, baaApproved: false })).toThrow(
      expect.objectContaining({ status: 403 })
    );
  });
});
