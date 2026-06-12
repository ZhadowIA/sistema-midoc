import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../../lib/api-error";
import { requireDoctorUser } from "../../../../../lib/auth/session-user";
import { deleteGalleryImage } from "../../../../../services/doctor/doctor-profile-service";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ imageId: string }> }
) {
  try {
    const user = await requireDoctorUser(request);
    const { imageId } = await context.params;
    const result = await deleteGalleryImage(user.id, imageId);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "No se pudo eliminar la imagen.");
  }
}
