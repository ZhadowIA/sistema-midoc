import { ClinicalProfile } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireDoctorUser } from "../../../../lib/auth/session-user";
import { getDoctorWorkspace, updateDoctorProfile } from "../../../../services/doctor/doctor-profile-service";

const profileSchema = z.object({
  professionalName: z.string().min(1).optional(),
  publicSlug: z.string().min(3).optional(),
  specialty: z.nativeEnum(ClinicalProfile).optional(),
  description: z.string().max(2000).nullable().optional(),
  licenseNumber: z.string().max(100).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  addressLine1: z.string().max(200).nullable().optional(),
  addressLine2: z.string().max(200).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  postalCode: z.string().max(40).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  consultationDuration: z.number().int().positive().optional(),
  isPublic: z.boolean().optional()
});

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const workspace = await getDoctorWorkspace(user.id);
    return NextResponse.json({ profile: workspace });
  } catch (error) {
    return toErrorResponse(error, "No se pudo obtener el perfil.");
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const payload = profileSchema.parse(await request.json());
    const profile = await updateDoctorProfile(user.id, payload);
    return NextResponse.json({ profile });
  } catch (error) {
    return toErrorResponse(error, "No se pudo actualizar el perfil.");
  }
}
