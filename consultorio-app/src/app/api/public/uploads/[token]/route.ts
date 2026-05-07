import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOADS_PER_APPOINTMENT,
  validateFileMagicBytes,
  verifyAppointmentUploadToken,
} from "@/lib/appointmentUploads";
import { uploadBufferToAzureBlob } from "@/lib/azureBlob";

const schema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(100),
  sizeBytes: z.number().int().positive(),
});

export async function GET(_: Request, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  try {
    const payload = await verifyAppointmentUploadToken(token);
    const appointment = await prisma.appointment.findFirst({
      where: { id: payload.appointmentId, doctorId: payload.doctorId },
      select: {
        id: true,
        uploadsEnabled: true,
        uploadsExpiresAt: true,
        patient: { select: { firstName: true, lastNamePaternal: true } },
        doctor: { select: { name: true } },
      },
    });
    if (
      !appointment ||
      !appointment.uploadsEnabled ||
      (appointment.uploadsExpiresAt && appointment.uploadsExpiresAt < new Date())
    ) {
      return NextResponse.json({ valid: false }, { status: 410 });
    }
    return NextResponse.json({
      valid: true,
      doctorName: appointment.doctor.name,
      patientName: `${appointment.patient.firstName} ${appointment.patient.lastNamePaternal}`.trim(),
    });
  } catch {
    return NextResponse.json({ valid: false }, { status: 401 });
  }
}

export async function POST(request: Request, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  try {
    const payload = await verifyAppointmentUploadToken(token);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

    const parsed = schema.safeParse({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });
    if (!parsed.success) return NextResponse.json({ error: "Payload inválido" }, { status: 400 });

    if (!ALLOWED_MIME_TYPES.includes(parsed.data.mimeType)) {
      return NextResponse.json({ error: "Tipo no permitido" }, { status: 400 });
    }
    if (parsed.data.sizeBytes > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Archivo demasiado grande" }, { status: 400 });
    }

    const appointment = await prisma.appointment.findFirst({
      where: { id: payload.appointmentId, doctorId: payload.doctorId },
      select: { id: true, doctorId: true, patientId: true, uploadsEnabled: true, uploadsExpiresAt: true },
    });
    if (
      !appointment ||
      !appointment.uploadsEnabled ||
      (appointment.uploadsExpiresAt && appointment.uploadsExpiresAt < new Date())
    ) {
      return NextResponse.json({ error: "Carga no habilitada" }, { status: 410 });
    }

    // Enforce per-appointment upload limit
    const existingCount = await prisma.patientDocument.count({
      where: { appointmentId: appointment.id },
    });
    if (existingCount >= MAX_UPLOADS_PER_APPOINTMENT) {
      return NextResponse.json(
        { error: `Límite de ${MAX_UPLOADS_PER_APPOINTMENT} archivos por cita alcanzado` },
        { status: 422 }
      );
    }

    // Validate actual file content against declared MIME type
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validateFileMagicBytes(bytes, parsed.data.mimeType)) {
      return NextResponse.json({ error: "El contenido del archivo no coincide con el tipo declarado" }, { status: 400 });
    }

    const uploaded = await uploadBufferToAzureBlob({
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      bytes,
      folder: `appointments/${appointment.id}/external`,
    });

    // Store blobName (not the public URL) — SAS URLs are generated at read time
    const doc = await prisma.patientDocument.create({
      data: {
        appointmentId: appointment.id,
        doctorId: appointment.doctorId,
        patientId: appointment.patientId,
        category: "STUDY",
        fileName: parsed.data.fileName,
        fileUrl: uploaded.blobName,
        mimeType: parsed.data.mimeType,
        sizeBytes: parsed.data.sizeBytes,
        uploadSource: "EXTERNAL_LINK",
        uploadIp: request.headers.get("x-forwarded-for") ?? null,
        uploadUserAgent: request.headers.get("user-agent") ?? null,
      },
    });

    return NextResponse.json({ success: true, documentId: doc.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }
}
