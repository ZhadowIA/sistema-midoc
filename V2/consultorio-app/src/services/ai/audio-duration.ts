// Parser estricto de duracion de WAV PCM. Es la fuente AUTORITATIVA de la
// duracion para el cobro de transcripcion en nube: el portal no confia en la
// duracion declarada por el cliente, la calcula del WAV validado en memoria.
//
// Funcion pura y testeable: no toca disco ni red. Recorre los sub-chunks RIFF
// para tolerar metadata intermedia (p. ej. LIST) y exige PCM, byteRate valido y
// un chunk `data` no vacio ni truncado.

const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const FMT_MIN_BYTES = 16;
const PCM_AUDIO_FORMAT = 1;

export function readWavDurationSeconds(buffer: Buffer): number {
  if (buffer.length < RIFF_HEADER_BYTES) {
    throw new Error("WAV invalido: encabezado RIFF incompleto");
  }
  if (buffer.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("WAV invalido: falta la marca RIFF");
  }
  if (buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("WAV invalido: falta la marca WAVE");
  }

  let audioFormat: number | undefined;
  let byteRate: number | undefined;
  let dataSize: number | undefined;

  let offset = RIFF_HEADER_BYTES;
  while (offset + CHUNK_HEADER_BYTES <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + CHUNK_HEADER_BYTES;

    if (chunkId === "fmt ") {
      if (chunkStart + FMT_MIN_BYTES > buffer.length) {
        throw new Error("WAV invalido: chunk fmt truncado");
      }
      audioFormat = buffer.readUInt16LE(chunkStart);
      byteRate = buffer.readUInt32LE(chunkStart + 8);
    } else if (chunkId === "data") {
      if (chunkStart + chunkSize > buffer.length) {
        throw new Error("WAV invalido: chunk data truncado");
      }
      dataSize = chunkSize;
    }

    // Los chunks RIFF se alinean a palabra (padding a tamano par).
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (audioFormat === undefined || byteRate === undefined) {
    throw new Error("WAV invalido: falta el chunk fmt");
  }
  if (audioFormat !== PCM_AUDIO_FORMAT) {
    throw new Error("WAV invalido: solo se admite PCM");
  }
  if (byteRate <= 0) {
    throw new Error("WAV invalido: byteRate no valido");
  }
  if (dataSize === undefined || dataSize <= 0) {
    throw new Error("WAV invalido: chunk data vacio");
  }

  const durationSeconds = dataSize / byteRate;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("WAV invalido: duracion no valida");
  }

  return durationSeconds;
}
