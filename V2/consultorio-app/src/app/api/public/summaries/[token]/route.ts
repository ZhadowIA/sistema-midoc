import { NextResponse } from "next/server";

import { requestIpFrom, toErrorResponse } from "../../../../../lib/api-error";
import { assertRateLimit } from "../../../../../lib/rate-limit";
import { getAuthorizedSummaryForDownload } from "../../../../../services/documents/authorized-summary-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const ipAddress = requestIpFrom(request);
    await assertRateLimit({ key: `summary-download:${ipAddress ?? token}`, limit: 60, windowMs: 1000 * 60 * 15 });

    const summary = await getAuthorizedSummaryForDownload(token, { ipAddress });
    return NextResponse.json(summary);
  } catch (error) {
    return toErrorResponse(error, "No se pudo abrir el resumen.");
  }
}
