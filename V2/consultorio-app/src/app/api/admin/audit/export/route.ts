import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../lib/api-error";
import { requireDoctorUser } from "../../../../../lib/auth/session-user";
import { exportAuditLog } from "../../../../../services/compliance/compliance-service";

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const url = new URL(request.url);
    const { from, to } = rangeSchema.parse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined
    });

    const export_ = await exportAuditLog(user.id, { from, to });

    return new NextResponse(JSON.stringify(export_, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="auditoria-${user.id}.json"`
      }
    });
  } catch (error) {
    return toErrorResponse(error, "No se pudo exportar la auditoria.");
  }
}
