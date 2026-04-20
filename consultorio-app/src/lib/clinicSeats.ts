import prisma from "@/lib/prisma";

export type ClinicSeatSummary = {
  included: number;
  used: number;
  available: number;
  overLimit: boolean;
};

function normalizeIncludedSeats(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return 1;
}

export async function getClinicSeatSummary(clinicId: string): Promise<ClinicSeatSummary> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { ownerId: true },
  });

  const ownerSubscription = clinic?.ownerId
    ? await prisma.doctorSubscription.findUnique({
        where: { doctorId: clinic.ownerId },
        select: { features: true },
      })
    : null;

  const rawSeats =
    ownerSubscription?.features &&
    typeof ownerSubscription.features === "object" &&
    ownerSubscription.features !== null &&
    "seats" in ownerSubscription.features
      ? (ownerSubscription.features as Record<string, unknown>).seats
      : undefined;

  const included = normalizeIncludedSeats(rawSeats);

  const used = await prisma.user.count({
    where: {
      clinicId,
      active: true,
      role: { in: ["DOCTOR", "CLINIC_ADMIN"] },
    },
  });

  return {
    included,
    used,
    available: Math.max(included - used, 0),
    overLimit: used > included,
  };
}
