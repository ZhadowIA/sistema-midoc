import assert from "node:assert/strict";
import { test } from "node:test";

import { prepareRecordedSamples } from "./consultationRecorder.ts";

test("rechaza silencio o ruido residual antes de enviarlo a Whisper", () => {
  const noise = new Float32Array(16_000).fill(0.0001);
  assert.throws(
    () => prepareRecordedSamples([noise], 16_000),
    /No se detectó voz/
  );
});

test("normaliza una voz capturada con volumen bajo", () => {
  const quietVoice = Float32Array.from(
    { length: 16_000 },
    (_, index) => Math.sin((2 * Math.PI * 220 * index) / 16_000) * 0.01
  );

  const prepared = prepareRecordedSamples([quietVoice], 16_000);
  const peak = prepared.reduce(
    (maximum, sample) => Math.max(maximum, Math.abs(sample)),
    0
  );

  assert.ok(peak >= 0.08, `la señal preparada quedó demasiado baja: ${peak}`);
  assert.ok(peak <= 0.95, `la señal preparada saturó: ${peak}`);
});

test("elimina desplazamiento DC sin deformar la duración", () => {
  const biasedVoice = Float32Array.from(
    { length: 16_000 },
    (_, index) => 0.2 + Math.sin((2 * Math.PI * 180 * index) / 16_000) * 0.1
  );

  const prepared = prepareRecordedSamples([biasedVoice], 16_000);
  const mean =
    prepared.reduce((total, sample) => total + sample, 0) / prepared.length;

  assert.equal(prepared.length, 16_000);
  assert.ok(Math.abs(mean) < 0.001, `persistió desplazamiento DC: ${mean}`);
});
