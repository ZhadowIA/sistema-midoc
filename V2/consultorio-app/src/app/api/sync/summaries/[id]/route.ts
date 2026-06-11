import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../../lib/api-error";
import { revokeAuthorizedSummary } from "../../../../../services/documents/authorized-summary-service";
import { authenticateSyncDevice } from "../../../../../services/sync/sync-service";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const device = await authenticateSyncDevice(request);
    const { id } = await context.params;
    const result = await revokeAuthorizedSummary(device, id);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "No se pudo revocar el resumen.");
  }
}
