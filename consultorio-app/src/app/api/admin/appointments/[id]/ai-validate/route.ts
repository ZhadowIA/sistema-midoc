import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { validatePrescription } from "@/lib/aiNoteService";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimit";
import { z } from "zod";
import { jsonNoStore } from "@/lib/http";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";

const prescriptionSchema = z.object({
  medication: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(200).optional().default(""),
  frequency: z.string().trim().max(200).optional().default(""),
  duration: z.string().trim().max(200).optional().default(""),
  instructions: z.string().trim().max(1000).optional().default(""),
});

const aiValidateRequestSchema = z.object({
  prescriptions: z.array(prescriptionSchema).max(50),
});

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = checkRateLimit(req, {
      key: "admin:ai:validate:post",
      limit: 20,
      windowMs: 15 * 60_000,
    });
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit);

    const params = await props.params;
    const access = await requireMedicalDoctorApiAccess();
    if (access.response) return access.response;
    const doctorId = access.context.doctorId;

    const body = await req.json().catch(() => ({}));
    const parsedBody = aiValidateRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return jsonNoStore({ error: "Payload inválido", details: parsedBody.error.issues }, { status: 400 });
    }

    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, doctorId },
      include: {
        questionnaire: true,
        patient: {
          include: {
            medicalRecord: true,
          },
        },
        doctor: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!appointment) return jsonNoStore({ error: "No encontrado" }, { status: 404 });

    const alerts = await validatePrescription({
      prescriptions: parsedBody.data.prescriptions,
      medicalRecord: appointment.patient?.medicalRecord,
      questionnaire: appointment.questionnaire,
    }, {
      patientName: appointment.patient?.fullName,
      doctorName: appointment.doctor?.name,
    });

    return jsonNoStore({ alerts });
  } catch (error: unknown) {
    console.error("AI Validation Error:", error);
    return jsonNoStore(
      { error: "No fue posible validar la receta con IA en este momento." },
      { status: 500 }
    );
  }
}
