import { randomUUID } from "node:crypto";
import _sodium from "libsodium-wrappers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@prisma/client";
import { approveDoctorAccountForTesting } from "../helpers/doctor-accounts";

import { POST as submitPost } from "../../src/app/api/public/preconsulta/[token]/route";
import { preconsultaEnvelopeSchema } from "../../src/lib/preconsulta-answers";
import { sealEnvelope } from "../../src/lib/seal-envelope";
import { createDoctorAccount } from "../../src/services/auth/auth-service";
import {
  publishQuestionnaire,
  regenerateGeneralLink,
  setGeneralLinkStatus
} from "../../src/services/preconsulta/questionnaire-service";
import { getPublicPreconsulta } from "../../src/services/preconsulta/submission-service";
import { linkSyncDevice } from "../../src/services/sync/sync-service";

// Preconsulta configurable, rebanada 2 (paso 32): el formulario publico y el
// deposito. El portal solo guarda el sobre sellado para la llave del medico.

const prisma = new PrismaClient();
const createdEmails: string[] = [];

const definition = {
  schemaVersion: 1,
  questions: [
    { id: "motivo", label: "¿Qué te trae a consulta?", type: "long_text", required: true },
    { id: "dolor", label: "¿Tienes dolor?", type: "yes_no", required: true }
  ]
};

async function doctorReady(label: string) {
  await _sodium.ready;
  const keys = _sodium.crypto_box_keypair();
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
  await linkSyncDevice(account.user.id, "PC consultorio", _sodium.to_base64(keys.publicKey, _sodium.base64_variants.ORIGINAL));
  await publishQuestionnaire(account.user.id, definition);
  const link = await regenerateGeneralLink(account.user.id);
  const token = link.url.split("/").pop() as string;
  return { doctorId: account.user.id, token, keys };
}

async function sealedAnswers(publicKey: string, version = 1) {
  const envelope = {
    kind: "preconsulta",
    version: 1,
    questionnaireVersion: version,
    linkKind: "GENERAL",
    submittedAt: new Date().toISOString(),
    consentAt: new Date().toISOString(),
    identity: { firstName: "Ana", lastName: "Ruiz", birthDate: "1990-05-01", phoneCountry: "+52", phone: "6140001111" },
    firstVisit: false,
    answers: { motivo: "Tos de tres dias", dolor: "no" }
  };
  const body = new TextEncoder().encode(JSON.stringify(preconsultaEnvelopeSchema.parse(envelope)));
  return sealEnvelope(publicKey, { kind: "preconsulta", version: 1 }, body);
}

function post(token: string, body: unknown, ip = `10.0.0.${Math.floor(Math.random() * 250)}`) {
  return submitPost(
    new Request(`http://localhost:3000/api/public/preconsulta/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body)
    }),
    { params: Promise.resolve({ token }) }
  );
}

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

describe("public preconsulta form", () => {
  it("serves what the form needs and stores only the sealed envelope", async () => {
    const { doctorId, token, keys } = await doctorReady("preconsulta-submit");
    const page = await getPublicPreconsulta(token);
    expect(page).toMatchObject({
      doctorName: "Dra. Elsa Rios",
      licenseNumber: "1234567",
      accepting: true,
      reason: null,
      questionnaire: { version: 1 }
    });
    expect(page?.publicKey).toBeTruthy();

    const ciphertext = await sealedAnswers(page!.publicKey!);
    const response = await post(token, { ciphertext, questionnaireVersion: 1 });
    expect(response.status).toBe(200);

    const stored = await prisma.preconsultaSubmission.findMany({ where: { doctorId } });
    expect(stored).toHaveLength(1);
    expect(stored[0].purgedAt).toBeNull();
    // El portal no puede leerlo: no hay nombre ni respuestas en claro en la fila.
    expect(Buffer.from(stored[0].ciphertext!).toString("latin1")).not.toContain("Ruiz");
    // Solo la llave del medico lo abre, y dentro va el sobre completo.
    await _sodium.ready;
    const opened = _sodium.crypto_box_seal_open(new Uint8Array(stored[0].ciphertext!), keys.publicKey, keys.privateKey);
    const view = new DataView(opened.buffer, opened.byteOffset);
    const metaLength = view.getUint32(0, false);
    const meta = JSON.parse(new TextDecoder().decode(opened.slice(4, 4 + metaLength)));
    const body = preconsultaEnvelopeSchema.parse(JSON.parse(new TextDecoder().decode(opened.slice(4 + metaLength))));
    expect(meta.kind).toBe("preconsulta");
    expect(body.identity.lastName).toBe("Ruiz");
    expect(body.answers.motivo).toBe("Tos de tres dias");

    const audit = await prisma.auditLog.findFirst({ where: { entityId: stored[0].id } });
    expect(JSON.stringify(audit)).not.toContain("Ruiz");
  });

  it("rejects paused, regenerated and unknown links", async () => {
    const { doctorId, token } = await doctorReady("preconsulta-paused");
    const publicKey = (await getPublicPreconsulta(token))!.publicKey!;

    await setGeneralLinkStatus(doctorId, "PAUSED");
    expect((await getPublicPreconsulta(token))?.reason).toBe("paused");
    expect((await post(token, { ciphertext: await sealedAnswers(publicKey), questionnaireVersion: 1 })).status).toBe(409);

    await regenerateGeneralLink(doctorId);
    expect(await getPublicPreconsulta(token)).toBeNull();
    expect((await post(token, { ciphertext: await sealedAnswers(publicKey), questionnaireVersion: 1 })).status).toBe(404);
    expect(await getPublicPreconsulta("no-es-un-token")).toBeNull();
    expect(await prisma.preconsultaSubmission.count({ where: { doctorId } })).toBe(0);
  });

  it("answers bots as if it worked without storing anything", async () => {
    const { doctorId, token } = await doctorReady("preconsulta-bot");
    const publicKey = (await getPublicPreconsulta(token))!.publicKey!;
    const response = await post(token, {
      ciphertext: await sealedAnswers(publicKey),
      questionnaireVersion: 1,
      website: "http://spam.example"
    });
    expect(response.status).toBe(200);
    expect(await prisma.preconsultaSubmission.count({ where: { doctorId } })).toBe(0);
  });

  it("rejects garbage, oversized envelopes, unknown versions and too many sends from one network", async () => {
    const { doctorId, token } = await doctorReady("preconsulta-limits");
    const publicKey = (await getPublicPreconsulta(token))!.publicKey!;
    expect((await post(token, { ciphertext: "no es base64 !!", questionnaireVersion: 1 })).status).toBe(400);
    expect((await post(token, { ciphertext: await sealedAnswers(publicKey), questionnaireVersion: 9 })).status).toBe(400);
    const huge = Buffer.alloc(200 * 1024, 1).toString("base64");
    expect((await post(token, { ciphertext: huge, questionnaireVersion: 1 })).status).toBe(413);

    const ip = `10.9.${Math.floor(Math.random() * 250)}.1`;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await post(token, { ciphertext: await sealedAnswers(publicKey), questionnaireVersion: 1 }, ip)).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(await prisma.preconsultaSubmission.count({ where: { doctorId } })).toBe(5);
  });
});
