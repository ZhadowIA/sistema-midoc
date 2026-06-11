import { NextResponse } from "next/server";

import { getReadinessStatus } from "../../../services/operations/health-service";

export async function GET() {
  const status = await getReadinessStatus();
  return NextResponse.json(status, { status: status.status === "ready" ? 200 : 503 });
}
