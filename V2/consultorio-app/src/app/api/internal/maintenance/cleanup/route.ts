import { NextResponse } from "next/server";

import { runPilotCleanup } from "../../../../../services/operations/maintenance-service";

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.NOTIFICATION_CRON_SECRET;
  return Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const stats = await runPilotCleanup();
  return NextResponse.json({ stats });
}
