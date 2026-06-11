import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@prisma/client";

// Paso 9 - Step 2: doctor registration, login and session over real HTTP.
// The shared `next dev` is started by tests/e2e/global-server.ts. This file
// drives the auth surface entirely over HTTP: register, login (issues the
// session cookie), and using that cookie against a protected admin route.

const PORT = Number(process.env.E2E_PORT ?? 3123);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SESSION_COOKIE_NAME = "med_token";

const prisma = new PrismaClient();
const ownerEmail = `e2e-auth-${randomUUID()}@example.com`;
const ownerPassword = "Str0ngPass!123";

let sessionCookie = "";

function extractSessionCookie(response: Response): string | null {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];

  for (const cookie of cookies) {
    const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    if (match) {
      return `${SESSION_COOKIE_NAME}=${match[1]}`;
    }
  }

  return null;
}

async function post(path: string, body: unknown, cookie?: string) {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });
}

async function get(path: string, cookie?: string) {
  return fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { cookie } : undefined
  });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  const user = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (user) {
    // AuthSession and the doctor profile cascade from the user.
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$disconnect();
});

describe("doctor auth and session over HTTP (paso 9, step 2)", () => {
  it("registers a doctor and issues a usable session cookie on login", async () => {
    const register = await post("/api/auth/register", {
      email: ownerEmail,
      password: ownerPassword,
      firstName: "Elena",
      lastName: "Vega",
      professionalName: "Dra. Elena Vega",
      specialty: "GENERAL_MEDICINE"
    });
    expect(register.status).toBe(201);

    const login = await post("/api/auth/login", {
      email: ownerEmail,
      password: ownerPassword
    });
    expect(login.status).toBe(200);
    const loginBody = (await login.json()) as { user: { email: string } };
    expect(loginBody.user.email).toBe(ownerEmail);

    const cookie = extractSessionCookie(login);
    expect(cookie).toBeTruthy();
    sessionCookie = cookie!;

    const session = await get("/api/auth/session", sessionCookie);
    expect(session.status).toBe(200);
    const sessionBody = (await session.json()) as { user: { email: string; role: string } };
    expect(sessionBody.user.email).toBe(ownerEmail);
    expect(sessionBody.user.role).toBe("DOCTOR");
  });

  it("authorizes a protected admin route with the session cookie", async () => {
    const profile = await get("/api/admin/profile", sessionCookie);
    expect(profile.status).toBe(200);
    const body = (await profile.json()) as { profile: unknown };
    expect(body.profile).toBeTruthy();
  });

  it("rejects unauthenticated access to session and admin routes", async () => {
    const session = await get("/api/auth/session");
    expect(session.status).toBe(401);

    const profile = await get("/api/admin/profile");
    expect(profile.status).toBe(401);
  });

  it("rejects login with a wrong password", async () => {
    const login = await post("/api/auth/login", {
      email: ownerEmail,
      password: "wrong-password"
    });
    expect(login.status).not.toBe(200);
    expect(extractSessionCookie(login)).toBeNull();
  });
});
