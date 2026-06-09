import { NextResponse } from "next/server";

import { listPublicAvailability } from "../../../../../../services/booking/public-booking-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const url = new URL(request.url);
    const serviceId = url.searchParams.get("serviceId");
    const dateFrom = url.searchParams.get("dateFrom");
    const days = url.searchParams.get("days");

    if (!serviceId || !dateFrom) {
      return NextResponse.json(
        {
          error: "serviceId and dateFrom are required."
        },
        { status: 400 }
      );
    }

    const availability = await listPublicAvailability({
      slug,
      serviceId,
      dateFrom,
      days: days ? Number(days) : undefined
    });

    return NextResponse.json(availability);
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to list availability."
      },
      { status }
    );
  }
}
