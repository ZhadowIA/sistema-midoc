import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClinicalProfile, PrismaClient } from "@prisma/client";

import { createDoctorAccount, createDoctorSubscription } from "../../src/services/auth/auth-service";
import {
  bookPublicAppointment,
  confirmPublicAppointment,
  createAppointmentHold,
  listPublicAvailability,
  submitPrecheckin
} from "../../src/services/booking/public-booking-service";
import {
  closeEncounter,
  getEncounterWorkspaceByAppointment,
  openEncounterFromAppointment,
  saveEncounterWorkspace
} from "../../src/services/clinical/encounter-service";
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
    where: { doctorId: user.id }
  });

  await prisma.appointmentHold.deleteMany({
    where: { doctorId: user.id }
  });

  await prisma.encounter.deleteMany({
    where: { doctorId: user.id }
  });

  await prisma.clinicalRecord.deleteMany({
    where: { doctorId: user.id }
  });

  await prisma.patient.deleteMany({
    where: { ownerDoctorId: user.id }
  });

  await prisma.user.delete({
    where: { id: user.id }
  });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("clinical encounter flow", () => {
  it("opens an encounter from an appointment, saves SOAP, prescription and instructions, then signs and closes", async () => {
    const email = uniqueEmail("doctor-encounter");
    const slug = uniqueSlug("dra-encounter");
    const slotDate = nextWeekdayDate(4);
    const dateFrom = slotDate.toISOString().slice(0, 10);

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Miriam",
        lastName: "Salas",
        phone: "6140000600",
        professionalName: "Dra. Miriam Salas",
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
        professionalName: "Dra. Miriam Salas",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        isPublic: true
      });

      const service = await createDoctorService(account.user.id, {
        name: "Consulta integral",
        priceCents: 95000,
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

      const hold = await createAppointmentHold({
        slug,
        serviceId: service.id,
        slotStart: availability.slots[0]!.slotStart
      });

      const booking = await bookPublicAppointment({
        holdToken: hold.token,
        patient: {
          firstName: "Teresa",
          lastName: "Navarro",
          phone: "6145550000",
          email: uniqueEmail("patient-encounter")
        },
        reason: "Fatiga persistente",
        legal: {
          acceptedTerms: true,
          acceptedPrivacy: true
        }
      });

      await confirmPublicAppointment({
        confirmationToken: booking.confirmationToken
      });

      await submitPrecheckin({
        confirmationToken: booking.confirmationToken,
        responses: {
          motivo: "Fatiga y mareo",
          antecedentes: "Hipotiroidismo",
          sintomas: "Mareo matutino"
        }
      });

      const opened = await openEncounterFromAppointment({
        doctorUserId: account.user.id,
        appointmentId: booking.appointment.id
      });

      expect(opened.encounter.status).toBe("OPEN");
      expect(opened.clinicalRecord.patientId).toBe(booking.patient.id);

      await saveEncounterWorkspace({
        doctorUserId: account.user.id,
        encounterId: opened.encounter.id,
        clinicalRecord: {
          summary: {
            antecedentes: "Hipotiroidismo controlado",
            seguimiento: "Perfil tiroideo en 3 meses"
          },
          alerts: {
            allergy: "Ninguna reportada"
          }
        },
        note: {
          subjective: "Paciente refiere 2 semanas de fatiga y mareo matutino.",
          objective: "TA 110/70, FC 78, hidratacion adecuada.",
          assessment: "Probable desequilibrio tiroideo vs anemia leve.",
          plan: "Solicitar BH, QS y ajustar estilo de vida."
        },
        prescription: {
          diagnosis: "Fatiga en estudio",
          notes: "Tomar estudios en ayuno.",
          items: [
            {
              medicationName: "Sulfato ferroso",
              dosage: "325 mg",
              frequency: "Cada 24 horas",
              duration: "30 dias",
              instructions: "Tomar despues de alimentos"
            }
          ]
        },
        instructions: [
          {
            title: "Cuidados generales",
            body: "Hidratacion adecuada y no omitir alimentos."
          }
        ]
      });

      const workspace = await getEncounterWorkspaceByAppointment({
        doctorUserId: account.user.id,
        appointmentId: booking.appointment.id
      });

      expect(workspace?.clinicalNote?.currentVersion).toBeGreaterThanOrEqual(2);
      expect(workspace?.prescription?.items).toHaveLength(1);
      expect(workspace?.instructions).toHaveLength(1);
      expect(workspace?.precheckin?.status).toBe("SUBMITTED");

      await closeEncounter({
        doctorUserId: account.user.id,
        encounterId: opened.encounter.id,
        closingSummary: "Paciente estable, seguimiento con estudios."
      });

      const closedWorkspace = await getEncounterWorkspaceByAppointment({
        doctorUserId: account.user.id,
        appointmentId: booking.appointment.id
      });

      expect(closedWorkspace?.encounter.status).toBe("CLOSED");
      expect(closedWorkspace?.clinicalNote?.status).toBe("SIGNED");
      expect(closedWorkspace?.appointment.status).toBe("COMPLETED");
      expect(closedWorkspace?.clinicalRecord.lastEncounterAt).toBeTruthy();
    } finally {
      await cleanupUserByEmail(email);
    }
  });
});
