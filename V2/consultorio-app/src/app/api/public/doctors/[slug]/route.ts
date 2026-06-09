import { NextResponse } from "next/server";

import { getPublicDoctorProfile } from "../../../../../services/doctor/doctor-profile-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const profile = await getPublicDoctorProfile(slug);

  if (!profile) {
    return NextResponse.json(
      {
        error: "Doctor profile not found."
      },
      { status: 404 }
    );
  }

  return NextResponse.json(profile);
}
