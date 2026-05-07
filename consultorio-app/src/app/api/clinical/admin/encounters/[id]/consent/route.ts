import prisma from "@/lib/prisma";
import { jsonNoStore } from "@/lib/http";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";
import { getRequestIp, getUserAgent } from "@/lib/requestContext";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const access = await requireMedicalDoctorApiAccess();
  if (access.response) return access.response;

  const params = await props.params;
  const doctorId = access.context.doctorId;

  const encounter = await prisma.clinicalEncounter.findFirst({
    where: { id: params.id, doctorId },
    select: { id: true, patientId: true, appointmentId: true },
  });

  if (!encounter) {
    return jsonNoStore({ error: "Encounter no encontrado" }, { status: 404 });
  }

  // For encounters with an appointment, delegate to appointment consent.
  // For standalone encounters, record consent against the appointment if available, otherwise skip.
  if (encounter.appointmentId) {
    const { ConsentCaptureService } = await import("@/services/ConsentCaptureService");
    const consent = await ConsentCaptureService.capture({
      appointmentId: encounter.appointmentId,
      doctorId,
      patientId: encounter.patientId,
      capturedByUserId: access.context.user.id,
      type: "VERBAL_RECORDING_CONFIRMATION",
      ipAddress: getRequestIp(request),
      userAgent: getUserAgent(request),
      metadata: { source: "recording_button_encounter", clinicalEncounterId: encounter.id },
    });
    return jsonNoStore({ success: true, consent: { id: consent.id, type: consent.type, createdAt: consent.createdAt } });
  }

  // Standalone encounter: log audit but no appointment-based consent record needed
  prisma.auditLog.create({
    data: {
      doctorId,
      actorUserId: access.context.user.id,
      action: "VERBAL_RECORDING_CONSENT_CAPTURED",
      ipAddress: getRequestIp(request),
      userAgent: getUserAgent(request),
      metadata: { source: "recording_button_standalone", clinicalEncounterId: encounter.id },
    },
  }).catch(() => undefined);

  return jsonNoStore({ success: true });
}
