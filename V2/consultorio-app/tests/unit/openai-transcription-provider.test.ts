import { describe, expect, it } from "vitest";

import {
  OpenAiTranscriptionProvider,
  type TranscriptionTransport
} from "../../src/services/ai/openai-transcription-provider";

function wavBytes() {
  return new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);
}

describe("OpenAI transcription provider", () => {
  it("sends a neutral standard multipart request and parses text", async () => {
    let captured: RequestInit | undefined;
    const transport: TranscriptionTransport = async (_url, init) => {
      captured = init;
      return new Response(
        JSON.stringify({ text: "Consulta transcrita", usage: { type: "duration", seconds: 42 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const provider = new OpenAiTranscriptionProvider(
      {
        apiKey: "secret-key",
        standardModel: "gpt-4o-mini-transcribe",
        diarizationModel: "gpt-4o-transcribe-diarize"
      },
      transport
    );

    const result = await provider.transcribe({
      mode: "standard",
      audio: wavBytes()
    });

    expect(new Headers(captured?.headers).get("authorization")).toBe("Bearer secret-key");
    const form = captured?.body as FormData;
    expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(form.get("response_format")).toBe("json");
    expect((form.get("file") as File).name).toBe("consultation.wav");
    expect([...form.keys()]).not.toContain("patientId");
    expect(result.text).toBe("Consulta transcrita");
    expect(result.reportedDurationSeconds).toBe(42);
    expect(result.segments).toBeNull();
  });

  it("requests diarized JSON without known-speaker biometrics", async () => {
    let captured: RequestInit | undefined;
    const transport: TranscriptionTransport = async (_url, init) => {
      captured = init;
      return new Response(
        JSON.stringify({
          text: "Buenos dias. Tengo dolor.",
          segments: [
            { speaker: "speaker_0", start: 0, end: 1.2, text: "Buenos dias." },
            { speaker: "speaker_1", start: 1.2, end: 3.8, text: "Tengo dolor." }
          ],
          usage: { type: "duration", seconds: 4 }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const provider = new OpenAiTranscriptionProvider(
      {
        apiKey: "secret-key",
        standardModel: "gpt-4o-mini-transcribe",
        diarizationModel: "gpt-4o-transcribe-diarize"
      },
      transport
    );

    const result = await provider.transcribe({
      mode: "diarized",
      audio: wavBytes()
    });

    const form = captured?.body as FormData;
    expect(form.get("model")).toBe("gpt-4o-transcribe-diarize");
    expect(form.get("response_format")).toBe("diarized_json");
    expect(form.get("chunking_strategy")).toBe("auto");
    expect([...form.keys()]).not.toContain("known_speaker_names[]");
    expect([...form.keys()]).not.toContain("known_speaker_references[]");
    expect(result.segments?.[1]).toEqual({
      speaker: "speaker_1",
      startSeconds: 1.2,
      endSeconds: 3.8,
      text: "Tengo dolor."
    });
  });

  it("sanitizes provider errors without exposing response content", async () => {
    const provider = new OpenAiTranscriptionProvider(
      {
        apiKey: "secret-key",
        standardModel: "gpt-4o-mini-transcribe",
        diarizationModel: "gpt-4o-transcribe-diarize"
      },
      async () =>
        new Response('{"error":{"message":"contenido clinico secreto"}}', { status: 400 })
    );

    await expect(
      provider.transcribe({ mode: "standard", audio: wavBytes() })
    ).rejects.toThrow("OpenAI transcription request failed (400)");
    await expect(
      provider.transcribe({ mode: "standard", audio: wavBytes() })
    ).rejects.not.toThrow("contenido clinico secreto");
  });

  it("rejects malformed diarized segments", async () => {
    const provider = new OpenAiTranscriptionProvider(
      {
        apiKey: "secret-key",
        standardModel: "gpt-4o-mini-transcribe",
        diarizationModel: "gpt-4o-transcribe-diarize"
      },
      async () =>
        new Response(
          JSON.stringify({
            text: "texto",
            segments: [{ speaker: "speaker_0", start: 4, end: 2, text: "invalido" }]
          }),
          { status: 200 }
        )
    );

    await expect(
      provider.transcribe({ mode: "diarized", audio: wavBytes() })
    ).rejects.toThrow("Invalid OpenAI transcription response");
  });
});
