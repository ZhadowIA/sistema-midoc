import { type Prisma, UserRole } from "@prisma/client";
import { z } from "zod";

import { writeAuditLog } from "../../lib/audit";
import { ServiceError } from "../../lib/errors";
import { normalizeLicenseNumber, normalizeProfessionalName } from "../../lib/identity-validation";
import { prisma } from "../../lib/prisma";

// Identidad profesional que exige la receta (Reglamento de Insumos para la
// Salud): nombre, cedula, institucion que expidio el titulo, especialidad con su
// cedula y domicilio del consultorio. Regla 4.6: se captura desde la web o desde
// la app, el portal manda y toda escritura trae la version que el cliente leyo.

class PrescriberProfileError extends ServiceError {}

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max).nullable()
  );

export const prescriberProfileInputSchema = z
  .object({
    professionalName: z.string().max(120),
    licenseNumber: z.string().max(30),
    degreeInstitution: optionalText(200),
    specialtyTitle: optionalText(120),
    specialtyLicenseNumber: optionalText(30),
    addressLine1: optionalText(200),
    addressLine2: optionalText(200),
    city: optionalText(100),
    state: optionalText(100),
    postalCode: optionalText(40),
    expectedUpdatedAt: z.iso.datetime()
  })
  .superRefine((value, ctx) => {
    if (value.specialtyTitle && !value.specialtyLicenseNumber) {
      ctx.addIssue({
        code: "custom",
        path: ["specialtyLicenseNumber"],
        message: "La especialidad requiere su cedula."
      });
    }
  });

export type PrescriberProfileInput = z.infer<typeof prescriberProfileInputSchema>;
export type PrescriberProfileSource = "web" | "desktop";

const prescriberSelect = {
  professionalName: true,
  licenseNumber: true,
  degreeInstitution: true,
  specialtyTitle: true,
  specialtyLicenseNumber: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  updatedAt: true
} as const;

type PrescriberRow = Prisma.DoctorProfileGetPayload<{ select: typeof prescriberSelect }>;

function toPrescriberProfile(row: PrescriberRow) {
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}

export type PrescriberProfile = ReturnType<typeof toPrescriberProfile>;

async function findPrescriberRow(doctorUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: doctorUserId },
    select: { role: true, doctorProfile: { select: { id: true, ...prescriberSelect } } }
  });

  if (!user || user.role !== UserRole.DOCTOR || !user.doctorProfile) {
    throw new PrescriberProfileError("Perfil del medico no encontrado.", 404);
  }

  const { id: profileId, ...row } = user.doctorProfile;
  return { profileId, row };
}

export async function getPrescriberProfile(doctorUserId: string): Promise<PrescriberProfile> {
  const { row } = await findPrescriberRow(doctorUserId);
  return toPrescriberProfile(row);
}

export async function updatePrescriberProfile(
  doctorUserId: string,
  input: PrescriberProfileInput,
  source: PrescriberProfileSource
): Promise<PrescriberProfile> {
  const { profileId } = await findPrescriberRow(doctorUserId);
  const { expectedUpdatedAt, ...fields } = input;

  // Concurrencia optimista atomica: solo escribe si nadie cambio el perfil desde
  // que el cliente lo leyo. Dos escritores con la misma version: gana uno.
  const { count } = await prisma.doctorProfile.updateMany({
    where: { id: profileId, updatedAt: new Date(expectedUpdatedAt) },
    data: {
      ...fields,
      professionalName: normalizeProfessionalName(fields.professionalName),
      licenseNumber: normalizeLicenseNumber(fields.licenseNumber),
      specialtyLicenseNumber: fields.specialtyLicenseNumber
        ? normalizeLicenseNumber(fields.specialtyLicenseNumber)
        : null
    }
  });

  if (count === 0) {
    throw new PrescriberProfileError(
      "Tus datos cambiaron desde otro lugar. Recarga para ver la version actual antes de guardar.",
      409
    );
  }

  await writeAuditLog({
    actorUserId: doctorUserId,
    entityType: "DoctorProfile",
    entityId: profileId,
    action: "doctor-profile.prescriber-updated",
    source: "prescriber-profile-service",
    metadata: { via: source }
  });

  return getPrescriberProfile(doctorUserId);
}
