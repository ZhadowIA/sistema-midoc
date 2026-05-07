import prisma from "@/lib/prisma";
import { jsonNoStore } from "@/lib/http";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";
import { getRequestIp, getUserAgent } from "@/lib/requestContext";
import { ConsentCaptureService } from "@/services/ConsentCaptureService";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const access = await requireMedicalDoctorApiAccess();
  if (access.response) return access.response;

  const params = await props.params;
  const doctorId = access.context.doctorId;
  const actorUserId = access.context.user.id;

  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, doctorId },
    select: {
      id: true,
      patientId: true,
    },
  });

  if (!appointment) {
    return jsonNoStore({ error: "Cita no encontrada" }, { status: 404 });
  }

  const consent = await ConsentCaptureService.capture({
    appointmentId: appointment.id,
    doctorId,
    patientId: appointment.patientId,
    capturedByUserId: actorUserId,
    type: "VERBAL_RECORDING_CONFIRMATION",
    ipAddress: getRequestIp(request),
    userAgent: getUserAgent(request),
    metadata: {
      source: "recording_button",
    },
  });

  return jsonNoStore({
    success: true,
    consent: {
      id: consent.id,
      type: consent.type,
      createdAt: consent.createdAt,
    },
  });
}
