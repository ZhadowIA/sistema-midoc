import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonNoStore } from "@/lib/http";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";
import { getRequestIp, getUserAgent } from "@/lib/requestContext";
import { AppointmentAuditService } from "@/services/AppointmentAuditService";

const applyInsightSchema = z.object({
  kind: z.enum(["DIAGNOSIS", "TREATMENT"]),
  text: z.string().trim().min(1).max(800),
});

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
  const access = await requireMedicalDoctorApiAccess({ requiredFeature: "ai.insights" });
    if (access.response) return access.response;

    const params = await props.params;
    const doctorId = access.context.doctorId;
    const actorUserId = access.context.user.id;

    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, doctorId },
      select: { id: true, patientId: true },
    });
    if (!appointment) {
      return jsonNoStore({ error: "No encontrado" }, { status: 404 });
    }

    const parsed = applyInsightSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonNoStore({ error: "Payload inválido" }, { status: 400 });
    }

    const ipAddress = getRequestIp(req);
    const userAgent = getUserAgent(req);

    await AppointmentAuditService.safeLog({
      doctorId,
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      actorType: "DOCTOR",
      actorUserId,
      source: "ADMIN_PANEL",
      action: "CLINICAL_NOTE_UPDATED",
      ipAddress,
      userAgent,
      metadata: {
        eventType: "AI_INSIGHT_APPLIED",
        insightKind: parsed.data.kind,
        text: parsed.data.text,
      },
    });

    return jsonNoStore({ ok: true });
  } catch (error) {
    console.error("AI insight apply tracking error:", error);
    return jsonNoStore(
      { error: "No fue posible registrar la aplicación de la sugerencia." },
      { status: 500 },
    );
  }
}
