import { NextResponse } from "next/server";

import { requestIpFrom, toErrorResponse } from "../../../lib/api-error";
import { resolveShortLink } from "../../../services/notifications/notification-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await context.params;
    const link = await resolveShortLink(code, {
      ipAddress: requestIpFrom(request)
    });

    return NextResponse.redirect(link.destinationUrl, { status: 307 });
  } catch (error) {
    return toErrorResponse(error, "No se pudo abrir el enlace.");
  }
}
