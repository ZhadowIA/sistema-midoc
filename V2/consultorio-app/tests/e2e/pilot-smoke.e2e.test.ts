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

let serverProcess: ChildProcess | undefined;
let serverLog = "";

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

  await createDoctorService(account.user.id, {
    name: "Consulta general",
    description: "Valoracion medica de prueba.",
    priceCents: 80000,
    durationMinutes: 30,
    displayOrder: 1
  });

  await createAvailabilityRule(account.user.id, {
    dayOfWeek: 2,
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

  // AuditLog.actorUserId is SetNull and there is no clinical data for a
  // freshly seeded doctor, so deleting the user cascades the profile,
  // services and availability rules created above.
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
