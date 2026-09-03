import { NextResponse } from "next/server";

import { isCronAuthorized } from "../../../../../lib/auth/cron-auth";
import { processNotificationQueue } from "../../../../../services/notifications/notification-service";

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const stats = await processNotificationQueue();
  return NextResponse.json({ stats });
}
