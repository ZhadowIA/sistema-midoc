import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { signAppointmentUploadToken } from "@/lib/appointmentUploads";

const schema = z.object({
  uploadsEnabled: z.boolean(),
  expiresInHours: z.number().int().min(1).max(168).optional(),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getAuthenticatedUser();
  if (!session || (session.role !== "DOCTOR" && session.role !== "SECRETARY")) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  const now = new Date();
  const expiresAt = parsed.data.uploadsEnabled
    ? new Date(now.getTime() + (parsed.data.expiresInHours ?? 24) * 60 * 60 * 1000)
    : null;
  const appointment = await prisma.appointment.update({
    where: { id: params.id, doctorId: session.id },
    data: {
      uploadsEnabled: parsed.data.uploadsEnabled,
      uploadsEnabledAt: parsed.data.uploadsEnabled ? now : null,
      uploadsExpiresAt: expiresAt,
    },
    select: { id: true, uploadsEnabled: true, uploadsExpiresAt: true },
  });
  return NextResponse.json({ appointment });
}

export async function POST(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getAuthenticatedUser();
  if (!session || (session.role !== "DOCTOR" && session.role !== "SECRETARY")) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, doctorId: session.id },
    select: { id: true, doctorId: true, uploadsEnabled: true, uploadsExpiresAt: true },
  });
  if (!appointment) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  if (!appointment.uploadsEnabled) return NextResponse.json({ error: "Primero habilita las cargas" }, { status: 409 });
  const token = await signAppointmentUploadToken({ appointmentId: appointment.id, doctorId: appointment.doctorId, scope: "upload" });
  return NextResponse.json({ token, url: `/subir-estudios/${token}`, expiresAt: appointment.uploadsExpiresAt });
}
