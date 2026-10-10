import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../../lib/api-error";
import { requireDoctorUser } from "../../../../../lib/auth/session-user";
import {
  getPrescriberProfile,
  prescriberProfileInputSchema,
  updatePrescriberProfile
} from "../../../../../services/doctor/prescriber-profile-service";

// Datos del medico para la receta, editados desde la web (regla 4.6).

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    return NextResponse.json({ prescriber: await getPrescriberProfile(user.id) });
  } catch (error) {
    return toErrorResponse(error, "No se pudieron leer tus datos.");
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const input = prescriberProfileInputSchema.parse(await request.json());
    return NextResponse.json({ prescriber: await updatePrescriberProfile(user.id, input, "web") });
  } catch (error) {
    return toErrorResponse(error, "No se pudieron guardar tus datos.");
  }
}
