import { describe, expect, it } from "vitest";

import { readWavDurationSeconds } from "../../src/services/ai/audio-duration";

// Construye un WAV PCM16 minimo y valido en memoria. `byteRate` = sampleRate *
// channels * bytesPerSample, y la duracion = dataSize / byteRate.
function buildWav(opts: {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  durationSeconds?: number;
  audioFormat?: number;
  dataSizeOverride?: number;
}): Buffer {
  const sampleRate = opts.sampleRate ?? 16000;
  const channels = opts.channels ?? 1;
  const bitsPerSample = opts.bitsPerSample ?? 16;
  const audioFormat = opts.audioFormat ?? 1;
  const bytesPerSample = bitsPerSample / 8;
  const byteRate = sampleRate * channels * bytesPerSample;
  const blockAlign = channels * bytesPerSample;
  const dataSize =
    opts.dataSizeOverride ?? Math.round(byteRate * (opts.durationSeconds ?? 1));

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(audioFormat, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, Buffer.alloc(dataSize)]);
}

describe("readWavDurationSeconds", () => {
  it("reads the duration of a mono PCM16 WAV", () => {
    expect(readWavDurationSeconds(buildWav({ durationSeconds: 1 }))).toBe(1);
    expect(readWavDurationSeconds(buildWav({ durationSeconds: 12 }))).toBe(12);
  });

  it("accounts for channels through byteRate", () => {
    // Estereo, 2 s: el byteRate ya incluye los canales, asi que la duracion
    // sigue siendo 2 aunque el dataSize sea el doble que en mono.
    expect(
      readWavDurationSeconds(buildWav({ channels: 2, durationSeconds: 2 }))
    ).toBe(2);
  });

  it("rejects a non-WAV buffer", () => {
    expect(() => readWavDurationSeconds(Buffer.from("definitely not a wav file"))).toThrow();
  });

  it("rejects a WAV with an empty data chunk", () => {
    expect(() => readWavDurationSeconds(buildWav({ dataSizeOverride: 0 }))).toThrow();
  });

  it("rejects a truncated data chunk", () => {
    const wav = buildWav({ durationSeconds: 1 });
    // Declara mas bytes de data de los que realmente trae el buffer.
    wav.writeUInt32LE(999999, 40);
    expect(() => readWavDurationSeconds(wav)).toThrow();
  });

  it("rejects a non-PCM (compressed) WAV", () => {
    expect(() => readWavDurationSeconds(buildWav({ audioFormat: 3 }))).toThrow();
  });
});
