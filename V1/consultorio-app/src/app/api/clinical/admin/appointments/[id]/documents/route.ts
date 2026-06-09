import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOADS_PER_APPOINTMENT,
  validateFileMagicBytes,
} from "@/lib/appointmentUploads";
import { generateBlobReadSasUrl, uploadBufferToAzureBlob } from "@/lib/azureBlob";

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getAuthenticatedUser();
  if (!session || session.role !== "DOCTOR") return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const appointment = await prisma.appointment.findFirst({
    where: { id, doctorId: session.id },
    select: { id: true },
  });
  if (!appointment) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });

  const rawDocs = await prisma.patientDocument.findMany({
    where: { appointmentId: id },
    orderBy: { uploadedAt: "desc" },
    take: 50,
  });

  // Generate short-lived SAS URLs so clients never hold permanent blob URLs
  const documents = await Promise.all(
    rawDocs.map(async (doc) => ({
      ...doc,
      fileUrl: await generateBlobReadSasUrl(doc.fileUrl),
    }))
  );

  return NextResponse.json({ documents });
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getAuthenticatedUser();
  if (!session || session.role !== "DOCTOR") return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const appointment = await prisma.appointment.findFirst({
    where: { id, doctorId: session.id },
    select: { id: true, doctorId: true, patientId: true },
  });
  if (!appointment) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Tipo no permitido" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Archivo demasiado grande" }, { status: 400 });
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
  if (!validateFileMagicBytes(bytes, file.type || "")) {
    return NextResponse.json({ error: "El contenido del archivo no coincide con el tipo declarado" }, { status: 400 });
  }

  const uploaded = await uploadBufferToAzureBlob({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes,
    folder: `appointments/${appointment.id}/doctor`,
  });

  // Store blobName (not the public URL) — SAS URLs are generated at read time
  const doc = await prisma.patientDocument.create({
    data: {
      appointmentId: appointment.id,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
      category: "STUDY",
      fileName: file.name,
      fileUrl: uploaded.blobName,
      mimeType: file.type || null,
      sizeBytes: file.size,
      uploadSource: "DOCTOR",
      uploadUserAgent: request.headers.get("user-agent") ?? null,
      uploadIp: request.headers.get("x-forwarded-for") ?? null,
    },
  });

  const fileUrl = await generateBlobReadSasUrl(doc.fileUrl);
  return NextResponse.json({ success: true, document: { ...doc, fileUrl } }, { status: 201 });
}
