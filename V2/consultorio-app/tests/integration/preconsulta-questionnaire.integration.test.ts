import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@prisma/client";
import { approveDoctorAccountForTesting } from "../helpers/doctor-accounts";

import { PATCH as linkPatch, POST as linkPost } from "../../src/app/api/sync/preconsulta/link/route";
import { GET as statusGet, PUT as publishPut } from "../../src/app/api/sync/preconsulta/route";
import { hashOpaqueToken } from "../../src/lib/security/token";
import { createDoctorAccount } from "../../src/services/auth/auth-service";
import { linkSyncDevice } from "../../src/services/sync/sync-service";

// Preconsulta configurable, rebanada 1 (paso 32): la app publica la parte 2 del
// cuestionario y administra el enlace general. Solo preguntas y tokens como hash.

const prisma = new PrismaClient();
const createdEmails: string[] = [];

async function doctorWithDevice(label: string) {
  const email = `${label}-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const account = await createDoctorAccount({
    email,
    password: "Str0ngPass!123",
    firstName: "Elsa",
    lastName: "Rios",
    professionalName: "Dra. Elsa Rios",
    licenseNumber: "1234567",
    specialty: "GENERAL_MEDICINE",
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });
  await approveDoctorAccountForTesting(prisma, account.user.id);
  const { deviceToken } = await linkSyncDevice(account.user.id, "PC consultorio");
  return { doctorId: account.user.id, bearer: { authorization: `Bearer ${deviceToken}` } };
}

function request(path: string, method: string, headers: Record<string, string>, body?: unknown) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

const definition = {
  schemaVersion: 1,
  title: "Motivo de consulta",
  questions: [
    { id: "motivo", label: "¿Qué te trae a consulta?", type: "long_text", required: true },
    { id: "dolor", label: "¿Tienes dolor?", type: "yes_no", required: true },
    { id: "intensidad", label: "Intensidad", type: "scale", required: false, showWhen: { questionId: "dolor", equals: "si" } }
  ]
};

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  for (const email of createdEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$disconnect();
});

describe("preconsulta questionnaire from the desktop app", () => {
  it("starts empty, publishes and bumps the version on every publication", async () => {
    const { bearer } = await doctorWithDevice("preconsulta-publish");

    const empty = await statusGet(request("/api/sync/preconsulta", "GET", bearer));
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ questionnaire: null, generalLink: null });

    const first = await publishPut(request("/api/sync/preconsulta", "PUT", bearer, { definition }));
    expect(first.status).toBe(200);
    expect((await first.json()).version).toBe(1);

    const changed = { ...definition, questions: definition.questions.slice(0, 1) };
    const second = await publishPut(request("/api/sync/preconsulta", "PUT", bearer, { definition: changed }));
    expect((await second.json()).version).toBe(2);

    const status = await (await statusGet(request("/api/sync/preconsulta", "GET", bearer))).json();
    expect(status.questionnaire.version).toBe(2);
    expect(status.questionnaire.definition).toEqual(changed);
  });

  it("rejects an invalid definition and unauthenticated calls", async () => {
    const { bearer } = await doctorWithDevice("preconsulta-invalid");
    const broken = { ...definition, questions: [{ id: "x", label: "X", type: "single_choice", required: false, options: ["A"] }] };
    expect((await publishPut(request("/api/sync/preconsulta", "PUT", bearer, { definition: broken }))).status).toBe(400);
    expect((await statusGet(request("/api/sync/preconsulta", "GET", { authorization: "Bearer falso" }))).status).toBe(401);
  });

  it("creates, pauses, resumes and regenerates the general link, storing only its hash", async () => {
    const { doctorId, bearer } = await doctorWithDevice("preconsulta-link");

    expect((await linkPatch(request("/api/sync/preconsulta/link", "PATCH", bearer, { status: "PAUSED" }))).status).toBe(404);

    const created = await (await linkPost(request("/api/sync/preconsulta/link", "POST", bearer))).json();
    expect(created.status).toBe("ACTIVE");
    expect(created.url).toMatch(/\/preconsulta\/[0-9a-f]{48}$/);
    const firstToken = created.url.split("/").pop() as string;
    const stored = await prisma.preconsultaLink.findMany({ where: { doctorId } });
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).toBe(hashOpaqueToken(firstToken));
    expect(JSON.stringify(stored)).not.toContain(firstToken);

    const paused = await (await linkPatch(request("/api/sync/preconsulta/link", "PATCH", bearer, { status: "PAUSED" }))).json();
    expect(paused.status).toBe("PAUSED");
    const status = await (await statusGet(request("/api/sync/preconsulta", "GET", bearer))).json();
    expect(status.generalLink.status).toBe("PAUSED");
    expect(status.generalLink).not.toHaveProperty("url");

    const resumed = await (await linkPatch(request("/api/sync/preconsulta/link", "PATCH", bearer, { status: "ACTIVE" }))).json();
    expect(resumed.status).toBe("ACTIVE");

    const regenerated = await (await linkPost(request("/api/sync/preconsulta/link", "POST", bearer))).json();
    expect(regenerated.url).not.toBe(created.url);
    const links = await prisma.preconsultaLink.findMany({ where: { doctorId }, orderBy: { createdAt: "asc" } });
    expect(links.map((l) => l.status)).toEqual(["REVOKED", "ACTIVE"]);
    expect(links[0].revokedAt).not.toBeNull();

    const audit = await prisma.auditLog.findMany({ where: { actorUserId: doctorId, entityType: "PreconsultaLink" } });
    expect(audit.map((a) => a.action).sort()).toEqual(
      ["preconsulta.link.created", "preconsulta.link.paused", "preconsulta.link.regenerated", "preconsulta.link.resumed"].sort()
    );
  });
});
