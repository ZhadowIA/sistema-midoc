const TARGET_SAMPLE_RATE = 16_000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function recordedWavFileName(date = new Date()): string {
  return [
    "consulta-grabada-",
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "-",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    ".wav"
  ].join("");
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function downsample(samples: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === TARGET_SAMPLE_RATE) return samples;
  if (inputSampleRate < TARGET_SAMPLE_RATE) {
    throw new Error("la frecuencia de muestreo no puede ser menor a 16 kHz");
  }

  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.floor(samples.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(Math.floor((index + 1) * ratio), samples.length);
    let sum = 0;
    let count = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      sum += samples[sampleIndex] ?? 0;
      count += 1;
    }
    output[index] = count > 0 ? sum / count : 0;
  }

  return output;
}

function removeDcOffset(samples: Float32Array): Float32Array {
  const mean = samples.reduce((total, sample) => total + sample, 0) / samples.length;
  return Float32Array.from(samples, (sample) => sample - mean);
}

function peakAmplitude(samples: Float32Array): number {
  return samples.reduce(
    (maximum, sample) => Math.max(maximum, Math.abs(sample)),
    0
  );
}

function maximumWindowRms(samples: Float32Array): number {
  const windowLength = Math.min(TARGET_SAMPLE_RATE / 10, samples.length);
  let maximum = 0;
  for (let start = 0; start < samples.length; start += windowLength) {
    const end = Math.min(start + windowLength, samples.length);
    let sumSquares = 0;
    for (let index = start; index < end; index += 1) {
      const sample = samples[index] ?? 0;
      sumSquares += sample * sample;
    }
    maximum = Math.max(maximum, Math.sqrt(sumSquares / Math.max(1, end - start)));
  }
  return maximum;
}

/**
 * Prepara la señal capturada por Web Audio antes de codificarla. La entrada del
 * micrófono puede llegar con volumen muy bajo o con desplazamiento DC; enviarla
 * así a Whisper provoca alucinaciones breves sobre ruido residual.
 */
export function prepareRecordedSamples(
  chunks: Float32Array[],
  inputSampleRate: number
): Float32Array {
  if (chunks.length === 0) {
    throw new Error("la grabacion no contiene audio");
  }

  const samples = removeDcOffset(
    downsample(mergeChunks(chunks), inputSampleRate)
  );
  const peak = peakAmplitude(samples);
  const activeRms = maximumWindowRms(samples);

  if (peak < 0.003 || activeRms < 0.0015) {
    throw new Error(
      "No se detectó voz con volumen suficiente. Revisa el micrófono y vuelve a grabar."
    );
  }

  const desiredGain = activeRms < 0.08 ? 0.08 / activeRms : 1;
  const clippingLimit = 0.95 / peak;
  const gain = Math.min(desiredGain, clippingLimit, 20);
  return Float32Array.from(samples, (sample) => sample * gain);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function encodePcm16Wav(samples: Float32Array, sampleRate = TARGET_SAMPLE_RATE): ArrayBuffer {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, Math.round(value), true);
    offset += bytesPerSample;
  }

  return buffer;
}

export function createRecordedWavFile(
  chunks: Float32Array[],
  inputSampleRate: number,
  date = new Date()
): File {
  const samples = prepareRecordedSamples(chunks, inputSampleRate);
  const wav = encodePcm16Wav(samples, TARGET_SAMPLE_RATE);
  return new File([wav], recordedWavFileName(date), { type: "audio/wav" });
}
