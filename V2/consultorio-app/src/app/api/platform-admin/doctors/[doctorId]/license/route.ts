import { LicenseSource } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../../lib/api-error";
import { requireAdminUser } from "../../../../../../lib/auth/session-user";
import { grantLicense } from "../../../../../../services/license/license-service";

// Otorgamiento de licencia por el administrador (paso 29) mientras no exista la
// compra en linea (paso 17): piloto o cortesia.
const grantSchema = z.object({
  source: z.enum([LicenseSource.GRANT, LicenseSource.PILOT]),
  maxDevices: z.number().int().min(1).max(10).optional()
});

export async function POST(request: Request, context: { params: Promise<{ doctorId: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { doctorId } = await context.params;
    const payload = grantSchema.parse(await request.json());
    const license = await grantLicense({
      actorUserId: admin.id,
      doctorUserId: doctorId,
      source: payload.source,
      maxDevices: payload.maxDevices
    });
    return NextResponse.json({ licenseId: license.id, updatesUntil: license.updatesUntil }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "No se pudo otorgar la licencia.");
  }
}
