import { describe, expect, it } from "vitest";

import { readWavDurationSeconds } from "../../src/services/ai/audio-duration";

function pcm16Wav(input: {
  durationSeconds: number;
  sampleRate?: number;
  channels?: number;
  dataSizeOverride?: number;
}) {
  const sampleRate = input.sampleRate ?? 16_000;
  const channels = input.channels ?? 1;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize =
    input.dataSizeOverride ?? Math.round(input.durationSeconds * byteRate);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

describe("WAV duration", () => {
  it("reads duration from mono PCM16 bytes", () => {
    expect(readWavDurationSeconds(pcm16Wav({ durationSeconds: 1 }))).toBe(1);
  });

  it("uses byte rate so stereo duration remains correct", () => {
    expect(
      readWavDurationSeconds(
        pcm16Wav({ durationSeconds: 2, channels: 2 })
      )
    ).toBe(2);
  });

  it("rejects malformed or empty WAV input", () => {
    expect(() => readWavDurationSeconds(Buffer.from("not a wav"))).toThrow();
    expect(() =>
      readWavDurationSeconds(
        pcm16Wav({ durationSeconds: 0, dataSizeOverride: 0 })
      )
    ).toThrow();
  });

  it("rejects a data chunk that extends past the received bytes", () => {
    const truncated = pcm16Wav({ durationSeconds: 1 }).subarray(0, 50);
    expect(() => readWavDurationSeconds(truncated)).toThrow();
  });
});
