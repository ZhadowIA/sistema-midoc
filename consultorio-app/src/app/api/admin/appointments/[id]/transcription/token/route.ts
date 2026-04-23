import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimit";
import { jsonNoStore } from "@/lib/http";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";
import { mintEphemeralKey } from "@/lib/deepgramClient";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimit = checkRateLimit(req, {
      key: "admin:deepgram:token",
      limit: 30,
      windowMs: 15 * 60_000,
    });
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit);

    const access = await requireMedicalDoctorApiAccess({ requiredFeature: "ai.dictation" });
    if (access.response) return access.response;

    const params = await props.params;
    const doctorId = access.context.doctorId;

    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, doctorId },
      select: { id: true },
    });
    if (!appointment) {
      return jsonNoStore({ error: "No encontrado" }, { status: 404 });
    }

    const key = await mintEphemeralKey({
      comment: `stream:${appointment.id}:${Date.now()}`,
      ttlSeconds: 60 * 60,
    });

    return jsonNoStore({
      apiKey: key.apiKey,
      expiresAt: key.expiresAt,
    });
  } catch (error: unknown) {
    console.error("Deepgram token error:", error);
    const message =
      error instanceof Error && error.message.includes("no está configurado")
        ? error.message
        : "No fue posible emitir la credencial de transcripción.";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}
