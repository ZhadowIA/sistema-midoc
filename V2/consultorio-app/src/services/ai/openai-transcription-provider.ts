import { z } from "zod";

import type { TranscriptionMode } from "./ai-credits";

const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

const usageSchema = z
  .object({
    type: z.string().optional(),
    seconds: z.number().positive().optional()
  })
  .passthrough()
  .optional();

const standardResponseSchema = z.object({
  text: z.string().trim().min(1),
  usage: usageSchema
});

const diarizedSegmentSchema = z
  .object({
    speaker: z.string().trim().min(1),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    text: z.string().trim().min(1)
  })
  .refine((segment) => segment.end >= segment.start, {
    message: "segment end must not precede start"
  });

const diarizedResponseSchema = z.object({
  text: z.string().trim().min(1),
  segments: z.array(diarizedSegmentSchema).min(1),
  usage: usageSchema
});

export interface CloudTranscriptSegment {
  speaker: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface CloudTranscriptionResult {
  text: string;
  segments: CloudTranscriptSegment[] | null;
  reportedDurationSeconds: number | null;
  model: string;
  latencyMs: number;
}

export interface OpenAiTranscriptionConfig {
  apiKey: string;
  standardModel: string;
  diarizationModel: string;
  endpoint?: string;
}

export type TranscriptionTransport = (
  url: string,
  init: RequestInit
) => Promise<Response>;

export class OpenAiTranscriptionProvider {
  constructor(
    private readonly config: OpenAiTranscriptionConfig,
    private readonly transport: TranscriptionTransport = fetch
  ) {}

  async transcribe(input: {
    mode: TranscriptionMode;
    audio: Uint8Array;
  }): Promise<CloudTranscriptionResult> {
    const model =
      input.mode === "diarized"
        ? this.config.diarizationModel
        : this.config.standardModel;
    const form = new FormData();
    form.set(
      "file",
      new File([input.audio], "consultation.wav", { type: "audio/wav" })
    );
    form.set("model", model);
    if (input.mode === "diarized") {
      form.set("response_format", "diarized_json");
      form.set("chunking_strategy", "auto");
    } else {
      form.set("response_format", "json");
    }

    const startedAt = Date.now();
    let response: Response;
    try {
      response = await this.transport(
        this.config.endpoint ?? OPENAI_TRANSCRIPTIONS_URL,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.apiKey}`
          },
          body: form,
          signal: AbortSignal.timeout(120_000)
        }
      );
    } catch {
      throw new Error("OpenAI transcription request failed");
    }

    if (!response.ok) {
      throw new Error(`OpenAI transcription request failed (${response.status})`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error("Invalid OpenAI transcription response");
    }

    if (input.mode === "diarized") {
      const parsed = diarizedResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error("Invalid OpenAI transcription response");
      }
      return {
        text: parsed.data.text,
        segments: parsed.data.segments.map((segment) => ({
          speaker: segment.speaker,
          startSeconds: segment.start,
          endSeconds: segment.end,
          text: segment.text
        })),
        reportedDurationSeconds: parsed.data.usage?.seconds ?? null,
        model,
        latencyMs: Date.now() - startedAt
      };
    }

    const parsed = standardResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new Error("Invalid OpenAI transcription response");
    }
    return {
      text: parsed.data.text,
      segments: null,
      reportedDurationSeconds: parsed.data.usage?.seconds ?? null,
      model,
      latencyMs: Date.now() - startedAt
    };
  }
}
