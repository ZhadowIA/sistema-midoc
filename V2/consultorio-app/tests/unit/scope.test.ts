import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { doctorHomePath, isFrozenPath, parseFrozenScope } from "../../src/lib/scope";
import { proxy } from "../../src/proxy";

function request(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("frozen scope flag", () => {
  it("is off unless explicitly enabled", () => {
    expect(parseFrozenScope(undefined)).toBe(false);
    expect(parseFrozenScope("")).toBe(false);
    expect(parseFrozenScope("false")).toBe(false);
    expect(parseFrozenScope("no-es-booleano")).toBe(false);
    expect(parseFrozenScope("true")).toBe(true);
    expect(parseFrozenScope("on")).toBe(true);
  });

  it("freezes agenda, public profile, patient portal, mailbox and notifications", () => {
    for (const path of [
      "/buscar",
      "/perfil/dra-lopez",
      "/perfil/dra-lopez/agenda",
      "/paciente/login",
      "/carga/abc",
      "/resumen/abc",
      "/s/xyz",
      "/medico/agenda",
      "/medico/configuracion",
      "/api/public/doctors",
      "/api/public/appointments/tok/precheckin",
      "/api/patient/portal",
      "/api/admin/appointments",
      "/api/admin/availability/blocks",
      "/api/admin/services",
      "/api/admin/notifications",
      "/api/internal/notifications/dispatch",
      "/api/sync/summaries"
    ]) {
      expect(isFrozenPath(path), path).toBe(true);
    }
  });

  it("keeps account, subscription, AI gateway and desktop sync alive", () => {
    for (const path of [
      "/",
      "/medico",
      "/medico/cuenta",
      "/medico/login",
      "/medico/registro",
      "/recuperar",
      "/admin/medicos",
      "/api/auth/login",
      "/api/admin/profile",
      "/api/admin/subscription",
      "/api/admin/ai-credits",
      "/api/sync/inbox",
      "/api/sync/ai-usage",
      "/api/sync/ai/transcriptions",
      "/api/internal/maintenance/cleanup",
      "/api/health",
      // Un prefijo no congela rutas que solo empiezan igual.
      "/servicios",
      "/pacientes-info"
    ]) {
      expect(isFrozenPath(path), path).toBe(false);
    }
  });

  it("sends every doctor to the account page unless the frozen scope is on", () => {
    expect(doctorHomePath(false, "ONBOARDING")).toBe("/medico/cuenta");
    expect(doctorHomePath(false, "DASHBOARD")).toBe("/medico/cuenta");
    expect(doctorHomePath(true, "DASHBOARD")).toBe("/medico/agenda");
    expect(doctorHomePath(true, "ONBOARDING")).toBe("/medico/configuracion");
  });
});

describe("proxy", () => {
  const original = process.env.MIDOC_FROZEN_SCOPE;

  afterEach(() => {
    process.env.MIDOC_FROZEN_SCOPE = original;
  });

  it("answers 404 on frozen API routes and redirects frozen pages", async () => {
    delete process.env.MIDOC_FROZEN_SCOPE;

    const api = proxy(request("/api/public/doctors"));
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: "Este modulo no esta disponible." });

    const doctorPage = proxy(request("/medico/agenda"));
    expect(doctorPage.status).toBe(307);
    expect(doctorPage.headers.get("location")).toBe("http://localhost:3000/medico/cuenta");

    const patientPage = proxy(request("/perfil/dra-lopez"));
    expect(patientPage.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("lets active routes through", () => {
    delete process.env.MIDOC_FROZEN_SCOPE;
    expect(proxy(request("/api/admin/profile")).headers.get("x-middleware-next")).toBe("1");
  });

  it("lets everything through when the frozen scope is on", () => {
    process.env.MIDOC_FROZEN_SCOPE = "true";
    expect(proxy(request("/api/public/doctors")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/medico/agenda")).headers.get("x-middleware-next")).toBe("1");
  });
});
