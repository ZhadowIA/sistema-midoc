import { describe, expect, it } from "vitest";

import {
  OpenAiTranscriptionProvider,
  type TranscriptionTransport
} from "../../src/services/ai/openai-transcription-provider";

const CONFIG = {
  apiKey: "secret",
  standardModel: "gpt-4o-mini-transcribe",
  diarizationModel: "gpt-4o-transcribe-diarize"
};

// Transport inyectable que captura la peticion y devuelve una respuesta fija.
function captureTransport(response: {
  ok?: boolean;
  status?: number;
  body: unknown;
}): {
  transport: TranscriptionTransport;
  calls: Array<{ url: string; headers: Record<string, string>; form: FormData }>;
} {
  const calls: Array<{ url: string; headers: Record<string, string>; form: FormData }> = [];
  const transport: TranscriptionTransport = async (url, init) => {
    calls.push({ url, headers: init.headers, form: init.body });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.body
    };
  };
  return { transport, calls };
}

const audio = Buffer.from([0, 1, 2, 3]);

describe("OpenAiTranscriptionProvider request shaping", () => {
  it("builds a standard transcription request with a neutral filename", async () => {
    const { transport, calls } = captureTransport({
      body: { text: "hola", usage: { seconds: 42 } }
    });
    const provider = new OpenAiTranscriptionProvider(CONFIG, transport);

    await provider.transcribe({ audio, mode: "standard" });

    const [call] = calls;
    expect(call.headers.Authorization).toBe("Bearer secret");
    expect(call.form.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(call.form.get("response_format")).toBe("json");
    expect(call.form.get("chunking_strategy")).toBeNull();
    expect((call.form.get("file") as File).name).toBe("consultation.wav");
  });

  it("builds a diarized request with auto chunking", async () => {
    const { transport, calls } = captureTransport({
      body: {
        text: "hola",
        segments: [{ speaker: "speaker_0", start: 0, end: 1, text: "hola" }]
      }
    });
    const provider = new OpenAiTranscriptionProvider(CONFIG, transport);

    await provider.transcribe({ audio, mode: "diarized" });

    const [call] = calls;
    expect(call.form.get("model")).toBe("gpt-4o-transcribe-diarize");
    expect(call.form.get("response_format")).toBe("diarized_json");
    expect(call.form.get("chunking_strategy")).toBe("auto");
  });

  it("never sends known speaker samples, patient IDs or original filenames", async () => {
    const { transport, calls } = captureTransport({
      body: { text: "hola", segments: [{ speaker: "speaker_0", start: 0, end: 1, text: "hola" }] }
    });
    const provider = new OpenAiTranscriptionProvider(CONFIG, transport);

    await provider.transcribe({ audio, mode: "diarized" });

    const [call] = calls;
    expect(call.form.has("known_speaker_names")).toBe(false);
    expect(call.form.has("known_speaker_names[]")).toBe(false);
    expect(call.form.has("known_speaker_references")).toBe(false);
    expect(call.form.has("patientId")).toBe(false);
    expect((call.form.get("file") as File).name).not.toContain("paciente");
  });
});

describe("OpenAiTranscriptionProvider response parsing", () => {
  it("parses a standard response and reports duration when present", async () => {
    const { transport } = captureTransport({
      body: { text: "  paciente con dolor  ", usage: { seconds: 90 } }
    });
    const provider = new OpenAiTranscriptionProvider(CONFIG, transport);

    const result = await provider.transcribe({ audio, mode: "standard" });

    expect(result.text).toBe("paciente con dolor");
    expect(result.segments).toBeNull();
    expect(result.reportedDurationSeconds).toBe(90);
    expect(result.model).toBe("gpt-4o-mini-transcribe");
  });

  it("parses diarized segments into a stable contract", async () => {
    const { transport } = captureTransport({
      body: {
        text: "dialogo",
        duration: 7,
        segments: [
          { speaker: "speaker_0", start: 0, end: 3.2, text: "Buenos dias" },
          { speaker: "speaker_1", start: 3.2, end: 7, text: "Tengo dolor" }
        ]
      }
    });
    const provider = new OpenAiTranscriptionProvider(CONFIG, transport);

    const result = await provider.transcribe({ audio, mode: "diarized" });

    expect(result.segments).toHaveLength(2);
    expect(result.segments?.[0]).toEqual({
      speaker: "speaker_0",
      startSeconds: 0,
      endSeconds: 3.2,
      text: "Buenos dias"
    });
    expect(result.reportedDurationSeconds).toBe(7);
  });

  it("sanitizes provider failures without leaking the response body", async () => {
    const { transport } = captureTransport({
      ok: false,
      status: 500,
      body: { error: "secret internal detail" }
    });
    const provider = new OpenAiTranscriptionProvider(CONFIG, transport);

    await expect(provider.transcribe({ audio, mode: "standard" })).rejects.toThrow(
      /transcription provider/i
    );
    await expect(provider.transcribe({ audio, mode: "standard" })).rejects.not.toThrow(
      /secret internal detail/
    );
  });

  it("rejects a malformed response shape", async () => {
    const { transport } = captureTransport({ body: { unexpected: true } });
    const provider = new OpenAiTranscriptionProvider(CONFIG, transport);

    await expect(provider.transcribe({ audio, mode: "standard" })).rejects.toThrow();
  });
});
