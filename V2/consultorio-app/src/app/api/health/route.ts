import { NextResponse } from "next/server";

import { getHealthStatus } from "../../../services/operations/health-service";

export async function GET() {
  return NextResponse.json(await getHealthStatus());
}
