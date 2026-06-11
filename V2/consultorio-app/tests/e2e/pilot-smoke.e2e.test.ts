import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClinicalProfile, PrismaClient } from "@prisma/client";

import { createDoctorAccount, createDoctorSubscription } from "../../src/services/auth/auth-service";
import {
  createAvailabilityRule,
  createDoctorService,
  updateDoctorProfile
} from "../../src/services/doctor/doctor-profile-service";

// Paso 9 - Step 2: live HTTP smoke against a running portal.
// Boots `next dev`, then verifies liveness, DB readiness and a public profile
// page over real HTTP. No browser engine is required: health/readiness are JSON
// and the profile page is server-rendered HTML we assert on directly.

const PORT = Number(process.env.E2E_PORT ?? 3123);
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;
const READY_TIMEOUT_MS = 120_000;

const prisma = new PrismaClient();
const ownerEmail = `e2e-pilot-${randomUUID()}@example.com`;
const slug = `e2e-pilot-${randomUUID().slice(0, 8)}`;
const professionalName = "Dra. Sara Nava (E2E)";
const serviceName = "Consulta general";

let serverProcess: ChildProcess | undefined;
let serverLog = "";
let serviceId = "";
// The seeded availability rule is on Tuesday (dayOfWeek 2); bookings target the
// next Tuesday so a slot is always in range of the rule's advance window.
const bookingWeekday = 2;

async function seedPublicDoctor() {
  const account = await createDoctorAccount({
    email: ownerEmail,
    password: "Str0ngPass!123",
    firstName: "Sara",
    lastName: "Nava",
    phone: "6140009000",
    professionalName,
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
    professionalName,
    specialty: ClinicalProfile.GENERAL_MEDICINE,
    description: "Consultorio de prueba E2E para verificacion de piloto seguro.",
    phone: "6140009000",
    city: "Chihuahua",
    state: "Chihuahua",
    country: "Mexico",
    consultationDuration: 30,
    isPublic: true
  });

  const service = await createDoctorService(account.user.id, {
    name: serviceName,
    description: "Valoracion medica de prueba.",
    priceCents: 80000,
    durationMinutes: 30,
    displayOrder: 1
  });
  serviceId = service.id;

  await createAvailabilityRule(account.user.id, {
    dayOfWeek: bookingWeekday,
    startTime: "09:00",
    endTime: "12:00",
    slotInterval: 30,
    minAdvanceHours: 2,
    maxAdvanceDays: 30
  });
}

async function cleanupSeed() {
  const user = await prisma.user.findUnique({
    where: { email: ownerEmail },
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

  // The booking flow below creates holds, appointments, patients and queued
  // notifications/short links. Notifications and short links reference the
  // doctor via SetNull, but holds/appointments/patients use Restrict, so they
  // must be removed before the user. Deleting patients cascades their
  // precheckin submissions; deleting the user cascades the profile, services,
  // availability rules and password reset tokens.
  await prisma.notification.deleteMany({ where: { doctorId: user.id } });
  await prisma.shortLink.deleteMany({ where: { doctorId: user.id } });
  await prisma.appointmentHold.deleteMany({ where: { doctorId: user.id } });
  await prisma.appointment.deleteMany({ where: { doctorId: user.id } });
  await prisma.patient.deleteMany({ where: { ownerDoctorId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

async function waitForServer(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (serverProcess?.exitCode != null) {
      throw new Error(`Dev server exited early (code ${serverProcess.exitCode}).\n${serverLog}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not accepting connections yet; retry until the deadline.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Dev server did not become ready within ${timeoutMs}ms.\n${serverLog}`);
}

async function stopServer() {
  const child = serverProcess;
  if (!child || child.pid == null) {
    return;
  }

  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());

    if (process.platform === "win32") {
      // Kill the whole shell + next dev worker tree on Windows.
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    } else {
      child.kill("SIGTERM");
    }

    // Safety net if the process never emits exit.
    setTimeout(resolve, 10_000);
  });
}

beforeAll(async () => {
  await prisma.$connect();
  await seedPublicDoctor();

  serverProcess = spawn(`npx next dev --port ${PORT} --hostname ${HOST}`, {
    cwd: process.cwd(),
    env: { ...process.env },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  serverProcess.stdout?.on("data", (chunk) => {
    serverLog += chunk.toString();
  });
  serverProcess.stderr?.on("data", (chunk) => {
    serverLog += chunk.toString();
  });

  await waitForServer(`${BASE_URL}/api/health`, READY_TIMEOUT_MS);
}, READY_TIMEOUT_MS + 30_000);

afterAll(async () => {
  await stopServer();
  await cleanupSeed();
  await prisma.$disconnect();
});

describe("pilot smoke (paso 9, step 2)", () => {
  it("serves liveness over HTTP without exposing clinical data", async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", service: "consultorio-app" });
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("patient");
  });

  it("reports database readiness over HTTP", async () => {
    const response = await fetch(`${BASE_URL}/api/readiness`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      status: "ready",
      checks: { database: "ok" }
    });
  });

  it("renders the seeded public profile page", async () => {
    const response = await fetch(`${BASE_URL}/perfil/${slug}`);
    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain(professionalName);
    expect(html).toContain("Consulta general");
  });

  it("returns 404 for an unknown public profile slug", async () => {
    const response = await fetch(`${BASE_URL}/perfil/no-existe-${randomUUID().slice(0, 8)}`);
    expect(response.status).toBe(404);
  });
});

function nextWeekdayDateString(targetDay: number) {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let diff = (targetDay - date.getUTCDay() + 7) % 7;
  if (diff === 0) {
    diff = 7;
  }
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

async function postJson(path: string, body?: unknown) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const parsed = await response.json().catch(() => null);
  return { status: response.status, body: parsed as Record<string, unknown> | null };
}

describe("patient booking flow (paso 9, step 2)", () => {
  it("lists slots, holds, books and confirms an appointment over HTTP", async () => {
    const dateFrom = nextWeekdayDateString(bookingWeekday);

    const availabilityResponse = await fetch(
      `${BASE_URL}/api/public/doctors/${slug}/availability?serviceId=${serviceId}&dateFrom=${dateFrom}&days=1`
    );
    expect(availabilityResponse.status).toBe(200);

    const availability = (await availabilityResponse.json()) as {
      slots: Array<{ slotStart: string }>;
    };
    expect(availability.slots.length).toBeGreaterThan(0);

    // Normalize to a Z-suffixed UTC string so the hold route's
    // z.string().datetime() validation accepts the slot start.
    const slotStart = new Date(availability.slots[0]!.slotStart).toISOString();

    const hold = await postJson(`/api/public/doctors/${slug}/holds`, {
      serviceId,
      slotStart
    });
    expect(hold.status).toBe(200);
    const holdToken = (hold.body?.hold as { token?: string } | undefined)?.token;
    expect(holdToken).toBeTruthy();

    const booking = await postJson("/api/public/appointments", {
      holdToken,
      patient: {
        firstName: "Mario",
        lastName: "Lopez",
        phone: "6141234567"
      },
      reason: "Control anual",
      legal: { acceptedTerms: true, acceptedPrivacy: true }
    });
    expect(booking.status).toBe(201);
    const appointment = booking.body?.appointment as
      | { status?: string; confirmationToken?: string }
      | undefined;
    expect(appointment?.status).toBe("PENDING");
    const confirmationToken = appointment?.confirmationToken;
    expect(confirmationToken).toBeTruthy();

    const confirm = await postJson(`/api/public/appointments/${confirmationToken}/confirm`);
    expect(confirm.status).toBe(200);

    const detailsResponse = await fetch(`${BASE_URL}/api/public/appointments/${confirmationToken}`);
    expect(detailsResponse.status).toBe(200);
    const details = (await detailsResponse.json()) as {
      appointment: { status: string };
      patient: { firstName: string };
    };
    expect(details.appointment.status).toBe("CONFIRMED");
    expect(details.patient.firstName).toBe("Mario");
  });
});

describe("account recovery (paso 9, step 2)", () => {
  it("returns the same non-enumerable response for known and unknown emails", async () => {
    const known = await postJson("/api/auth/password-recovery/request", { email: ownerEmail });
    const unknown = await postJson("/api/auth/password-recovery/request", {
      email: `nadie-${randomUUID()}@example.com`
    });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    // Anti-enumeration: the response must not reveal whether the account exists.
    expect(known.body).toEqual(unknown.body);
  });
});
