import { NextResponse } from "next/server";

import { env } from "../../../../../lib/env";
import { processNotificationQueue } from "../../../../../services/notifications/notification-service";

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${env.NOTIFICATION_CRON_SECRET}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const stats = await processNotificationQueue();
  return NextResponse.json({ stats });
}
