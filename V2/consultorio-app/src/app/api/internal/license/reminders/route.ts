import { NextResponse } from "next/server";

import { env } from "../../../../../lib/env";
import { sendUpdatesEndingReminders } from "../../../../../services/license/updates-reminder-service";

/**
 * Avisos por correo de fin de actualizaciones. Lo llama Vercel Cron una vez al
 * dia (`vercel.json`), que manda `Authorization: Bearer <CRON_SECRET>`; tambien
 * acepta el secreto de cron propio del portal para llamarlo a mano.
 */
function isAuthorized(request: Request) {
  const header = request.headers.get("authorization");
  const secrets = [env.CRON_SECRET, env.NOTIFICATION_CRON_SECRET].filter(Boolean);
  return secrets.some((secret) => header === `Bearer ${secret}`);
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const stats = await sendUpdatesEndingReminders();
  return NextResponse.json({ stats });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
