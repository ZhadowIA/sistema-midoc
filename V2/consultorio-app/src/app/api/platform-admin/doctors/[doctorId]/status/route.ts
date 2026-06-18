import { UserStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../../lib/api-error";
import { requireAdminUser } from "../../../../../../lib/auth/session-user";
import { updateDoctorAccountStatus } from "../../../../../../services/platform-admin/platform-admin-service";

const statusSchema = z.object({
  status: z.enum([
    UserStatus.ACTIVE,
    UserStatus.PENDING_APPROVAL,
    UserStatus.SUSPENDED,
    UserStatus.ARCHIVED
  ])
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ doctorId: string }> }
) {
  try {
    const user = await requireAdminUser(request);
    const { doctorId } = await context.params;
    const payload = statusSchema.parse(await request.json());
    const doctor = await updateDoctorAccountStatus(user.id, doctorId, payload.status);
    return NextResponse.json({ doctor });
  } catch (error) {
    return toErrorResponse(error, "No se pudo actualizar el medico.");
  }
}
