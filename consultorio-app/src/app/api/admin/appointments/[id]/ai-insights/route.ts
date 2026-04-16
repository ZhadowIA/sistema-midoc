import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedDoctorId } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generateComprehensiveInsights } from "@/lib/aiNoteService";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimit";
import { z } from "zod";

const aiInsightsRequestSchema = z.object({
  soap: z
    .object({
      subjective: z.string().trim().max(12_000).optional(),
      objective: z.string().trim().max(12_000).optional(),
      assessment: z.string().trim().max(12_000).optional(),
      plan: z.string().trim().max(12_000).optional(),
      privateNotes: z.string().trim().max(12_000).optional(),
    })
    .optional(),
});

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = checkRateLimit(req, {
      key: "admin:ai:insights:get",
      limit: 30,
      windowMs: 15 * 60_000,
    });
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit);

    const params = await props.params;
    const doctorId = await getAuthenticatedDoctorId();
    if (!doctorId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const insight = await prisma.aIInsight.findFirst({
      where: { appointmentId: params.id, doctorId },
    });

    return NextResponse.json(insight || {});
  } catch (error: unknown) {
    console.error("AI Insights GET Error:", error);
    return NextResponse.json({ error: "No fue posible cargar los insights de IA." }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = checkRateLimit(req, {
      key: "admin:ai:insights:post",
      limit: 12,
      windowMs: 15 * 60_000,
    });
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit);

    const params = await props.params;
    const doctorId = await getAuthenticatedDoctorId();
    if (!doctorId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsedBody = aiInsightsRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Payload inválido", details: parsedBody.error.issues }, { status: 400 });
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
      },
    });

    if (!appointment) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const context = {
      soap: parsedBody.data.soap,
      questionnaire: appointment.questionnaire,
      medicalRecord: appointment.patient?.medicalRecord,
    };

    const insights = await generateComprehensiveInsights(context);

    // Save or Update in DB
    const updated = await prisma.aIInsight.upsert({
      where: { appointmentId: params.id },
      update: {
        diagnoses: insights.diagnoses,
        treatments: insights.treatments,
        allowedFoods: insights.allowedFoods,
        forbiddenFoods: insights.forbiddenFoods,
      },
      create: {
        appointmentId: params.id,
        doctorId,
        diagnoses: insights.diagnoses,
        treatments: insights.treatments,
        allowedFoods: insights.allowedFoods,
        forbiddenFoods: insights.forbiddenFoods,
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error("AI Insights Error:", error);
    return NextResponse.json(
      { error: "No fue posible generar sugerencias clínicas con IA. Intenta nuevamente." },
      { status: 500 }
    );
  }
}
