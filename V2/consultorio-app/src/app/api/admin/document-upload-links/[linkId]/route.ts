import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../../lib/api-error";
import { requireDoctorUser } from "../../../../../lib/auth/session-user";
import { revokeUploadLink } from "../../../../../services/documents/document-service";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ linkId: string }> }
) {
  try {
    const user = await requireDoctorUser(request);
    const { linkId } = await context.params;
    const link = await revokeUploadLink(user.id, linkId);
    return NextResponse.json({ link });
  } catch (error) {
    return toErrorResponse(error, "No se pudo revocar el enlace.");
  }
}
