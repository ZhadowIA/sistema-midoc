import { z } from "zod";

// Alcance del producto (reenfoque 2026-09-07, `V2/14_reenfoque_expediente_ia.md`).
//
// El portal queda en cuenta del medico, suscripcion y pasarela de IA. La agenda
// publica, el perfil publico, el portal del paciente, el precheckin, el buzon,
// los resumenes autorizados y las notificaciones al paciente se congelan tras
// MIDOC_FROZEN_SCOPE (apagada por omision): el codigo sigue ahi, pero sus rutas
// responden 404 y sus pantallas no se alcanzan. Encenderla devuelve todo.
//
// Modulo puro: no importa `env.ts` para que `proxy.ts` y las pruebas puedan
// usarlo sin validar el entorno completo.

const frozenScopeSchema = z.stringbool().default(false);

export function parseFrozenScope(raw: string | undefined): boolean {
  const parsed = frozenScopeSchema.safeParse(raw === "" ? undefined : raw);
  return parsed.success ? parsed.data : false;
}

export function isFrozenScopeEnabled(): boolean {
  return parseFrozenScope(process.env.MIDOC_FROZEN_SCOPE);
}

// Prefijos congelados. `/api/sync/*` se queda activo a proposito (salvo los
// resumenes autorizados): la app de escritorio vincula, lee su perfil, reporta
// uso de IA y recorre el buzon en el mismo ciclo; sin agenda publica el buzon
// ya no recibe eventos nuevos.
export const FROZEN_PATH_PREFIXES = [
  // Paginas del paciente y perfil publico
  "/buscar",
  "/carga",
  "/paciente",
  "/perfil",
  "/resumen",
  "/s",
  // Paginas del medico ligadas a agenda y perfil publico
  "/medico/agenda",
  "/medico/configuracion",
  // API publica y del paciente
  "/api/public",
  "/api/patient",
  // API del medico ligada a agenda, perfil publico, buzon y notificaciones
  "/api/admin/appointments",
  "/api/admin/availability",
  "/api/admin/document-upload-links",
  "/api/admin/gallery",
  "/api/admin/notifications",
  "/api/admin/services",
  "/api/internal/notifications",
  "/api/sync/summaries"
] as const;

export function isFrozenPath(pathname: string): boolean {
  return FROZEN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export type DoctorSetupStep = "SUBSCRIPTION" | "ONBOARDING" | "DASHBOARD";

// A donde llega el medico al entrar. Sin el alcance congelado ya no hay
// onboarding de perfil publico: todo medico aterriza en su cuenta.
export function doctorHomePath(frozenScope: boolean, nextStep: DoctorSetupStep): string {
  if (!frozenScope) {
    return "/medico/cuenta";
  }
  return nextStep === "DASHBOARD" ? "/medico/agenda" : "/medico/configuracion";
}
