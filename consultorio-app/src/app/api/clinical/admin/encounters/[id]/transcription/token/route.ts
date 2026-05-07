import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimit";
import { jsonNoStore } from "@/lib/http";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";
import { getDeepgramEphemeralKeyTtlSeconds, mintEphemeralKey } from "@/lib/deepgramClient";
import { getRequestIp, getUserAgent } from "@/lib/requestContext";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimit = await checkRateLimit(req, {
      key: "admin:deepgram:token",
      limit: 30,
      windowMs: 15 * 60_000,
    });
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit);

    const access = await requireMedicalDoctorApiAccess({ requiredFeature: "ai.dictation" });
    if (access.response) return access.response;

    const params = await props.params;
    const doctorId = access.context.doctorId;
    const actorUserId = access.context.user.id;

    const encounter = await prisma.clinicalEncounter.findFirst({
      where: { id: params.id, doctorId },
      select: { id: true },
    });
    if (!encounter) {
      return jsonNoStore({ error: "No encontrado" }, { status: 404 });
    }

    const ttlSeconds = getDeepgramEphemeralKeyTtlSeconds();
    const key = await mintEphemeralKey({
      comment: `stream:encounter:${encounter.id}:${Date.now()}`,
      ttlSeconds,
    });

    prisma.auditLog.create({
      data: {
        doctorId,
        actorUserId,
        action: "DEEPGRAM_TRANSCRIPTION_TOKEN_ISSUED",
        ipAddress: getRequestIp(req),
        userAgent: getUserAgent(req),
        metadata: { ttlSeconds, expiresAt: key.expiresAt, clinicalEncounterId: encounter.id },
      },
    }).catch((error) => {
      console.error("Deepgram token telemetry error:", error);
    });

    return jsonNoStore({ apiKey: key.apiKey, expiresAt: key.expiresAt });
  } catch (error: unknown) {
    console.error("Deepgram token error:", error);
    const message =
      error instanceof Error && error.message.includes("no está configurado")
        ? error.message
        : "No fue posible emitir la credencial de transcripción.";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}
