import prisma from "@/lib/prisma";
import { requireMedicalDoctorApiAccess } from "@/lib/medicalApi";

function serializeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const access = await requireMedicalDoctorApiAccess();
  if (access.response) return access.response;

  const params = await props.params;
  const doctorId = access.context.doctorId;
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return new Response("Missing jobId", { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendHeartbeat = () => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      };

      const interval = setInterval(async () => {
        const job = await prisma.aIProcessingJob.findFirst({
          where: {
            id: jobId,
            appointmentId: params.id,
            doctorId,
          },
          select: {
            id: true,
            status: true,
            progressPct: true,
            statusMessage: true,
            resultPayload: true,
            errorMessage: true,
          },
        });

        if (!job) {
          controller.enqueue(
            encoder.encode(serializeEvent("error", { error: "No se encontró el job solicitado." }))
          );
          clearInterval(interval);
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(serializeEvent("status", job)));

        if (job.status === "COMPLETED" || job.status === "FAILED") {
          clearInterval(interval);
          controller.close();
        }
      }, 1000);

      sendHeartbeat();
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Connection: "keep-alive",
    },
  });
}
