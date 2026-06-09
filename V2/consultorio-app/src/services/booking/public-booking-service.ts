import {
  AppointmentSource,
  AppointmentStatus,
  HoldStatus,
  LegalDocumentType,
  NotificationChannel,
  NotificationKind,
  NotificationStatus,
  PatientStatus,
  PrecheckinStatus
} from "@prisma/client";
import { Prisma } from "@prisma/client";

import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";
import { generateOpaqueToken } from "../../lib/security/token";
import { writeAuditLog } from "../../lib/audit";

const HOLD_TTL_MS = 1000 * 60 * 10;

type SlotRecord = {
  slotStart: string;
  slotEnd: string;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
};

class PublicBookingServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function buildDateTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes, 0, 0));
}

function sameUtcDate(left: Date, right: Date) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

function overlaps(rangeAStart: Date, rangeAEnd: Date, rangeBStart: Date, rangeBEnd: Date) {
  return rangeAStart < rangeBEnd && rangeAEnd > rangeBStart;
}

async function expireStaleHolds() {
  await prisma.appointmentHold.updateMany({
    where: {
      status: HoldStatus.ACTIVE,
      expiresAt: {
        lte: new Date()
      }
    },
    data: {
      status: HoldStatus.EXPIRED,
      releasedAt: new Date()
    }
  });
}

async function getPublicDoctorOrThrow(slug: string) {
  const profile = await prisma.doctorProfile.findFirst({
    where: {
      publicSlug: slug,
      isPublic: true
    },
    include: {
      user: true,
      services: {
        where: {
          status: "ACTIVE"
        },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
      },
      availabilityRules: {
        where: {
          isActive: true
        }
      },
      availabilityBlocks: {
        where: {
          endsAt: {
            gte: new Date()
          }
        }
      }
    }
  });

  if (!profile) {
    throw new PublicBookingServiceError("Doctor profile not found.", 404);
  }

  return profile;
}

async function getSlotConflicts(doctorId: string, slotStart: Date, slotEnd: Date) {
  await expireStaleHolds();

  const [appointments, holds] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        doctorId,
        status: {
          not: AppointmentStatus.CANCELLED
        },
        scheduledStart: {
          lt: slotEnd
        },
        scheduledEnd: {
          gt: slotStart
        }
      }
    }),
    prisma.appointmentHold.findMany({
      where: {
        doctorId,
        status: HoldStatus.ACTIVE,
        expiresAt: {
          gt: new Date()
        },
        slotStart: {
          lt: slotEnd
        },
        slotEnd: {
          gt: slotStart
        }
      }
    })
  ]);

  return {
    appointments,
    holds
  };
}

function getRuleSlots(input: {
  date: Date;
  ruleStartTime: string;
  ruleEndTime: string;
  slotInterval: number;
  durationMinutes: number;
  minAdvanceHours?: number | null;
  maxAdvanceDays?: number | null;
}) {
  const ruleStart = buildDateTime(input.date, input.ruleStartTime);
  const ruleEnd = buildDateTime(input.date, input.ruleEndTime);
  const slots: Array<{ slotStart: Date; slotEnd: Date }> = [];
  const now = new Date();

  for (
    let cursor = new Date(ruleStart);
    addMinutes(cursor, input.durationMinutes) <= ruleEnd;
    cursor = addMinutes(cursor, input.slotInterval)
  ) {
    const slotStart = new Date(cursor);
    const slotEnd = addMinutes(slotStart, input.durationMinutes);
    const advanceHours = (slotStart.getTime() - now.getTime()) / 3_600_000;
    const advanceDays = advanceHours / 24;

    if (input.minAdvanceHours !== null && input.minAdvanceHours !== undefined && advanceHours < input.minAdvanceHours) {
      continue;
    }

    if (input.maxAdvanceDays !== null && input.maxAdvanceDays !== undefined && advanceDays > input.maxAdvanceDays) {
      continue;
    }

    slots.push({
      slotStart,
      slotEnd
    });
  }

  return slots;
}

export async function listPublicAvailability(input: {
  slug: string;
  serviceId: string;
  dateFrom: string;
  days?: number;
}) {
  const profile = await getPublicDoctorOrThrow(input.slug);
  const service = profile.services.find((item) => item.id === input.serviceId);

  if (!service) {
    throw new PublicBookingServiceError("Service not found for this doctor.", 404);
  }

  const dateFrom = new Date(`${input.dateFrom}T00:00:00.000Z`);

  if (Number.isNaN(dateFrom.getTime())) {
    throw new PublicBookingServiceError("Invalid start date.");
  }

  const days = Math.min(Math.max(input.days ?? 7, 1), 30);
  const until = addMinutes(startOfUtcDay(dateFrom), days * 24 * 60);

  const [appointments, holds] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        doctorId: profile.userId,
        status: {
          not: AppointmentStatus.CANCELLED
        },
        scheduledStart: {
          gte: dateFrom,
          lt: until
        }
      },
      select: {
        scheduledStart: true,
        scheduledEnd: true
      }
    }),
    prisma.appointmentHold.findMany({
      where: {
        doctorId: profile.userId,
        status: HoldStatus.ACTIVE,
        expiresAt: {
          gt: new Date()
        },
        slotStart: {
          gte: dateFrom,
          lt: until
        }
      },
      select: {
        slotStart: true,
        slotEnd: true
      }
    })
  ]);

  const slots: SlotRecord[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const date = startOfUtcDay(addMinutes(dateFrom, dayOffset * 24 * 60));
    const matchingRules = profile.availabilityRules.filter((rule) => {
      if (rule.ruleType === "DATE_OVERRIDE" && rule.specificDate) {
        return sameUtcDate(rule.specificDate, date);
      }

      return rule.ruleType === "WEEKLY" && rule.dayOfWeek === date.getUTCDay();
    });

    for (const rule of matchingRules) {
      const ruleSlots = getRuleSlots({
        date,
        ruleStartTime: rule.startTime,
        ruleEndTime: rule.endTime,
        slotInterval: rule.slotInterval,
        durationMinutes: service.durationMinutes,
        minAdvanceHours: rule.minAdvanceHours,
        maxAdvanceDays: rule.maxAdvanceDays
      });

      for (const slot of ruleSlots) {
        const blockedByException = profile.availabilityBlocks.some((block) =>
          overlaps(slot.slotStart, slot.slotEnd, block.startsAt, block.endsAt)
        );
        const blockedByAppointment = appointments.some((appointment) =>
          overlaps(slot.slotStart, slot.slotEnd, appointment.scheduledStart, appointment.scheduledEnd)
        );
        const blockedByHold = holds.some((hold) => overlaps(slot.slotStart, slot.slotEnd, hold.slotStart, hold.slotEnd));

        if (blockedByException || blockedByAppointment || blockedByHold) {
          continue;
        }

        slots.push({
          slotStart: slot.slotStart.toISOString(),
          slotEnd: slot.slotEnd.toISOString(),
          serviceId: service.id,
          serviceName: service.name,
          durationMinutes: service.durationMinutes
        });
      }
    }
  }

  return {
    doctor: {
      id: profile.userId,
      slug: profile.publicSlug,
      professionalName: profile.professionalName
    },
    service: {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes
    },
    slots
  };
}

export async function createAppointmentHold(input: {
  slug: string;
  serviceId: string;
  slotStart: string;
}) {
  const profile = await getPublicDoctorOrThrow(input.slug);
  const service = profile.services.find((item) => item.id === input.serviceId);

  if (!service) {
    throw new PublicBookingServiceError("Service not found for this doctor.", 404);
  }

  const slotStart = new Date(input.slotStart);
  const slotEnd = addMinutes(slotStart, service.durationMinutes);

  if (Number.isNaN(slotStart.getTime())) {
    throw new PublicBookingServiceError("Invalid slot start.");
  }

  const availability = await listPublicAvailability({
    slug: input.slug,
    serviceId: input.serviceId,
    dateFrom: slotStart.toISOString().slice(0, 10),
    days: 1
  });

  const slotIsAvailable = availability.slots.some((slot) => slot.slotStart === slotStart.toISOString());

  if (!slotIsAvailable) {
    throw new PublicBookingServiceError("The selected slot is no longer available.", 409);
  }

  const token = generateOpaqueToken(20);
  const hold = await prisma.appointmentHold.create({
    data: {
      doctorId: profile.userId,
      serviceId: service.id,
      token,
      status: HoldStatus.ACTIVE,
      slotStart,
      slotEnd,
      expiresAt: new Date(Date.now() + HOLD_TTL_MS)
    }
  });

  await writeAuditLog({
    entityType: "AppointmentHold",
    entityId: hold.id,
    action: "public-booking.hold-created",
    source: "public-booking-service",
    metadata: {
      doctorId: profile.userId,
      serviceId: service.id
    }
  });

  return hold;
}

async function findOrCreatePatient(input: {
  doctorId: string;
  patient: {
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    birthDate?: string;
  };
}) {
  const email = input.patient.email?.trim().toLowerCase();
  const phone = input.patient.phone?.trim();

  const existingPatient = await prisma.patient.findFirst({
    where: {
      ownerDoctorId: input.doctorId,
      OR: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone, firstName: input.patient.firstName.trim(), lastName: input.patient.lastName.trim() }] : [])
      ]
    }
  });

  if (existingPatient) {
    return prisma.patient.update({
      where: {
        id: existingPatient.id
      },
      data: {
        phone: phone ?? existingPatient.phone,
        birthDate: input.patient.birthDate ? new Date(input.patient.birthDate) : existingPatient.birthDate
      }
    });
  }

  return prisma.patient.create({
    data: {
      ownerDoctorId: input.doctorId,
      firstName: input.patient.firstName.trim(),
      lastName: input.patient.lastName.trim(),
      phone,
      email,
      birthDate: input.patient.birthDate ? new Date(input.patient.birthDate) : null,
      status: PatientStatus.ACTIVE
    }
  });
}

export async function bookPublicAppointment(input: {
  holdToken: string;
  patient: {
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    birthDate?: string;
  };
  reason?: string;
  contact?: {
    fullName: string;
    relationship?: string;
    phone?: string;
    email?: string;
  };
  legal: {
    acceptedTerms: boolean;
    acceptedPrivacy: boolean;
    ipAddress?: string;
    userAgent?: string;
  };
}) {
  if (!input.legal.acceptedTerms || !input.legal.acceptedPrivacy) {
    throw new PublicBookingServiceError("Terms and privacy acceptance are required.", 400);
  }

  await expireStaleHolds();

  const hold = await prisma.appointmentHold.findUnique({
    where: {
      token: input.holdToken
    },
    include: {
      service: true
    }
  });

  if (!hold || hold.status !== HoldStatus.ACTIVE || hold.expiresAt <= new Date()) {
    throw new PublicBookingServiceError("Hold is invalid or expired.", 409);
  }

  const conflicts = await getSlotConflicts(hold.doctorId, hold.slotStart, hold.slotEnd);

  const hasConflictingAppointments = conflicts.appointments.length > 0;
  const hasOtherConflictingHolds = conflicts.holds.some((item) => item.id !== hold.id);

  if (hasConflictingAppointments || hasOtherConflictingHolds) {
    throw new PublicBookingServiceError("The selected slot is no longer available.", 409);
  }

  const patient = await findOrCreatePatient({
    doctorId: hold.doctorId,
    patient: input.patient
  });

  const confirmationToken = generateOpaqueToken(18);

  const appointment = await prisma.appointment.create({
    data: {
      doctorId: hold.doctorId,
      patientId: patient.id,
      serviceId: hold.serviceId,
      status: AppointmentStatus.PENDING,
      source: AppointmentSource.PATIENT,
      scheduledStart: hold.slotStart,
      scheduledEnd: hold.slotEnd,
      reason: input.reason?.trim(),
      confirmationToken,
      timeZone: "America/Chihuahua"
    }
  });

  await prisma.appointmentHold.update({
    where: {
      id: hold.id
    },
    data: {
      status: HoldStatus.CONVERTED,
      appointmentId: appointment.id,
      patientId: patient.id
    }
  });

  await prisma.precheckinSubmission.create({
    data: {
      appointmentId: appointment.id,
      patientId: patient.id,
      status: PrecheckinStatus.DRAFT,
      responses: {}
    }
  });

  if (input.contact?.fullName) {
    await prisma.patientContact.create({
      data: {
        patientId: patient.id,
        fullName: input.contact.fullName.trim(),
        relationship: input.contact.relationship?.trim(),
        phone: input.contact.phone?.trim(),
        email: input.contact.email?.trim().toLowerCase(),
        isPrimary: true
      }
    });
  }

  await prisma.legalAcceptance.createMany({
    data: [
      {
        patientId: patient.id,
        documentType: LegalDocumentType.TERMS,
        version: env.TERMS_VERSION,
        ipAddress: input.legal.ipAddress,
        userAgent: input.legal.userAgent
      },
      {
        patientId: patient.id,
        documentType: LegalDocumentType.PRIVACY,
        version: env.PRIVACY_VERSION,
        ipAddress: input.legal.ipAddress,
        userAgent: input.legal.userAgent
      }
    ]
  });

  if (patient.phone) {
    await prisma.notification.create({
      data: {
        doctorId: hold.doctorId,
        patientId: patient.id,
        appointmentId: appointment.id,
        channel: NotificationChannel.SMS,
        kind: NotificationKind.APPOINTMENT_CONFIRMATION,
        destination: patient.phone,
        body: `Tu cita ha sido registrada. Confirma con el token ${confirmationToken}.`,
        status: NotificationStatus.PENDING,
        metadata: {
          confirmationToken
        }
      }
    });
  }

  if (patient.email) {
    await prisma.notification.create({
      data: {
        doctorId: hold.doctorId,
        patientId: patient.id,
        appointmentId: appointment.id,
        channel: NotificationChannel.EMAIL,
        kind: NotificationKind.APPOINTMENT_CONFIRMATION,
        destination: patient.email,
        subject: "Confirma tu cita",
        body: `Tu cita ha sido registrada. Confirma con el token ${confirmationToken}.`,
        status: NotificationStatus.PENDING,
        metadata: {
          confirmationToken
        }
      }
    });
  }

  await writeAuditLog({
    entityType: "Appointment",
    entityId: appointment.id,
    action: "public-booking.appointment-created",
    source: "public-booking-service",
    metadata: {
      doctorId: hold.doctorId,
      patientId: patient.id
    }
  });

  return {
    appointment,
    patient,
    confirmationToken
  };
}

export async function getPublicAppointmentByToken(confirmationToken: string) {
  const appointment = await prisma.appointment.findUnique({
    where: {
      confirmationToken
    },
    include: {
      patient: true,
      service: true,
      precheckins: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  if (!appointment) {
    return null;
  }

  return {
    appointment,
    patient: appointment.patient,
    service: appointment.service,
    precheckin: appointment.precheckins[0] ?? null
  };
}

export async function confirmPublicAppointment(input: { confirmationToken: string }) {
  const appointment = await prisma.appointment.findUnique({
    where: {
      confirmationToken: input.confirmationToken
    }
  });

  if (!appointment) {
    throw new PublicBookingServiceError("Appointment not found.", 404);
  }

  if (appointment.status === AppointmentStatus.CANCELLED) {
    throw new PublicBookingServiceError("Cancelled appointments cannot be confirmed.", 409);
  }

  const updated = await prisma.appointment.update({
    where: {
      id: appointment.id
    },
    data: {
      status: AppointmentStatus.CONFIRMED,
      confirmedAt: appointment.confirmedAt ?? new Date()
    }
  });

  await writeAuditLog({
    entityType: "Appointment",
    entityId: appointment.id,
    action: "public-booking.appointment-confirmed",
    source: "public-booking-service"
  });

  return updated;
}

export async function cancelPublicAppointment(input: {
  confirmationToken: string;
  reason?: string;
}) {
  const appointment = await prisma.appointment.findUnique({
    where: {
      confirmationToken: input.confirmationToken
    }
  });

  if (!appointment) {
    throw new PublicBookingServiceError("Appointment not found.", 404);
  }

  const updated = await prisma.appointment.update({
    where: {
      id: appointment.id
    },
    data: {
      status: AppointmentStatus.CANCELLED,
      cancelledAt: new Date(),
      cancellationReason: input.reason?.trim()
    }
  });

  await writeAuditLog({
    entityType: "Appointment",
    entityId: appointment.id,
    action: "public-booking.appointment-cancelled",
    source: "public-booking-service"
  });

  return updated;
}

export async function submitPrecheckin(input: {
  confirmationToken: string;
  responses: Record<string, unknown>;
}) {
  const jsonResponses = input.responses as Prisma.InputJsonValue;
  const appointment = await prisma.appointment.findUnique({
    where: {
      confirmationToken: input.confirmationToken
    }
  });

  if (!appointment) {
    throw new PublicBookingServiceError("Appointment not found.", 404);
  }

  const existing = await prisma.precheckinSubmission.findFirst({
    where: {
      appointmentId: appointment.id,
      patientId: appointment.patientId
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (existing) {
    return prisma.precheckinSubmission.update({
      where: {
        id: existing.id
      },
      data: {
        status: PrecheckinStatus.SUBMITTED,
        responses: jsonResponses,
        submittedAt: new Date()
      }
    });
  }

  return prisma.precheckinSubmission.create({
    data: {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      status: PrecheckinStatus.SUBMITTED,
      responses: jsonResponses,
      submittedAt: new Date()
    }
  });
}

export async function listDoctorAppointments(doctorUserId: string) {
  return prisma.appointment.findMany({
    where: {
      doctorId: doctorUserId
    },
    include: {
      patient: true,
      service: true
    },
    orderBy: {
      scheduledStart: "asc"
    }
  });
}
