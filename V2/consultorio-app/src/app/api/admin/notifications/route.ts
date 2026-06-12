import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireCapability } from "../../../../lib/auth/require-capability";
import { listDoctorNotifications } from "../../../../services/notifications/notification-service";

export async function GET(request: Request) {
  try {
    const { user } = await requireCapability(request, "notifications");
    const notifications = await listDoctorNotifications(user.id);
    return NextResponse.json({ notifications });
  } catch (error) {
    return toErrorResponse(error, "No se pudieron obtener las notificaciones.");
  }
}
