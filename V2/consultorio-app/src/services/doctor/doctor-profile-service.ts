import {
  AvailabilityRuleType,
  ClinicalProfile,
  DoctorReview,
  DoctorServiceStatus,
  UserRole,
  UserStatus
} from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { ServiceError } from "../../lib/errors";
import {
  normalizeLicenseNumber,
  normalizeMexicanE164Phone,
  normalizeProfessionalName
} from "../../lib/identity-validation";
import { prisma } from "../../lib/prisma";
import { isValidTimeZone } from "../../lib/timezone";

class DoctorProfileServiceError extends ServiceError {}

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
      galleryImages: {
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
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
    timeZone?: string;
    isPublic?: boolean;
  }
) {
  const { doctor, doctorProfile } = await getDoctorProfileOrThrow(userId);

  if (input.timeZone !== undefined && !isValidTimeZone(input.timeZone)) {
    throw new DoctorProfileServiceError("Zona horaria no valida.");
  }

  if (input.publicSlug) {
    const slug = input.publicSlug.trim();
    assertSlug(slug);

    const slugTaken = await prisma.doctorProfile.findFirst({
      where: {
        publicSlug: slug,
        id: { not: doctorProfile.id }
      },
      select: { id: true }
    });

    if (slugTaken) {
      throw new DoctorProfileServiceError("Ese enlace publico ya esta en uso.", 409);
    }
  }

  if (input.consultationDuration !== undefined && input.consultationDuration <= 0) {
    throw new DoctorProfileServiceError("Consultation duration must be greater than zero.");
  }

  if (input.isPublic === true && (!doctor.emailVerifiedAt || doctor.status !== UserStatus.ACTIVE)) {
    throw new DoctorProfileServiceError(
      "Verifica tu correo y espera la aprobacion de tu cuenta antes de publicar el perfil.",
      403
    );
  }

  const professionalName =
    input.professionalName !== undefined
      ? normalizeProfessionalName(input.professionalName)
      : undefined;
  const licenseNumber =
    input.licenseNumber === null
      ? null
      : input.licenseNumber !== undefined
        ? normalizeLicenseNumber(input.licenseNumber)
        : undefined;
  const phone =
    input.phone === null
      ? null
      : input.phone !== undefined
        ? normalizeMexicanE164Phone(input.phone)
        : undefined;

  const updatedProfile = await prisma.doctorProfile.update({
    where: {
      id: doctorProfile.id
    },
    data: {
      professionalName,
      publicSlug: input.publicSlug?.trim(),
      specialty: input.specialty,
      description: input.description?.trim() ?? input.description,
      licenseNumber,
      phone,
      addressLine1: input.addressLine1?.trim() ?? input.addressLine1,
      addressLine2: input.addressLine2?.trim() ?? input.addressLine2,
      city: input.city?.trim() ?? input.city,
      state: input.state?.trim() ?? input.state,
      postalCode: input.postalCode?.trim() ?? input.postalCode,
      country: input.country?.trim() ?? input.country,
      consultationDuration: input.consultationDuration,
      timeZone: input.timeZone,
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

/* ---------- Galeria del perfil publico ---------- */

export async function createGalleryImage(
  userId: string,
  input: {
    url: string;
    caption?: string | null;
    displayOrder?: number;
  }
) {
  const { doctor, doctorProfile } = await getDoctorProfileOrThrow(userId);

  const url = input.url.trim();
  if (!/^https:\/\/.+/i.test(url)) {
    throw new DoctorProfileServiceError("La URL de la imagen debe iniciar con https://");
  }

  const count = await prisma.doctorGalleryImage.count({
    where: { doctorProfileId: doctorProfile.id }
  });

  if (count >= 12) {
    throw new DoctorProfileServiceError("La galeria admite hasta 12 imagenes.");
  }

  const image = await prisma.doctorGalleryImage.create({
    data: {
      doctorProfileId: doctorProfile.id,
      url,
      caption: input.caption?.trim() || null,
      displayOrder: input.displayOrder ?? count
    }
  });

  await writeAuditLog({
    actorUserId: doctor.id,
    entityType: "DoctorGalleryImage",
    entityId: image.id,
    action: "doctor-gallery-image.created",
    source: "doctor-profile-service"
  });

  return image;
}

export async function deleteGalleryImage(userId: string, imageId: string) {
  const { doctor, doctorProfile } = await getDoctorProfileOrThrow(userId);

  const existing = await prisma.doctorGalleryImage.findFirst({
    where: {
      id: imageId,
      doctorProfileId: doctorProfile.id
    }
  });

  if (!existing) {
    throw new DoctorProfileServiceError("Imagen no encontrada.", 404);
  }

  await prisma.doctorGalleryImage.delete({
    where: { id: existing.id }
  });

  await writeAuditLog({
    actorUserId: doctor.id,
    entityType: "DoctorGalleryImage",
    entityId: existing.id,
    action: "doctor-gallery-image.deleted",
    source: "doctor-profile-service"
  });

  return { id: existing.id };
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

  if (ruleType === AvailabilityRuleType.WEEKLY && input.dayOfWeek === undefined) {
    throw new DoctorProfileServiceError("Weekly rules require dayOfWeek.");
  }

  // Overlapping active rules on the same day would duplicate public slots.
  const siblingRules = await prisma.doctorAvailability.findMany({
    where: {
      doctorProfileId: doctorProfile.id,
      isActive: true,
      ruleType,
      ...(ruleType === AvailabilityRuleType.WEEKLY
        ? { dayOfWeek: input.dayOfWeek }
        : { specificDate: new Date(input.specificDate!) })
    },
    select: { startTime: true, endTime: true }
  });

  const overlaps = siblingRules.some(
    (sibling) => input.startTime < sibling.endTime && sibling.startTime < input.endTime
  );

  if (overlaps) {
    throw new DoctorProfileServiceError(
      "El horario se solapa con una regla de disponibilidad existente.",
      409
    );
  }

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

export async function setAvailabilityRuleActive(
  userId: string,
  ruleId: string,
  isActive: boolean
) {
  const { doctor, doctorProfile } = await getDoctorProfileOrThrow(userId);

  const existingRule = await prisma.doctorAvailability.findFirst({
    where: {
      id: ruleId,
      doctorProfileId: doctorProfile.id
    }
  });

  if (!existingRule) {
    throw new DoctorProfileServiceError("Availability rule not found.", 404);
  }

  const rule = await prisma.doctorAvailability.update({
    where: { id: existingRule.id },
    data: { isActive }
  });

  await writeAuditLog({
    actorUserId: doctor.id,
    entityType: "DoctorAvailability",
    entityId: rule.id,
    action: isActive ? "doctor-availability.activated" : "doctor-availability.deactivated",
    source: "doctor-profile-service"
  });

  return rule;
}

export async function deleteAvailabilityRule(userId: string, ruleId: string) {
  const { doctor, doctorProfile } = await getDoctorProfileOrThrow(userId);

  const existingRule = await prisma.doctorAvailability.findFirst({
    where: {
      id: ruleId,
      doctorProfileId: doctorProfile.id
    }
  });

  if (!existingRule) {
    throw new DoctorProfileServiceError("Availability rule not found.", 404);
  }

  await prisma.doctorAvailability.delete({
    where: { id: existingRule.id }
  });

  await writeAuditLog({
    actorUserId: doctor.id,
    entityType: "DoctorAvailability",
    entityId: existingRule.id,
    action: "doctor-availability.deleted",
    source: "doctor-profile-service",
    metadata: {
      ruleType: existingRule.ruleType,
      dayOfWeek: existingRule.dayOfWeek,
      startTime: existingRule.startTime,
      endTime: existingRule.endTime
    }
  });
}

export async function deleteAvailabilityBlock(userId: string, blockId: string) {
  const { doctor, doctorProfile } = await getDoctorProfileOrThrow(userId);

  const existingBlock = await prisma.doctorAvailabilityBlock.findFirst({
    where: {
      id: blockId,
      doctorProfileId: doctorProfile.id
    }
  });

  if (!existingBlock) {
    throw new DoctorProfileServiceError("Availability block not found.", 404);
  }

  await prisma.doctorAvailabilityBlock.delete({
    where: { id: existingBlock.id }
  });

  await writeAuditLog({
    actorUserId: doctor.id,
    entityType: "DoctorAvailabilityBlock",
    entityId: existingBlock.id,
    action: "doctor-availability-block.deleted",
    source: "doctor-profile-service",
    metadata: {
      startsAt: existingBlock.startsAt.toISOString(),
      endsAt: existingBlock.endsAt.toISOString()
    }
  });
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
      },
      galleryImages: {
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  // Las opiniones se consultan aparte para aislar fallos si la tabla aun no existe.
  let reviews: DoctorReview[] = [];
  if (profile) {
    try {
      reviews = await prisma.doctorReview.findMany({
        where: {
          doctorProfileId: profile.id,
          isVerified: true
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 50
      });
    } catch {
      reviews = [];
    }
  }

  if (!profile) {
    return null;
  }

  // Calcular rating promedio
  const averageRating = reviews.length > 0
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : 0;

  return {
    doctor: {
      id: profile.userId,
      professionalName: profile.professionalName,
      publicSlug: profile.publicSlug,
      specialty: profile.specialty,
      description: profile.description,
      licenseNumber: profile.licenseNumber,
      phone: profile.phone,
      profilePhoto: profile.profilePhoto,
      coverPhoto: profile.coverPhoto,
      addressLine1: profile.addressLine1,
      addressLine2: profile.addressLine2,
      city: profile.city,
      state: profile.state,
      postalCode: profile.postalCode,
      country: profile.country,
      consultationDuration: profile.consultationDuration,
      timeZone: profile.timeZone
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
    })),
    gallery: profile.galleryImages.map((image) => ({
      id: image.id,
      url: image.url,
      caption: image.caption
    })),
    reviews: reviews.map((review) => ({
      id: review.id,
      patientName: review.patientName,
      rating: review.rating,
      title: review.title,
      text: review.text,
      date: review.createdAt.toISOString(),
      isVerified: review.isVerified
    })),
    ratings: {
      averageRating,
      totalReviews: reviews.length,
      distribution: {
        five: reviews.filter(r => r.rating === 5).length,
        four: reviews.filter(r => r.rating === 4).length,
        three: reviews.filter(r => r.rating === 3).length,
        two: reviews.filter(r => r.rating === 2).length,
        one: reviews.filter(r => r.rating === 1).length
      }
    }
  };
}
