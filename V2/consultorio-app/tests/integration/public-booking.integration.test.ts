import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClinicalProfile, HoldStatus, PrismaClient } from "@prisma/client";

import { createDoctorAccount, createDoctorSubscription } from "../../src/services/auth/auth-service";
import {
  bookPublicAppointment,
  cancelPublicAppointment,
  confirmPublicAppointment,
  createAppointmentHold,
  getPublicAppointmentByToken,
  listPublicAvailability,
  reschedulePublicAppointment,
  submitPrecheckin
} from "../../src/services/booking/public-booking-service";
import {
  createAvailabilityRule,
  createDoctorService,
  updateDoctorProfile
} from "../../src/services/doctor/doctor-profile-service";

const prisma = new PrismaClient();

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

function uniqueSlug(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

function nextWeekdayDate(targetDay: number) {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let diff = (targetDay - date.getUTCDay() + 7) % 7;

  if (diff === 0) {
    diff = 7;
  }

  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

async function cleanupUserByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      doctorProfile: true
    }
  });

  if (!user) {
    return;
  }

  if (user.doctorProfile) {
    await prisma.doctorSubscription.deleteMany({
      where: {
        doctorProfileId: user.doctorProfile.id
      }
    });
  }

  await prisma.appointment.deleteMany({
    where: {
      doctorId: user.id
    }
  });

  await prisma.appointmentHold.deleteMany({
    where: {
      doctorId: user.id
    }
  });

  await prisma.patient.deleteMany({
    where: {
      ownerDoctorId: user.id
    }
  });

  await prisma.user.delete({
    where: {
      id: user.id
    }
  });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("public booking flow", () => {
  it("lists slots, creates a hold, books, confirms, and stores precheckin", async () => {
    const email = uniqueEmail("doctor-booking");
    const slug = uniqueSlug("dra-booking");
    const slotDate = nextWeekdayDate(2);
    const dateFrom = slotDate.toISOString().slice(0, 10);

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Lucia",
        lastName: "Campos",
        phone: "6140000300",
        professionalName: "Dra. Lucia Campos",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await createDoctorSubscription({
        doctorUserId: account.user.id,
        planCode: "ESSENTIAL"
      });

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        professionalName: "Dra. Lucia Campos",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        isPublic: true
      });

      const service = await createDoctorService(account.user.id, {
        name: "Consulta general",
        priceCents: 90000,
        durationMinutes: 30
      });

      await createAvailabilityRule(account.user.id, {
        dayOfWeek: slotDate.getUTCDay(),
        startTime: "09:00",
        endTime: "11:00",
        slotInterval: 30,
        minAdvanceHours: 1,
        maxAdvanceDays: 30
      });

      const availability = await listPublicAvailability({
        slug,
        serviceId: service.id,
        dateFrom,
        days: 1
      });

      expect(availability.slots.length).toBeGreaterThan(0);

      const hold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[0]!.slotStart
      });

      expect(hold.status).toBe(HoldStatus.ACTIVE);

      const appointment = await bookPublicAppointment({
        holdToken: hold.token,
        patient: {
          firstName: "Mario",
          lastName: "Lopez",
          phone: "6141234567",
          email: uniqueEmail("patient-booking")
        },
        reason: "Control anual",
        legal: {
          acceptedTerms: true,
          acceptedPrivacy: true,
          ipAddress: "127.0.0.1",
          userAgent: "vitest"
        }
      });

      expect(appointment.appointment.status).toBe("PENDING");

      await confirmPublicAppointment({
        confirmationToken: appointment.confirmationToken
      });

      await submitPrecheckin({
        confirmationToken: appointment.confirmationToken,
        responses: {
          chiefComplaint: "Dolor de cabeza",
          currentMedications: ["Paracetamol"]
        }
      });

      const details = await getPublicAppointmentByToken(appointment.confirmationToken);

      expect(details?.appointment.status).toBe("CONFIRMED");
      expect(details?.precheckin?.status).toBe("SUBMITTED");
      expect(details?.patient.firstName).toBe("Mario");
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("prevents double booking for the same slot and reuses the patient by doctor/email", async () => {
    const email = uniqueEmail("doctor-conflict");
    const slug = uniqueSlug("dra-conflict");
    const patientEmail = uniqueEmail("patient-conflict");
    const slotDate = nextWeekdayDate(3);
    const dateFrom = slotDate.toISOString().slice(0, 10);

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Nora",
        lastName: "Castro",
        phone: "6140000301",
        professionalName: "Dra. Nora Castro",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await createDoctorSubscription({
        doctorUserId: account.user.id,
        planCode: "ESSENTIAL"
      });

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        professionalName: "Dra. Nora Castro",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        isPublic: true
      });

      const service = await createDoctorService(account.user.id, {
        name: "Consulta seguimiento",
        priceCents: 75000,
        durationMinutes: 30
      });

      await createAvailabilityRule(account.user.id, {
        dayOfWeek: slotDate.getUTCDay(),
        startTime: "10:00",
        endTime: "11:00",
        slotInterval: 30
      });

      const availability = await listPublicAvailability({
        slug,
        serviceId: service.id,
        dateFrom,
        days: 1
      });

      const holdA = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[0]!.slotStart
      });

      const first = await bookPublicAppointment({
        holdToken: holdA.token,
        patient: {
          firstName: "Rebeca",
          lastName: "Luna",
          phone: "6149990000",
          email: patientEmail
        },
        legal: {
          acceptedTerms: true,
          acceptedPrivacy: true
        }
      });

      await expect(
        createAppointmentHold({
          slug,
          serviceId: service.id,
          slotStart: availability.slots[0]!.slotStart
        })
      ).rejects.toThrow(/disponible/i);

      const otherHold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[1]!.slotStart
      });

      const second = await bookPublicAppointment({
        holdToken: otherHold.token,
        patient: {
          firstName: "Rebeca",
          lastName: "Luna",
          phone: "6149990001",
          email: patientEmail
        },
        legal: {
          acceptedTerms: true,
          acceptedPrivacy: true
        }
      });

      expect(first.patient.id).toBe(second.patient.id);

      await cancelPublicAppointment({
        confirmationToken: second.confirmationToken,
        reason: "Cambio de planes"
      });

      const cancelled = await getPublicAppointmentByToken(second.confirmationToken);
      expect(cancelled?.appointment.status).toBe("CANCELLED");
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("books a different person with a guardian's contact as a new patient, not the guardian", async () => {
    const email = uniqueEmail("doctor-guardian");
    const slug = uniqueSlug("dra-guardian");
    const guardianEmail = uniqueEmail("tutor-shared");
    const guardianPhone = "6147770000";
    const slotDate = nextWeekdayDate(4);
    const dateFrom = slotDate.toISOString().slice(0, 10);

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Olivia",
        lastName: "Reyes",
        phone: "6140000401",
        professionalName: "Dra. Olivia Reyes",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await createDoctorSubscription({ doctorUserId: account.user.id, planCode: "ESSENTIAL" });

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        professionalName: "Dra. Olivia Reyes",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        isPublic: true
      });

      const service = await createDoctorService(account.user.id, {
        name: "Consulta general",
        priceCents: 60000,
        durationMinutes: 30
      });

      await createAvailabilityRule(account.user.id, {
        dayOfWeek: slotDate.getUTCDay(),
        startTime: "09:00",
        endTime: "10:00",
        slotInterval: 30
      });

      const availability = await listPublicAvailability({ slug, serviceId: service.id, dateFrom, days: 1 });

      // El tutor agenda primero para si mismo con su contacto.
      const guardianHold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[0]!.slotStart
      });
      const guardianBooking = await bookPublicAppointment({
        holdToken: guardianHold.token,
        patient: { firstName: "Marta", lastName: "Tutora", phone: guardianPhone, email: guardianEmail },
        legal: { acceptedTerms: true, acceptedPrivacy: true }
      });

      // Ahora agenda para su hijo: NOMBRE distinto, MISMO telefono y correo.
      const childHold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[1]!.slotStart
      });
      const childBooking = await bookPublicAppointment({
        holdToken: childHold.token,
        patient: { firstName: "Diego", lastName: "Tutora", phone: guardianPhone, email: guardianEmail },
        legal: { acceptedTerms: true, acceptedPrivacy: true }
      });

      // No se reutiliza el expediente del tutor: es un paciente nuevo.
      expect(childBooking.patient.id).not.toBe(guardianBooking.patient.id);
      expect(childBooking.patient.firstName).toBe("Diego");
      // El correo del tutor (unico por medico) NO se asigna al hijo.
      expect(childBooking.patient.email).toBeNull();

      // La confirmacion muestra al hijo, no al tutor.
      const details = await getPublicAppointmentByToken(childBooking.confirmationToken);
      expect(details?.patient.firstName).toBe("Diego");
      expect(details?.patient.lastName).toBe("Tutora");
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("captures the guardian as a contact for a minor and updates it on re-booking", async () => {
    const email = uniqueEmail("doctor-minor");
    const slug = uniqueSlug("dra-minor");
    const guardianEmail = uniqueEmail("responsable");
    const slotDate = nextWeekdayDate(5);
    const dateFrom = slotDate.toISOString().slice(0, 10);

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Paula",
        lastName: "Mena",
        phone: "6140000501",
        professionalName: "Dra. Paula Mena",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await createDoctorSubscription({ doctorUserId: account.user.id, planCode: "ESSENTIAL" });

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        professionalName: "Dra. Paula Mena",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        isPublic: true
      });

      const service = await createDoctorService(account.user.id, {
        name: "Consulta pediatrica",
        priceCents: 50000,
        durationMinutes: 30
      });

      await createAvailabilityRule(account.user.id, {
        dayOfWeek: slotDate.getUTCDay(),
        startTime: "11:00",
        endTime: "12:00",
        slotInterval: 30
      });

      const availability = await listPublicAvailability({ slug, serviceId: service.id, dateFrom, days: 1 });

      // Agenda para un menor: paciente con fecha de nacimiento, contacto del tutor.
      const firstHold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[0]!.slotStart
      });
      const booking = await bookPublicAppointment({
        holdToken: firstHold.token,
        patient: { firstName: "Mateo", lastName: "Rios", birthDate: "2018-05-10" },
        contact: { fullName: "Marta Rios", relationship: "Madre", phone: "6147770000", email: guardianEmail },
        legal: { acceptedTerms: true, acceptedPrivacy: true }
      });

      // El paciente es el menor (con fecha de nacimiento), no el tutor.
      expect(booking.patient.firstName).toBe("Mateo");
      expect(booking.patient.birthDate).not.toBeNull();
      expect(booking.patient.email).toBeNull();

      // El evento de sync lleva al responsable como entidad propia (paso 18,
      // rebanada 2): la app del medico lo conserva sin mezclarlo con el paciente.
      const bookedEvents = await prisma.syncEvent.findMany({
        where: { doctorId: account.user.id, type: "APPOINTMENT_BOOKED" }
      });
      const payload = bookedEvents
        .map((event) => event.payload as {
          appointmentId: string;
          patient: { firstName: string; birthDate: string | null; email: string | null };
          responsible: { name: string; relationship: string | null; email: string | null } | null;
        })
        .find((p) => p.appointmentId === booking.appointment.id)!;
      expect(payload.patient.firstName).toBe("Mateo");
      expect(payload.patient.birthDate).toBe("2018-05-10");
      expect(payload.responsible?.name).toBe("Marta Rios");
      expect(payload.responsible?.relationship).toBe("Madre");
      expect(payload.responsible?.email).toBe(guardianEmail);

      // El responsable queda como contacto primario del paciente.
      const contacts = await prisma.patientContact.findMany({ where: { patientId: booking.patient.id } });
      expect(contacts).toHaveLength(1);
      expect(contacts[0]!.fullName).toBe("Marta Rios");
      expect(contacts[0]!.relationship).toBe("Madre");
      expect(contacts[0]!.isPrimary).toBe(true);

      // Reagendar para el mismo menor ACTUALIZA al responsable, no lo duplica.
      const secondHold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[1]!.slotStart
      });
      const rebooking = await bookPublicAppointment({
        holdToken: secondHold.token,
        patient: { firstName: "Mateo", lastName: "Rios", birthDate: "2018-05-10" },
        contact: { fullName: "Marta Rios", relationship: "Tutora", phone: "6147770000", email: guardianEmail },
        legal: { acceptedTerms: true, acceptedPrivacy: true }
      });

      expect(rebooking.patient.id).toBe(booking.patient.id);
      const afterRebooking = await prisma.patientContact.findMany({ where: { patientId: booking.patient.id } });
      expect(afterRebooking).toHaveLength(1);
      expect(afterRebooking[0]!.relationship).toBe("Tutora");
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("only lets one of two concurrent holds win the same slot", async () => {
    const email = uniqueEmail("doctor-race");
    const slug = uniqueSlug("dra-race");
    const slotDate = nextWeekdayDate(4);
    const dateFrom = slotDate.toISOString().slice(0, 10);

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Carmen",
        lastName: "Rios",
        professionalName: "Dra. Carmen Rios",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        isPublic: true
      });

      const service = await createDoctorService(account.user.id, {
        name: "Consulta",
        priceCents: 50000,
        durationMinutes: 30
      });

      await createAvailabilityRule(account.user.id, {
        dayOfWeek: slotDate.getUTCDay(),
        startTime: "09:00",
        endTime: "10:00",
        slotInterval: 30
      });

      const availability = await listPublicAvailability({
        slug,
        serviceId: service.id,
        dateFrom,
        days: 1
      });
      const slotStart = availability.slots[0]!.slotStart;

      const results = await Promise.allSettled([
        createAppointmentHold({ slug, serviceId: service.id, slotStart }),
        createAppointmentHold({ slug, serviceId: service.id, slotStart })
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("reschedules with re-confirmation, blocks taken slots and completed cancellations, and queues an action link", async () => {
    const email = uniqueEmail("doctor-reschedule");
    const slug = uniqueSlug("dr-reschedule");
    const slotDate = nextWeekdayDate(5);
    const dateFrom = slotDate.toISOString().slice(0, 10);

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Pedro",
        lastName: "Galvan",
        professionalName: "Dr. Pedro Galvan",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        isPublic: true
      });

      const service = await createDoctorService(account.user.id, {
        name: "Consulta",
        priceCents: 60000,
        durationMinutes: 30
      });

      await createAvailabilityRule(account.user.id, {
        dayOfWeek: slotDate.getUTCDay(),
        startTime: "09:00",
        endTime: "11:00",
        slotInterval: 30
      });

      const availability = await listPublicAvailability({
        slug,
        serviceId: service.id,
        dateFrom,
        days: 1
      });

      const hold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[0]!.slotStart
      });

      const booking = await bookPublicAppointment({
        holdToken: hold.token,
        patient: {
          firstName: "Sofia",
          lastName: "Trejo",
          phone: "6145550000"
        },
        legal: { acceptedTerms: true, acceptedPrivacy: true }
      });

      // El SMS encolado usa enlace corto hacia la accion publica.
      const queuedSms = await prisma.notification.findFirst({
        where: {
          appointmentId: booking.appointment.id,
          channel: "SMS",
          kind: "APPOINTMENT_CONFIRMATION"
        }
      });
      expect(queuedSms?.body).toContain("/s/");
      expect(queuedSms?.shortLinkId).toBeTruthy();

      await confirmPublicAppointment({ confirmationToken: booking.confirmationToken });

      // Reagendar a otro horario disponible: vuelve a PENDING.
      const rescheduled = await reschedulePublicAppointment({
        confirmationToken: booking.confirmationToken,
        newSlotStart: availability.slots[2]!.slotStart
      });

      expect(rescheduled.status).toBe("PENDING");
      expect(rescheduled.scheduledStart.toISOString()).toBe(availability.slots[2]!.slotStart);

      // Un segundo paciente ocupa otro horario; reagendar encima debe fallar.
      const blockingHold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[1]!.slotStart
      });
      await bookPublicAppointment({
        holdToken: blockingHold.token,
        patient: { firstName: "Ana", lastName: "Vidal", phone: "6145550001" },
        legal: { acceptedTerms: true, acceptedPrivacy: true }
      });

      await expect(
        reschedulePublicAppointment({
          confirmationToken: booking.confirmationToken,
          newSlotStart: availability.slots[1]!.slotStart
        })
      ).rejects.toMatchObject({ status: 409 });

      // Una cita atendida no puede cancelarse ni reagendarse.
      await prisma.appointment.update({
        where: { id: booking.appointment.id },
        data: { status: "COMPLETED" }
      });

      await expect(
        cancelPublicAppointment({ confirmationToken: booking.confirmationToken })
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        reschedulePublicAppointment({
          confirmationToken: booking.confirmationToken,
          newSlotStart: availability.slots[3]!.slotStart
        })
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("interprets availability rule times in the doctor's timezone (fixed offset)", async () => {
    const email = uniqueEmail("doctor-tz");
    const slug = uniqueSlug("dra-tz");
    const slotDate = nextWeekdayDate(2);
    const dateFrom = slotDate.toISOString().slice(0, 10);

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Elena",
        lastName: "Mora",
        professionalName: "Dra. Elena Mora",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      // Ciudad de Mexico es UTC-6 fijo (sin horario de verano desde 2022).
      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        isPublic: true,
        timeZone: "America/Mexico_City"
      });

      const service = await createDoctorService(account.user.id, {
        name: "Consulta",
        priceCents: 50000,
        durationMinutes: 30
      });

      await createAvailabilityRule(account.user.id, {
        dayOfWeek: slotDate.getUTCDay(),
        startTime: "09:00",
        endTime: "14:00",
        slotInterval: 30
      });

      const availability = await listPublicAvailability({
        slug,
        serviceId: service.id,
        dateFrom,
        days: 1
      });

      // 09:00-14:00 con intervalo de 30 min y duracion 30 => 10 slots (09:00..13:30).
      expect(availability.slots).toHaveLength(10);

      const firstStart = new Date(availability.slots[0]!.slotStart);
      // 09:00 hora local de CDMX (UTC-6) equivale a las 15:00 UTC.
      expect(firstStart.getUTCHours()).toBe(15);
      expect(firstStart.getUTCMinutes()).toBe(0);

      const wallTime = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Mexico_City",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).format(firstStart);
      expect(wallTime).toBe("09:00");

      const lastStart = new Date(availability.slots[9]!.slotStart);
      expect(lastStart.getUTCHours()).toBe(19); // 13:30 local => 19:30 UTC
      expect(lastStart.getUTCMinutes()).toBe(30);
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("respects daylight saving transitions for the doctor's timezone", async () => {
    const email = uniqueEmail("doctor-dst");
    const slug = uniqueSlug("dra-dst");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Paula",
        lastName: "Reyes",
        professionalName: "Dra. Paula Reyes",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      // Tijuana si observa horario de verano: PDT (UTC-7) verano, PST (UTC-8) invierno.
      await updateDoctorProfile(account.user.id, {
        publicSlug: slug,
        isPublic: true,
        timeZone: "America/Tijuana"
      });

      const service = await createDoctorService(account.user.id, {
        name: "Consulta",
        priceCents: 50000,
        durationMinutes: 30
      });

      // Fechas fijas: una en verano (DST) y otra en invierno (estandar).
      await createAvailabilityRule(account.user.id, {
        specificDate: "2026-07-15",
        startTime: "09:00",
        endTime: "10:00",
        slotInterval: 30
      });
      await createAvailabilityRule(account.user.id, {
        specificDate: "2026-12-15",
        startTime: "09:00",
        endTime: "10:00",
        slotInterval: 30
      });

      const summer = await listPublicAvailability({
        slug,
        serviceId: service.id,
        dateFrom: "2026-07-15",
        days: 1
      });
      const winter = await listPublicAvailability({
        slug,
        serviceId: service.id,
        dateFrom: "2026-12-15",
        days: 1
      });

      // 09:00 local en verano (PDT, UTC-7) => 16:00 UTC.
      expect(new Date(summer.slots[0]!.slotStart).getUTCHours()).toBe(16);
      // 09:00 local en invierno (PST, UTC-8) => 17:00 UTC.
      expect(new Date(winter.slots[0]!.slotStart).getUTCHours()).toBe(17);
    } finally {
      await cleanupUserByEmail(email);
    }
  });
});
