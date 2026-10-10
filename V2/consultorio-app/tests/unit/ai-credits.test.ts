import { describe, expect, it } from "vitest";

import { getAiCreditCost, getTranscriptionCreditCost } from "../../src/services/ai/ai-credits";

describe("AI credits", () => {
  it("prices MiDoc AI tasks using the commercial credit catalog", () => {
    expect(getAiCreditCost("SOAP_SUMMARY")).toBe(1);
    expect(getAiCreditCost("PATIENT_INSTRUCTIONS")).toBe(1);
    expect(getAiCreditCost("TRANSCRIPTION")).toBe(1);
    expect(getAiCreditCost("LONGITUDINAL_SUMMARY")).toBe(2);
    expect(getAiCreditCost("CLINICAL_GAP")).toBe(2);
    expect(getAiCreditCost("CONSULTATION_STRUCTURING")).toBe(1);
  });

  it("charges cloud transcription by started duration blocks", () => {
    // Estandar: bloques de 900 s (15 min). Inclusivo: 1-900 cuesta 1.
    expect(getTranscriptionCreditCost({ mode: "standard", durationSeconds: 1 })).toBe(1);
    expect(getTranscriptionCreditCost({ mode: "standard", durationSeconds: 900 })).toBe(1);
    expect(getTranscriptionCreditCost({ mode: "standard", durationSeconds: 901 })).toBe(2);
    // Diarizado: bloques de 600 s (10 min). Inclusivo: 1-600 cuesta 1.
    expect(getTranscriptionCreditCost({ mode: "diarized", durationSeconds: 600 })).toBe(1);
    expect(getTranscriptionCreditCost({ mode: "diarized", durationSeconds: 601 })).toBe(2);
  });

  it("rejects an invalid transcription duration", () => {
    expect(() => getTranscriptionCreditCost({ mode: "standard", durationSeconds: 0 })).toThrow();
    expect(() => getTranscriptionCreditCost({ mode: "standard", durationSeconds: -5 })).toThrow();
    expect(() =>
      getTranscriptionCreditCost({ mode: "standard", durationSeconds: Number.NaN })
    ).toThrow();
  });

  it("transcribes for free when the provider runs Whisper locally", () => {
    expect(getAiCreditCost("TRANSCRIPTION", { providerName: "whisper-local-medium" })).toBe(0);
    expect(getAiCreditCost("TRANSCRIPTION", { providerName: "whisper-local-small" })).toBe(0);
    // Sin contexto de proveedor local, el catalogo fijo se conserva.
    expect(getAiCreditCost("TRANSCRIPTION")).toBe(1);
    expect(getAiCreditCost("TRANSCRIPTION", { providerName: "cloud-openai" })).toBe(1);
  });
});
