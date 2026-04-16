import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedDoctorId } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { transcribeAudio, generateSOAPFromTranscript } from "@/lib/aiNoteService";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimit";
import { z } from "zod";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const allowedAudioTypes = new Set([
  "audio/webm",
  "video/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
]);

const aiGenerateQuerySchema = z.object({
  maxBytes: z.coerce.number().int().min(1).max(50 * 1024 * 1024).optional(),
});

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = checkRateLimit(req, {
      key: "admin:ai:note:generate",
      limit: 15,
      windowMs: 15 * 60_000,
    });
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit);

    const params = await props.params;
    const doctorId = await getAuthenticatedDoctorId();
    if (!doctorId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Verify appointment ownership
    const appointment = await prisma.appointment.findUnique({
      where: { id: params.id },
      select: { doctorId: true },
    });

    if (!appointment || appointment.doctorId !== doctorId) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const formData = await req.formData();
    const audioEntry = formData.get("audio");

    if (!(audioEntry instanceof Blob)) {
      return NextResponse.json({ error: "Archivo de audio no encontrado" }, { status: 400 });
    }
    const audioFile = audioEntry;
    const url = new URL(req.url);
    const parsedQuery = aiGenerateQuerySchema.safeParse({
      maxBytes: url.searchParams.get("maxBytes") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }

    const effectiveMaxBytes = parsedQuery.data.maxBytes ?? MAX_AUDIO_BYTES;
    const mimeType = (audioFile.type || "").toLowerCase().split(";")[0].trim();
    if (!allowedAudioTypes.has(mimeType)) {
      return NextResponse.json(
        { error: "Formato de audio no permitido. Usa WebM, OGG, MP3, MP4 o WAV." },
        { status: 400 }
      );
    }

    if (audioFile.size <= 0) {
      return NextResponse.json({ error: "El archivo de audio está vacío." }, { status: 400 });
    }

    if (audioFile.size > effectiveMaxBytes) {
      return NextResponse.json(
        { error: `El audio excede el tamaño máximo permitido (${Math.round(effectiveMaxBytes / 1024 / 1024)}MB).` },
        { status: 413 }
      );
    }

    // Convert Blob to Buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Transcribe
    const fileName = audioEntry instanceof File ? audioEntry.name : "audio";
    const transcript = await transcribeAudio({
      audioBuffer: buffer,
      mimeType,
      fileName,
    });
    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: "No se pudo extraer texto del audio. Intenta grabar con más claridad." },
        { status: 422 }
      );
    }

    // 2. Generate SOAP
    const soapData = await generateSOAPFromTranscript(transcript);

    return NextResponse.json({
      transcript,
      soap: soapData,
    });
  } catch (error: unknown) {
    console.error("AI Generation Error:", error);
    return NextResponse.json(
      { error: "No fue posible generar la nota con IA. Intenta nuevamente en unos minutos." },
      { status: 500 }
    );
  }
}
