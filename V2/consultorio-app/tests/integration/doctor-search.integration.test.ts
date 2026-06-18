import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClinicalProfile, PrismaClient } from "@prisma/client";

import { createDoctorAccount, createDoctorSubscription } from "../../src/services/auth/auth-service";
import { GET as searchDoctorsRoute } from "../../src/app/api/public/doctors/route";
import { createDoctorService, updateDoctorProfile } from "../../src/services/doctor/doctor-profile-service";
import { searchPublicDoctors } from "../../src/services/doctor/doctor-search-service";

const prisma = new PrismaClient();

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

function uniqueSlug(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

async function cleanupUserByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { doctorProfile: true }
  });

  if (!user) {
    return;
  }

  if (user.doctorProfile) {
    await prisma.doctorSubscription.deleteMany({
      where: { doctorProfileId: user.doctorProfile.id }
    });
  }

  await prisma.user.delete({ where: { id: user.id } });
}

async function createPublicDoctor(input: {
  email: string;
  slug: string;
  professionalName: string;
  specialty: ClinicalProfile;
  city: string;
  state: string;
  serviceName: string;
  isPublic?: boolean;
}) {
  const account = await createDoctorAccount({
    email: input.email,
    password: "Str0ngPass!123",
    firstName: input.professionalName.replace(/^Dr\.?\s*/i, "").split(" ")[0] ?? "Medico",
    lastName: "Busqueda",
    professionalName: input.professionalName,
    licenseNumber: "1234567",
    specialty: input.specialty,
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });

  await createDoctorSubscription({
    doctorUserId: account.user.id,
    planCode: "ESSENTIAL"
  });

  await updateDoctorProfile(account.user.id, {
    publicSlug: input.slug,
    professionalName: input.professionalName,
    specialty: input.specialty,
    city: input.city,
    state: input.state,
    country: "Mexico",
    phone: "6140000400",
    licenseNumber: "CED-SEARCH",
    isPublic: input.isPublic ?? true
  });

  await createDoctorService(account.user.id, {
    name: input.serviceName,
    priceCents: 90000,
    durationMinutes: 45,
    displayOrder: 1
  });

  return account;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("public doctor search", () => {
  it("finds only public doctors by name and returns the public DTO", async () => {
    const publicEmail = uniqueEmail("doctor-search-public");
    const privateEmail = uniqueEmail("doctor-search-private");
    const publicSlug = uniqueSlug("dra-alma-rivas");
    const privateSlug = uniqueSlug("dra-alma-privada");

    try {
      await createPublicDoctor({
        email: publicEmail,
        slug: publicSlug,
        professionalName: "Dra. Alma Rivas",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        city: "Chihuahua",
        state: "Chihuahua",
        serviceName: "Consulta general"
      });

      await createPublicDoctor({
        email: privateEmail,
        slug: privateSlug,
        professionalName: "Dra. Alma Privada",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        city: "Chihuahua",
        state: "Chihuahua",
        serviceName: "Consulta privada",
        isPublic: false
      });

      const result = await searchPublicDoctors({ q: "Alma" });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        professionalName: "Dra. Alma Rivas",
        publicSlug,
        specialty: "GENERAL_MEDICINE",
        city: "Chihuahua",
        state: "Chihuahua",
        services: [{ name: "Consulta general" }]
      });
      expect(JSON.stringify(result.results[0])).not.toContain("licenseNumber");
      expect(JSON.stringify(result.results[0])).not.toContain("phone");
    } finally {
      await cleanupUserByEmail(publicEmail);
      await cleanupUserByEmail(privateEmail);
    }
  });

  it("finds doctors by city and specialty labels", async () => {
    const email = uniqueEmail("doctor-search-city-specialty");
    const slug = uniqueSlug("dr-odontologia-juarez");

    try {
      await createPublicDoctor({
        email,
        slug,
        professionalName: "Dr. Tomas Ibarra",
        specialty: ClinicalProfile.ODONTOLOGY,
        city: "Ciudad Juarez",
        state: "Chihuahua",
        serviceName: "Limpieza dental"
      });

      const byCity = await searchPublicDoctors({ city: "juarez" });
      const bySpecialty = await searchPublicDoctors({ specialty: "odontologia" });
      const byQuerySpecialty = await searchPublicDoctors({ q: "dentista juarez" });

      expect(byCity.results.some((doctor) => doctor.publicSlug === slug)).toBe(true);
      expect(bySpecialty.results.some((doctor) => doctor.publicSlug === slug)).toBe(true);
      expect(byQuerySpecialty.results.some((doctor) => doctor.publicSlug === slug)).toBe(true);
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("returns no results for an empty search and rejects overlong filters", async () => {
    await expect(searchPublicDoctors({ q: "" })).resolves.toMatchObject({
      results: [],
      total: 0
    });

    await expect(searchPublicDoctors({ q: "a".repeat(81) })).rejects.toMatchObject({
      status: 400
    });
  });

  it("serves search results from the public route", async () => {
    const email = uniqueEmail("doctor-search-route");
    const slug = uniqueSlug("dra-ruta-publica");

    try {
      await createPublicDoctor({
        email,
        slug,
        professionalName: "Dra. Ruta Publica",
        specialty: ClinicalProfile.GENERAL_MEDICINE,
        city: "Chihuahua",
        state: "Chihuahua",
        serviceName: "Consulta de ruta"
      });

      const response = await searchDoctorsRoute(
        new Request("http://localhost/api/public/doctors?q=Ruta")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.results).toHaveLength(1);
      expect(body.results[0].publicSlug).toBe(slug);
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("returns 400 from the public route for invalid search params", async () => {
    const response = await searchDoctorsRoute(
      new Request(`http://localhost/api/public/doctors?q=${"a".repeat(81)}`)
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "Parametros de busqueda invalidos."
    });
  });
});
