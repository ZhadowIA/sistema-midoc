import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../../../lib/api-error";
import { requireDoctorUser } from "../../../../../../lib/auth/session-user";
import { deleteAvailabilityBlock } from "../../../../../../services/doctor/doctor-profile-service";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ blockId: string }> }
) {
  try {
    const user = await requireDoctorUser(request);
    const { blockId } = await context.params;
    await deleteAvailabilityBlock(user.id, blockId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error, "No se pudo eliminar el bloqueo.");
  }
}
