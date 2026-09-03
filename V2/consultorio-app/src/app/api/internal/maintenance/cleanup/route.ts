import { NextResponse } from "next/server";

import { isCronAuthorized } from "../../../../../lib/auth/cron-auth";
import { runPilotCleanup } from "../../../../../services/operations/maintenance-service";

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const stats = await runPilotCleanup();
  return NextResponse.json({ stats });
}
