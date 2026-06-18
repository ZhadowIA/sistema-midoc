import { UserStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireAdminUser } from "../../../../lib/auth/session-user";
import { listDoctorAccountsForAdmin } from "../../../../services/platform-admin/platform-admin-service";

const querySchema = z.object({
  status: z.nativeEnum(UserStatus).optional()
});

export async function GET(request: Request) {
  try {
    const user = await requireAdminUser(request);
    const url = new URL(request.url);
    const query = querySchema.parse({
      status: url.searchParams.get("status") || undefined
    });
    const result = await listDoctorAccountsForAdmin(user.id, query);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "No se pudieron obtener los medicos.");
  }
}
