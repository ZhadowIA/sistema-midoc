import { NextResponse } from "next/server";

import { searchPublicDoctors } from "../../../../services/doctor/doctor-search-service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await searchPublicDoctors({
      q: url.searchParams.get("q") ?? undefined,
      city: url.searchParams.get("city") ?? undefined,
      specialty: url.searchParams.get("specialty") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined
    });

    return NextResponse.json(result);
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No fue posible buscar medicos."
      },
      { status }
    );
  }
}
