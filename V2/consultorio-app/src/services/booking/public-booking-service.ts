import {
  AppointmentSource,
  AppointmentStatus,
  HoldStatus,
  LegalDocumentType,
  NotificationKind,
  PatientStatus,
  PrecheckinKind,
  PrecheckinStatus
} from "@prisma/client";
import { Prisma } from "@prisma/client";

import { env } from "../../lib/env";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { generateOpaqueToken } from "../../lib/security/token";
import { writeAuditLog } from "../../lib/audit";
import {
  addDaysToLocalDate,
  formatLocalDate,
  getLocalDayOfWeek,
  getLocalDate,
  localDateTimeToUtc,
  parseLocalDate,
  type LocalDate
} from "../../lib/timezone";
import { emitSyncEvent, getActiveDeviceDocumentKey } from "../sync/sync-service";
import { queueNotification } from "../notifications/notification-service";

const HOLD_TTL_MS = 1000 * 60 * 10;
const SLOT_TAKEN_MESSAGE = "El horario seleccionado ya no esta disponible.";

/** Prisma error code for serialization failures (serializable tx aborted). */
const SERIALIZATION_FAILURE = "P2034";

type SlotRecord = {
  slotStart: string;
  slotEnd: string;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
};

class PublicBookingServiceError extends ServiceError {}

function isSerializationFailure(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === SERIALIZATION_FAILURE
  );
}

/**
 * Runs a serializable transaction, retrying on serialization aborts (P2034).
 * Postgres can abort serializable transactions even without a real slot
 * conflict; the retry re-runs the inner conflict check, which is what decides
 * the genuine 409.
 */
async function runSerializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const maxAttempts = 3;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (isSerializationFailure(error) && attempt < maxAttempts) {
        continue;
      }
      if (isSerializationFailure(error)) {
        throw new PublicBookingServiceError(SLOT_TAKEN_MESSAGE, 409);
      }
      throw error;
    }
  }
}

/** Mayoria de edad legal en Mexico: por debajo, los derechos los ejerce un tutor. */
const MINOR_AGE_THRESHOLD = 18;

/**
 * `true` si la fecha de nacimiento ("YYYY-MM-DD") corresponde a un menor de edad.
 * Fechas vacias o invalidas no se consideran menores (no se puede afirmar).
 */
function isMinor(birthDate?: string): boolean {
  if (!birthDate) {
    return false;
  }
  const dob = new Date(`${birthDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) {
    return false;
  }
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDay = now.getUTCMonth() * 100 + now.getUTCDate();
  const dobMonthDay = dob.getUTCMonth() * 100 + dob.getUTCDate();
  if (monthDay < dobMonthDay) {
    age -= 1;
  }
  return age >= 0 && age < MINOR_AGE_THRESHOLD;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function subtractHours(date: Date, hours: number) {
  return new Date(date.getTime() - hours * 3_600_000);
}

function sameLocalDate(left: LocalDate, right: LocalDate) {
  return left.year === right.year && left.month === right.month && left.day === right.day;
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

function getRuleSlots(input: {
  date: LocalDate;
  timeZone: string;
  ruleStartTime: string;
  ruleEndTime: string;
  slotInterval: number;
  durationMinutes: number;
  minAdvanceHours?: number | null;
  maxAdvanceDays?: number | null;
}) {
  // Las horas "de pared" de la regla se anclan a la fecha local del medico y
  // se convierten a instantes UTC (respetando horario de verano).
  const ruleStart = localDateTimeToUtc(input.date, input.ruleStartTime, input.timeZone);
  const ruleEnd = localDateTimeToUtc(input.date, input.ruleEndTime, input.timeZone);
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
  /**
   * Token de un hold propio del paciente a ignorar al calcular cupo: su propia
   * reserva temporal no debe bloquearle su vista al cambiar de horario dentro de
   * la misma sesion.
   */
  ignoreHoldToken?: string;
}) {
  const profile = await getPublicDoctorOrThrow(input.slug);
  const service = profile.services.find((item) => item.id === input.serviceId);

  if (!service) {
    throw new PublicBookingServiceError("Service not found for this doctor.", 404);
  }

  const timeZone = profile.timeZone;
  const fromLocalDate = parseLocalDate(input.dateFrom);

  if (!fromLocalDate) {
    throw new PublicBookingServiceError("Invalid start date.");
  }

  const days = Math.min(Math.max(input.days ?? 7, 1), 31);
  // La ventana [dateFrom, until) se ancla a medianoche local del medico, no UTC.
  const dateFrom = localDateTimeToUtc(fromLocalDate, "00:00", timeZone);
  const until = localDateTimeToUtc(addDaysToLocalDate(fromLocalDate, days), "00:00", timeZone);

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
        },
        // El propio hold del paciente no bloquea su vista (cambio de horario).
        ...(input.ignoreHoldToken ? { token: { not: input.ignoreHoldToken } } : {})
      },
      select: {
        slotStart: true,
        slotEnd: true
      }
    })
  ]);

  const slots: SlotRecord[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const date = addDaysToLocalDate(fromLocalDate, dayOffset);
    const dayOfWeek = getLocalDayOfWeek(date);
    const matchingRules = profile.availabilityRules.filter((rule) => {
      if (rule.ruleType === "DATE_OVERRIDE" && rule.specificDate) {
        // specificDate se almacena como fecha de calendario (medianoche UTC).
        return sameLocalDate(getLocalDate(rule.specificDate, "UTC"), date);
      }

      return rule.ruleType === "WEEKLY" && rule.dayOfWeek === dayOfWeek;
    });

    for (const rule of matchingRules) {
      const ruleSlots = getRuleSlots({
        date,
        timeZone,
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
      professionalName: profile.professionalName,
      timeZone
    },
    service: {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes
    },
    slots
  };
}

/**
 * Fechas locales del medico (YYYY-MM-DD) con al menos un horario disponible en
 * la ventana [dateFrom, dateFrom+days). Reusa el computo real de slots (reglas,
 * excepciones, citas, holds y limites de anticipacion) y agrupa por la fecha
 * local del medico, no por UTC. Alimenta el calendario publico para deshabilitar
 * los dias sin cupo en vez de mostrarlos como disponibles vacios.
 */
export async function listAvailableDays(input: {
  slug: string;
  serviceId: string;
  dateFrom: string;
  days?: number;
}) {
  const availability = await listPublicAvailability({
    slug: input.slug,
    serviceId: input.serviceId,
    dateFrom: input.dateFrom,
    days: input.days ?? 31
  });

  const timeZone = availability.doctor.timeZone;
  const availableDates = new Set<string>();

  for (const slot of availability.slots) {
    availableDates.add(formatLocalDate(getLocalDate(new Date(slot.slotStart), timeZone)));
  }

  return {
    doctor: availability.doctor,
    service: availability.service,
    days: [...availableDates].sort()
  };
}

export async function createAppointmentHold(input: {
  slug: string;
  serviceId: string;
  slotStart: string;
  /**
   * Hold previo del paciente en la misma sesion: se libera antes de tomar el
   * nuevo para que cambiar de horario no se bloquee a si mismo.
   */
  previousHoldToken?: string;
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

  // La fecha de busqueda es la fecha local del medico para ese instante. El
  // hold previo de la sesion no debe contar como ocupado al validar el nuevo.
  const availability = await listPublicAvailability({
    slug: input.slug,
    serviceId: input.serviceId,
    dateFrom: formatLocalDate(getLocalDate(slotStart, profile.timeZone)),
    days: 1,
    ignoreHoldToken: input.previousHoldToken
  });

  const slotIsAvailable = availability.slots.some((slot) => slot.slotStart === slotStart.toISOString());

  if (!slotIsAvailable) {
    throw new PublicBookingServiceError(SLOT_TAKEN_MESSAGE, 409);
  }

  const token = generateOpaqueToken(20);

  // Transaccion serializable: dos pacientes pidiendo el mismo horario a la
  // vez no pueden crear dos holds activos.
  const hold = await runSerializable(async (tx) => {
    // Liberar el hold previo de la sesion primero: deja libre su horario y evita
    // que aparezca como conflicto al tomar el nuevo.
    if (input.previousHoldToken) {
      await tx.appointmentHold.updateMany({
        where: {
          doctorId: profile.userId,
          token: input.previousHoldToken,
          status: HoldStatus.ACTIVE
        },
        data: {
          status: HoldStatus.RELEASED,
          releasedAt: new Date()
        }
      });
    }

    const conflictingHold = await tx.appointmentHold.findFirst({
          where: {
            doctorId: profile.userId,
            status: HoldStatus.ACTIVE,
            expiresAt: { gt: new Date() },
            slotStart: { lt: slotEnd },
            slotEnd: { gt: slotStart }
          },
          select: { id: true }
        });

        const conflictingAppointment = await tx.appointment.findFirst({
          where: {
            doctorId: profile.userId,
            status: { not: AppointmentStatus.CANCELLED },
            scheduledStart: { lt: slotEnd },
            scheduledEnd: { gt: slotStart }
          },
          select: { id: true }
        });

        if (conflictingHold || conflictingAppointment) {
          throw new PublicBookingServiceError(SLOT_TAKEN_MESSAGE, 409);
        }

    return tx.appointmentHold.create({
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
  contact?: {
    phone?: string;
    email?: string;
  };
}) {
  const firstName = input.patient.firstName.trim();
  const lastName = input.patient.lastName.trim();
  const email = input.patient.email?.trim().toLowerCase();
  const phone = input.patient.phone?.trim();
  const guardianEmail = input.contact?.email?.trim().toLowerCase();
  const guardianPhone = input.contact?.phone?.trim();

  // Solo se reutiliza un expediente cuando coincide el NOMBRE. El telefono y el
  // correo por si solos no identifican al paciente: pueden ser de un tutor que
  // agenda para un hijo o un adulto mayor (mismo criterio anti-duplicados de la
  // app del medico: el nombre pesa mas que el contacto). Asi, un nombre distinto
  // con el contacto del tutor ya no devuelve al paciente del tutor.
  //
  // El contacto que confirma la identidad puede ser el propio del paciente o,
  // para un menor sin contacto propio, el de su responsable (PatientContact).
  const candidates = await prisma.patient.findMany({
    where: {
      ownerDoctorId: input.doctorId,
      firstName: { equals: firstName, mode: "insensitive" },
      lastName: { equals: lastName, mode: "insensitive" }
    },
    include: {
      contacts: { where: { isPrimary: true }, take: 1 }
    }
  });

  const existingPatient = candidates.find((candidate) => {
    if (email && candidate.email === email) {
      return true;
    }
    if (phone && candidate.phone === phone) {
      return true;
    }
    const primaryContact = candidate.contacts[0];
    if (primaryContact) {
      if (guardianEmail && primaryContact.email === guardianEmail) {
        return true;
      }
      if (guardianPhone && primaryContact.phone === guardianPhone) {
        return true;
      }
    }
    return false;
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

  // Paciente nuevo. El correo es unico por medico (`@@unique([ownerDoctorId,
  // email])`): si ya pertenece a OTRO paciente (un tutor que agenda para varias
  // personas), no se asigna a este paciente — el correo es del tutor (contacto),
  // no del paciente. El telefono no es unico y puede compartirse. Las
  // notificaciones de esta cita usan de todos modos el contacto capturado.
  let patientEmail = email ?? null;
  if (email) {
    const emailOwner = await prisma.patient.findFirst({
      where: { ownerDoctorId: input.doctorId, email },
      select: { id: true }
    });
    if (emailOwner) {
      patientEmail = null;
    }
  }

  return prisma.patient.create({
    data: {
      ownerDoctorId: input.doctorId,
      firstName,
      lastName,
      phone,
      email: patientEmail,
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

  // Un menor de edad (por su fecha de nacimiento) exige un responsable: sus
  // derechos los ejerce su tutor. La compuerta del paso 18 lo hace obligatorio
  // en el servidor, no solo en el formulario.
  if (isMinor(input.patient.birthDate) && !input.contact?.fullName?.trim()) {
    throw new PublicBookingServiceError(
      "Para agendar a un menor de edad se requieren los datos del responsable (tutor).",
      400
    );
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
    throw new PublicBookingServiceError("El apartado del horario expiro. Vuelve a elegir un horario.", 409);
  }

  const patient = await findOrCreatePatient({
    doctorId: hold.doctorId,
    patient: input.patient,
    contact: input.contact
  });

  const doctorProfileTz = await prisma.doctorProfile.findUnique({
    where: { userId: hold.doctorId },
    select: { timeZone: true }
  });

  const confirmationToken = generateOpaqueToken(18);

  // La verificacion de conflictos, la cita y la conversion del hold viajan
  // en una sola transaccion serializable: sin ventana para doble reserva.
  const appointment = await runSerializable(async (tx) => {
    const conflictingAppointment = await tx.appointment.findFirst({
      where: {
        doctorId: hold.doctorId,
        status: { not: AppointmentStatus.CANCELLED },
        scheduledStart: { lt: hold.slotEnd },
        scheduledEnd: { gt: hold.slotStart }
      },
      select: { id: true }
    });

    const otherActiveHold = await tx.appointmentHold.findFirst({
      where: {
        id: { not: hold.id },
        doctorId: hold.doctorId,
        status: HoldStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        slotStart: { lt: hold.slotEnd },
        slotEnd: { gt: hold.slotStart }
      },
      select: { id: true }
    });

    if (conflictingAppointment || otherActiveHold) {
      throw new PublicBookingServiceError(SLOT_TAKEN_MESSAGE, 409);
    }

    const created = await tx.appointment.create({
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
        timeZone: doctorProfileTz?.timeZone ?? "America/Chihuahua"
      }
    });

    await tx.appointmentHold.update({
      where: {
        id: hold.id
      },
      data: {
        status: HoldStatus.CONVERTED,
        appointmentId: created.id,
        patientId: patient.id
      }
    });

    return created;
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
    // Responsable (tutor) idempotente: una sola entrada primaria por paciente.
    // Reagendar o volver a agendar para el mismo paciente actualiza al
    // responsable en vez de duplicarlo.
    const contactData = {
      fullName: input.contact.fullName.trim(),
      relationship: input.contact.relationship?.trim(),
      phone: input.contact.phone?.trim(),
      email: input.contact.email?.trim().toLowerCase()
    };
    const existingContact = await prisma.patientContact.findFirst({
      where: { patientId: patient.id, isPrimary: true },
      select: { id: true }
    });
    if (existingContact) {
      await prisma.patientContact.update({
        where: { id: existingContact.id },
        data: contactData
      });
    } else {
      await prisma.patientContact.create({
        data: { patientId: patient.id, isPrimary: true, ...contactData }
      });
    }
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

  // Enlace de accion (confirmar/cancelar/reagendar) listo para SMS y correo.
  // Los enlaces cortos para SMS llegan en paso 7 sobre esta misma URL.
  const doctorProfile = await prisma.doctorProfile.findUnique({
    where: { userId: hold.doctorId },
    select: { publicSlug: true }
  });
  const appointmentUrl = `${env.APP_BASE_URL}/perfil/${doctorProfile?.publicSlug}/cita/${confirmationToken}`;
  // El recordatorio lleva un enlace que abre la cita con intencion de cancelar,
  // reusando el flujo de cancelacion existente. El enlace corto expira al inicio
  // de la cita; la cancelacion es de un solo efecto (no se puede cancelar dos
  // veces) en el servicio.
  const cancelUrl = `${appointmentUrl}?accion=cancelar`;
  const reminderAt = subtractHours(appointment.scheduledStart, 24);
  const reminderShouldQueue = reminderAt > new Date();
  const appointmentLabel = appointment.scheduledStart.toISOString();

  // Quien agenda (puede ser un tutor) recibe las notificaciones: se prefiere el
  // contacto propio del paciente, luego el del responsable, luego lo guardado.
  const notifyPhone =
    input.patient.phone?.trim() || input.contact?.phone?.trim() || patient.phone || null;
  const notifyEmail =
    input.patient.email?.trim().toLowerCase() ||
    input.contact?.email?.trim().toLowerCase() ||
    patient.email ||
    null;

  for (const contact of [
    notifyPhone ? { channel: "SMS" as const, destination: notifyPhone } : null,
    notifyEmail ? { channel: "EMAIL" as const, destination: notifyEmail } : null
  ]) {
    if (!contact) {
      continue;
    }

    await queueNotification({
      doctorId: hold.doctorId,
      patientId: patient.id,
      appointmentId: appointment.id,
      channel: contact.channel,
      kind: NotificationKind.APPOINTMENT_CONFIRMATION,
      destination: contact.destination,
      actionUrl: appointmentUrl,
      template: {
        patientFirstName: patient.firstName,
        appointmentLabel
      },
      metadata: {
        confirmationToken,
        appointmentUrl
      }
    });

    await queueNotification({
      doctorId: hold.doctorId,
      patientId: patient.id,
      appointmentId: appointment.id,
      channel: contact.channel,
      kind: NotificationKind.PRECHECKIN,
      destination: contact.destination,
      actionUrl: appointmentUrl,
      template: {
        patientFirstName: patient.firstName,
        appointmentLabel
      },
      metadata: {
        confirmationToken,
        appointmentUrl
      }
    });

    if (reminderShouldQueue) {
      await queueNotification({
        doctorId: hold.doctorId,
        patientId: patient.id,
        appointmentId: appointment.id,
        channel: contact.channel,
        kind: NotificationKind.APPOINTMENT_REMINDER,
        destination: contact.destination,
        scheduledFor: reminderAt,
        actionUrl: cancelUrl,
        shortLink: {
          expiresAt: appointment.scheduledStart
        },
        template: {
          patientFirstName: patient.firstName,
          appointmentLabel,
          expiresAt: appointment.scheduledStart
        },
        metadata: {
          confirmationToken,
          appointmentUrl,
          cancelUrl
        }
      });
    }
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

  // Responsable (tutor) que viaja a la app del medico como entidad propia, sin
  // mezclarse con la identidad del paciente. Solo CONTACTO, nunca clinico.
  const responsible = input.contact?.fullName?.trim()
    ? {
        name: input.contact.fullName.trim(),
        relationship: input.contact.relationship?.trim() || null,
        phone: input.contact.phone?.trim() || null,
        email: input.contact.email?.trim().toLowerCase() || null
      }
    : null;

  // Evento para la app del medico: datos de cita y contacto (no clinicos).
  await emitSyncEvent(hold.doctorId, "APPOINTMENT_BOOKED", {
    appointmentId: appointment.id,
    status: appointment.status,
    scheduledStart: appointment.scheduledStart.toISOString(),
    scheduledEnd: appointment.scheduledEnd.toISOString(),
    serviceName: hold.service?.name ?? null,
    reason: appointment.reason ?? null,
    patient: {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      // Fecha de nacimiento del paciente (la captura quien agenda para otra
      // persona/un menor); ayuda a distinguir identidad y a la app del medico.
      birthDate: patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : null,
      // Contacto de la cita (el del tutor si agendo para otra persona), para que
      // la app del medico tenga como ubicar/avisar, sin alterar la identidad.
      phone: notifyPhone,
      email: notifyEmail
    },
    // El responsable es entidad aparte: nombre, parentesco y su contacto.
    responsible
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

  // Llave publica del dispositivo del medico: el formulario de antecedentes la
  // usa para sellar (sealed box). Si no hay dispositivo vinculado, el portal NO
  // muestra el formulario (no se puede entregar de forma segura).
  const documentPublicKey = await getActiveDeviceDocumentKey(appointment.doctorId);

  return {
    appointment,
    patient: appointment.patient,
    service: appointment.service,
    precheckin: appointment.precheckins[0] ?? null,
    documentPublicKey
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

  if (
    appointment.status === AppointmentStatus.CANCELLED ||
    appointment.status === AppointmentStatus.COMPLETED
  ) {
    throw new PublicBookingServiceError("Esta cita ya no puede confirmarse.", 409);
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

  await emitSyncEvent(appointment.doctorId, "APPOINTMENT_CONFIRMED", {
    appointmentId: appointment.id,
    status: updated.status
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

  if (appointment.status === AppointmentStatus.COMPLETED) {
    throw new PublicBookingServiceError("Una cita ya atendida no puede cancelarse.", 409);
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

  await emitSyncEvent(appointment.doctorId, "APPOINTMENT_CANCELLED", {
    appointmentId: appointment.id,
    status: updated.status,
    cancellationReason: updated.cancellationReason ?? null
  });

  return updated;
}

export async function reschedulePublicAppointment(input: {
  confirmationToken: string;
  newSlotStart: string;
}) {
  const appointment = await prisma.appointment.findUnique({
    where: {
      confirmationToken: input.confirmationToken
    },
    include: {
      service: true
    }
  });

  if (!appointment) {
    throw new PublicBookingServiceError("Appointment not found.", 404);
  }

  if (
    appointment.status === AppointmentStatus.CANCELLED ||
    appointment.status === AppointmentStatus.COMPLETED
  ) {
    throw new PublicBookingServiceError("Esta cita ya no puede reagendarse.", 409);
  }

  const doctorProfile = await prisma.doctorProfile.findUnique({
    where: { userId: appointment.doctorId },
    select: { publicSlug: true, timeZone: true }
  });

  if (!doctorProfile || !appointment.serviceId) {
    throw new PublicBookingServiceError("La cita no permite reagendado en linea.", 409);
  }

  const newSlotStart = new Date(input.newSlotStart);

  if (Number.isNaN(newSlotStart.getTime())) {
    throw new PublicBookingServiceError("Invalid slot start.");
  }

  // El nuevo horario debe ser un slot publicamente ofertado (reglas, bloqueos
  // y anticipacion incluidos), no cualquier fecha arbitraria.
  const availability = await listPublicAvailability({
    slug: doctorProfile.publicSlug,
    serviceId: appointment.serviceId,
    dateFrom: formatLocalDate(getLocalDate(newSlotStart, doctorProfile.timeZone)),
    days: 1
  });

  const slotIsAvailable = availability.slots.some(
    (slot) => slot.slotStart === newSlotStart.toISOString()
  );

  if (!slotIsAvailable) {
    throw new PublicBookingServiceError(SLOT_TAKEN_MESSAGE, 409);
  }

  const durationMs = appointment.scheduledEnd.getTime() - appointment.scheduledStart.getTime();
  const newSlotEnd = new Date(newSlotStart.getTime() + durationMs);

  const updated = await runSerializable(async (tx) => {
    const conflictingAppointment = await tx.appointment.findFirst({
      where: {
        id: { not: appointment.id },
        doctorId: appointment.doctorId,
        status: { not: AppointmentStatus.CANCELLED },
        scheduledStart: { lt: newSlotEnd },
        scheduledEnd: { gt: newSlotStart }
      },
      select: { id: true }
    });

    const conflictingHold = await tx.appointmentHold.findFirst({
      where: {
        doctorId: appointment.doctorId,
        status: HoldStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        slotStart: { lt: newSlotEnd },
        slotEnd: { gt: newSlotStart }
      },
      select: { id: true }
    });

    if (conflictingAppointment || conflictingHold) {
      throw new PublicBookingServiceError(SLOT_TAKEN_MESSAGE, 409);
    }

    return tx.appointment.update({
      where: { id: appointment.id },
      data: {
        scheduledStart: newSlotStart,
        scheduledEnd: newSlotEnd,
        // La cita reagendada vuelve a requerir confirmacion del paciente.
        status: AppointmentStatus.PENDING,
        confirmedAt: null
      }
    });
  });

  await writeAuditLog({
    entityType: "Appointment",
    entityId: appointment.id,
    action: "public-booking.appointment-rescheduled",
    source: "public-booking-service",
    metadata: {
      previousStart: appointment.scheduledStart.toISOString(),
      newStart: newSlotStart.toISOString()
    }
  });

  await emitSyncEvent(appointment.doctorId, "APPOINTMENT_RESCHEDULED", {
    appointmentId: appointment.id,
    status: updated.status,
    scheduledStart: updated.scheduledStart.toISOString(),
    scheduledEnd: updated.scheduledEnd.toISOString()
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

  const submission = existing
    ? await prisma.precheckinSubmission.update({
        where: {
          id: existing.id
        },
        data: {
          status: PrecheckinStatus.SUBMITTED,
          responses: jsonResponses,
          submittedAt: new Date()
        }
      })
    : await prisma.precheckinSubmission.create({
        data: {
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          status: PrecheckinStatus.SUBMITTED,
          responses: jsonResponses,
          submittedAt: new Date()
        }
      });

  // CLINICO en transito: este payload se purga del buzon tras el ACK.
  await emitSyncEvent(appointment.doctorId, "PRECHECKIN_SUBMITTED", {
    appointmentId: appointment.id,
    precheckinId: submission.id,
    responses: jsonResponses
  });

  return submission;
}

/** Tope del sealed box clinico (~1.4x el JSON en claro tras base64). */
const SEALED_PRECHECKIN_CIPHERTEXT_MAX_BYTES = 64 * 1024;

/**
 * Guarda contenido clinico del paciente como sealed box (X25519) y emite el
 * evento de sync SIN contenido en claro. La nube nunca ve las respuestas: solo
 * el `ciphertext`, que la app del medico descarga, descifra y purga (paso 19,
 * rebanadas 7 y 8). Mismo patron que los documentos del buzon (paso 6).
 */
async function submitSealedPrecheckin(input: {
  confirmationToken: string;
  ciphertext: string;
  kind: typeof PrecheckinKind.MEDICAL_HISTORY | typeof PrecheckinKind.AI_PRECONSULTA;
  invalidMessage: string;
  noDeviceMessage: string;
}) {
  const sealed = Buffer.from(input.ciphertext, "base64");
  if (sealed.length === 0 || sealed.length > SEALED_PRECHECKIN_CIPHERTEXT_MAX_BYTES) {
    throw new PublicBookingServiceError(input.invalidMessage, 400);
  }

  const appointment = await prisma.appointment.findUnique({
    where: { confirmationToken: input.confirmationToken }
  });

  if (!appointment) {
    throw new PublicBookingServiceError("Appointment not found.", 404);
  }

  // Sin dispositivo vinculado no se puede entregar de forma segura: rechazar
  // (el portal ya oculta el formulario, esto cubre el envio directo a la API).
  const deviceKey = await getActiveDeviceDocumentKey(appointment.doctorId);
  if (!deviceKey) {
    throw new PublicBookingServiceError(input.noDeviceMessage, 409);
  }

  const existing = await prisma.precheckinSubmission.findFirst({
    where: {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      kind: input.kind
    },
    orderBy: { createdAt: "desc" }
  });

  // CLINICO: `responses` queda nulo; el contenido vive solo en `ciphertext`.
  const data = {
    status: PrecheckinStatus.SUBMITTED,
    kind: input.kind,
    responses: Prisma.DbNull,
    ciphertext: sealed,
    sizeBytes: sealed.length,
    deliveredAt: null,
    purgedAt: null,
    submittedAt: new Date()
  };

  const submission = existing
    ? await prisma.precheckinSubmission.update({ where: { id: existing.id }, data })
    : await prisma.precheckinSubmission.create({
        data: {
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          ...data
        }
      });

  // El evento NO lleva respuestas: solo el id para que la app descargue el
  // sealed box. La nube no puede leer el contenido.
  await emitSyncEvent(appointment.doctorId, "PRECHECKIN_SUBMITTED", {
    appointmentId: appointment.id,
    precheckinId: submission.id,
    sealed: true
  });

  return { id: submission.id };
}

/** Antecedentes (historia clinica) sellados E2E (paso 19, rebanada 7). */
export async function submitMedicalHistory(input: { confirmationToken: string; ciphertext: string }) {
  return submitSealedPrecheckin({
    confirmationToken: input.confirmationToken,
    ciphertext: input.ciphertext,
    kind: PrecheckinKind.MEDICAL_HISTORY,
    invalidMessage: "Contenido de antecedentes invalido.",
    noDeviceMessage: "El consultorio aun no puede recibir antecedentes de forma segura."
  });
}

/** Resultado de la preconsulta guiada por IA, sellado E2E (paso 19, rebanada 8). */
export async function submitAiPreconsulta(input: { confirmationToken: string; ciphertext: string }) {
  return submitSealedPrecheckin({
    confirmationToken: input.confirmationToken,
    ciphertext: input.ciphertext,
    kind: PrecheckinKind.AI_PRECONSULTA,
    invalidMessage: "Contenido de preconsulta invalido.",
    noDeviceMessage: "El consultorio aun no puede recibir la preconsulta de forma segura."
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
