import assert from "node:assert/strict";
import {
  createRecordedWavFile,
  recordedWavFileName
} from "../src/consultationRecorder.ts";

const file = createRecordedWavFile(
  [new Float32Array([0, 0.5, -0.5, 1, -1])],
  16_000,
  new Date("2026-06-16T12:34:56Z")
);

assert.equal(file.name, "consulta-grabada-20260616-123456.wav");
assert.equal(file.type, "audio/wav");

const bytes = new Uint8Array(await file.arrayBuffer());
const text = new TextDecoder("ascii").decode(bytes);

assert.equal(text.slice(0, 4), "RIFF", "genera un contenedor RIFF");
assert.equal(text.slice(8, 12), "WAVE", "genera formato WAVE");
assert.equal(text.slice(12, 16), "fmt ", "incluye chunk fmt");
assert.equal(text.slice(36, 40), "data", "incluye chunk data");

const view = new DataView(bytes.buffer);
assert.equal(view.getUint16(20, true), 1, "usa PCM lineal");
assert.equal(view.getUint16(22, true), 1, "usa mono");
assert.equal(view.getUint32(24, true), 16_000, "usa 16 kHz");
assert.equal(view.getUint16(34, true), 16, "usa PCM16");
assert.equal(view.getUint32(40, true), 10, "codifica cinco muestras de 16 bits");

assert.equal(
  recordedWavFileName(new Date("2026-01-02T03:04:05Z")),
  "consulta-grabada-20260102-030405.wav",
  "nombra grabaciones de forma estable"
);
