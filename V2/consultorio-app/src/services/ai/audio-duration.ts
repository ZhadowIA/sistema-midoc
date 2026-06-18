const MIN_WAV_BYTES = 44;

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export function readWavDurationSeconds(bytes: Uint8Array): number {
  if (bytes.byteLength < MIN_WAV_BYTES) {
    throw new Error("Invalid WAV audio");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") {
    throw new Error("Invalid WAV audio");
  }

  const declaredFileBytes = view.getUint32(4, true) + 8;
  if (declaredFileBytes > bytes.byteLength) {
    throw new Error("Truncated WAV audio");
  }

  let byteRate: number | null = null;
  let dataSize: number | null = null;
  let offset = 12;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = ascii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > bytes.byteLength) {
      throw new Error("Truncated WAV audio");
    }

    if (chunkId === "fmt ") {
      if (chunkSize < 16) {
        throw new Error("Invalid WAV format");
      }
      const audioFormat = view.getUint16(chunkStart, true);
      const channels = view.getUint16(chunkStart + 2, true);
      const sampleRate = view.getUint32(chunkStart + 4, true);
      const parsedByteRate = view.getUint32(chunkStart + 8, true);
      const blockAlign = view.getUint16(chunkStart + 12, true);
      const bitsPerSample = view.getUint16(chunkStart + 14, true);

      if (
        audioFormat !== 1 ||
        channels < 1 ||
        sampleRate < 1 ||
        bitsPerSample !== 16 ||
        blockAlign !== channels * 2 ||
        parsedByteRate !== sampleRate * blockAlign
      ) {
        throw new Error("Unsupported WAV format");
      }
      byteRate = parsedByteRate;
    } else if (chunkId === "data") {
      dataSize = chunkSize;
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!byteRate || !dataSize) {
    throw new Error("WAV audio has no samples");
  }

  const durationSeconds = dataSize / byteRate;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Invalid WAV duration");
  }

  return durationSeconds;
}
