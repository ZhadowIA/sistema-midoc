import {
  AvailabilityRuleType,
  ClinicalProfile,
  DoctorServiceStatus,
  UserRole
} from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { prisma } from "../../lib/prisma";

class DoctorProfileServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

function assertTimeRange(startTime: string, endTime: string) {
  const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!timePattern.test(startTime) || !timePattern.test(endTime) || startTime >= endTime) {
    throw new DoctorProfileServiceError("Invalid time range.");
  }
}

function assertSlug(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new DoctorProfileServiceError("Public slug must use lowercase letters, numbers, and dashes.");
  }
}

async function getDoctorProfileOrThrow(userId: string) {
  const doctor = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      doctorProfile: true
    }
  });

  if (!doctor || doctor.role !== UserRole.DOCTOR || !doctor.doctorProfile) {
    throw new DoctorProfileServiceError("Doctor profile not found.", 404);
  }

  return {
    doctor,
    doctorProfile: doctor.doctorProfile
  };
}

export async function getDoctorWorkspace(userId: string) {
  const { doctorProfile } = await getDoctorProfileOrThrow(userId);

  return prisma.doctorProfile.findUniqueOrThrow({
    where: {
      id: doctorProfile.id
    },
    include: {
      services: {
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
      },
      availabilityRules: {
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
      },
      availabilityBlocks: {
        orderBy: [{ startsAt: "asc" }]
      },
      subscriptions: {
        include: {
          plan: true
        },
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });
}

export async function updateDoctorProfile(
  userId: string,
  input: {
    professionalName?: string;
    publicSlug?: string;
    specialty?: ClinicalProfile;
    description?: string | null;
    licenseNumber?: string | null;
    phone?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
    consultationDuration?: number;
    isPublic?: boolean;
  }
) {
  const { doctor, doctorProfile } = await getDoctorProfileOrThrow(userId);

  if (input.publicSlug) {
    assertSlug(input.publicSlug.trim());
  }

  if (input.consultationDuration !== undefined && input.consultationDuration <= 0) {
    throw new DoctorProfileServiceError("Consultation duration must be greater than zero.");
  }

  const updatedProfile = await prisma.doctorProfile.update({
    where: {
      id: doctorProfile.id
    },
    data: {
      professionalName: input.professionalName?.trim(),
      publicSlug: input.publicSlug?.trim(),
      specialty: input.specialty,
      description: input.description?.trim() ?? input.description,
      licenseNumber: input.licenseNumber?.trim() ?? input.licenseNumber,
      phone: input.phone?.trim() ?? input.phone,
      addressLine1: input.addressLine1?.trim() ?? input.addressLine1,
      addressLine2: input.addressLine2?.trim() ?? input.addressLine2,
      city: input.city?.trim() ?? input.city,
      state: input.state?.trim() ?? input.state,
      postalCode: input.postalCode?.trim() ?? input.postalCode,
      country: input.country?.trim() ?? input.country,
      consultationDuration: input.consultationDuration,
      isPublic: input.isPublic
    }
  });

  await writeAuditLog({
    actorUserId: doctor.id,
    entityType: "DoctorProfile",
    entityId: doctorProfile.id,
    action: "doctor-profile.updated",
    source: "doctor-profile-service",
    metadata: {
      isPublic: updatedProfile.isPublic,
      specialty: updatedProfile.specialty
    }
  });

  return updatedProfile;
}

export async function createDoctorService(
  userId: string,
  input: {
    name: string;
    description?: string;
    priceCents: number;
    currency?: string;
    durationMinutes: number;
    displayOrder?: number;
    status?: DoctorServiceStatus;
  }
) {
  const { doctor, doctorProfile } = await getDoctorProfileOrThrow(userId);

  if (input.priceCents < 0 || input.durationMinutes <= 0) {
    throw new DoctorProfileServiceError("Service price and duration must be valid.");
  }

  const service = await prisma.doctorService.create({
    data: {
      doctorProfileId: doctorProfile.id,
      name: input.name.trim(),
      description: input.description?.trim(),
      priceCents: input.priceCents,
      currency: input.currency?.trim().toUpperCase() || "MXN",
      durationMinutes: input.durationMinutes,
      displayOrder: input.displayOrder ?? 0,
      status: input.status ?? DoctorServiceStatus.ACTIVE
    }
  });

  await writeAuditLog({
    actorUserId: doctor.id,
    entityType: "DoctorService",
    entityId: service.id,
    action: "doctor-service.created",
    source: "doctor-profile-service",
    metadata: {
      name: service.name,
      status: service.status
    }
  });

  return service;
}

export async function updateDoctorService(
  userId: string,
  serviceId: string,
  input: {
    name?: string;
    description?: string | null;
    priceCents?: number;
    currency?: string;
    durationMinutes?: number;
    displayOrder?: number;
    status?: DoctorServiceStatus;
  }
) {
  const { doctor, doctorProfile } = await getDoctorProfileOrThrow(userId);

  const existingService = await prisma.doctorService.findFirst({
    where: {
      id: serviceId,
      doctorProfileId: doctorProfile.id
    }
  });

  if (!existingService) {
    throw new DoctorProfileServiceError("Service not found.", 404);
  }

  if (
    (input.priceCents !== undefined && input.priceCents < 0) ||
    (input.durationMinutes !== undefined && input.durationMinutes <= 0)
  ) {
    throw new DoctorProfileServiceError("Service price and duration must be valid.");
  }

  const service = await prisma.doctorService.update({
    where: {
      id: existingService.id
    },
    data: {
      name: input.name?.trim(),
      description: input.description?.trim() ?? input.description,
      priceCents: input.priceCents,
      currency: input.currency?.trim().toUpperCase(),
      durationMinutes: input.durationMinutes,
      displayOrder: input.displayOrder,
      status: input.status
    }
  });

  await writeAuditLog({
    actorUserId: doctor.id,
    entityType: "DoctorService",
    entityId: service.id,
    action: "doctor-service.updated",
    source: "doctor-profile-service",
    metadata: {
      status: service.status
    }
  });

  return service;
}

export async function createAvailabilityRule(
  userId: string,
  input: {
    dayOfWeek?: number;
    specificDate?: string;
    startTime: string;
    endTime: string;
    slotInterval?: number;
    maxAdvanceDays?: number;
    minAdvanceHours?: number;
    isActive?: boolean;
  }
) {
  const { doctor, doctorProfile } = await getDoctorProfileOrThrow(userId);

  assertTimeRange(input.startTime, input.endTime);

  if (input.dayOfWeek !== undefined && (input.dayOfWeek < 0 || input.dayOfWeek > 6)) {
    throw new DoctorProfileServiceError("dayOfWeek must be between 0 and 6.");
  }

  const ruleType = input.specificDate ? AvailabilityRuleType.DATE_OVERRIDE : AvailabilityRuleType.WEEKLY;

  const rule = await prisma.doctorAvailability.create({
    data: {
      doctorProfileId: doctorProfile.id,
      ruleType,
      dayOfWeek: ruleType === AvailabilityRuleType.WEEKLY ? input.dayOfWeek : null,
      specificDate: input.specificDate ? new Date(input.specificDate) : null,
      startTime: input.startTime,
      endTime: input.endTime,
      slotInterval: input.slotInterval ?? doctorProfile.consultationDuration,
      maxAdvanceDays: input.maxAdvanceDays,
      minAdvanceHours: input.minAdvanceHours,
      isActive: input.isActive ?? true
    }
  });

  await writeAuditLog({
    actorUserId: doctor.id,
    entityType: "DoctorAvailability",
    entityId: rule.id,
    action: "doctor-availability.created",
    source: "doctor-profile-service",
    metadata: {
      ruleType
    }
  });

  return rule;
}

export async function createAvailabilityBlock(
  userId: string,
  input: {
    startsAt: string;
    endsAt: string;
    reason?: string;
  }
) {
  const { doctor, doctorProfile } = await getDoctorProfileOrThrow(userId);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt >= endsAt) {
    throw new DoctorProfileServiceError("Invalid availability block range.");
  }

  const block = await prisma.doctorAvailabilityBlock.create({
    data: {
      doctorProfileId: doctorProfile.id,
      startsAt,
      endsAt,
      reason: input.reason?.trim()
    }
  });

  await writeAuditLog({
    actorUserId: doctor.id,
    entityType: "DoctorAvailabilityBlock",
    entityId: block.id,
    action: "doctor-availability-block.created",
    source: "doctor-profile-service"
  });

  return block;
}

export async function getPublicDoctorProfile(slug: string) {
  const profile = await prisma.doctorProfile.findFirst({
    where: {
      publicSlug: slug,
      isPublic: true
    },
    include: {
      user: true,
      services: {
        where: {
          status: DoctorServiceStatus.ACTIVE
        },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
      },
      availabilityRules: {
        where: {
          isActive: true
        },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
      },
      availabilityBlocks: {
        where: {
          endsAt: {
            gte: new Date()
          }
        },
        orderBy: [{ startsAt: "asc" }]
      }
    }
  });

  if (!profile) {
    return null;
  }

  return {
    doctor: {
      id: profile.userId,
      professionalName: profile.professionalName,
      publicSlug: profile.publicSlug,
      specialty: profile.specialty,
      description: profile.description,
      licenseNumber: profile.licenseNumber,
      phone: profile.phone,
      addressLine1: profile.addressLine1,
      addressLine2: profile.addressLine2,
      city: profile.city,
      state: profile.state,
      postalCode: profile.postalCode,
      country: profile.country,
      consultationDuration: profile.consultationDuration
    },
    services: profile.services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      priceCents: service.priceCents,
      currency: service.currency,
      durationMinutes: service.durationMinutes
    })),
    availability: profile.availabilityRules.map((rule) => ({
      id: rule.id,
      ruleType: rule.ruleType,
      dayOfWeek: rule.dayOfWeek,
      specificDate: rule.specificDate,
      startTime: rule.startTime,
      endTime: rule.endTime,
      slotInterval: rule.slotInterval,
      minAdvanceHours: rule.minAdvanceHours,
      maxAdvanceDays: rule.maxAdvanceDays
    })),
    blocks: profile.availabilityBlocks.map((block) => ({
      id: block.id,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      reason: block.reason
    }))
  };
}
