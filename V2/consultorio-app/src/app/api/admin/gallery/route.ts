import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireDoctorUser } from "../../../../lib/auth/session-user";
import {
  createGalleryImage,
  getDoctorWorkspace
} from "../../../../services/doctor/doctor-profile-service";

const createImageSchema = z.object({
  url: z.string().url().max(2048),
  caption: z.string().max(120).nullable().optional(),
  displayOrder: z.number().int().min(0).optional()
});

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const workspace = await getDoctorWorkspace(user.id);
    return NextResponse.json({ images: workspace.galleryImages });
  } catch (error) {
    return toErrorResponse(error, "No se pudo obtener la galeria.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const payload = createImageSchema.parse(await request.json());
    const image = await createGalleryImage(user.id, payload);
    return NextResponse.json({ image }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "No se pudo agregar la imagen.");
  }
}
