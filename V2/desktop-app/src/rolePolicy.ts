// Politica de UI por rol (paso 27, rebanada 2). La compuerta real vive en el
// proceso nativo (`authz.rs`): aunque la UI se equivoque, un comando clinico
// invocado por recepcion se rechaza. Este modulo solo decide que se MUESTRA,
// para que la recepcionista no vea puertas que de todos modos no abren.

export type ActorRole = "DOCTOR" | "RECEPCION";

export interface SessionActor {
  id: string;
  name: string;
  role: string;
}

export type WorkspaceView =
  | "agenda"
  | "patients"
  | "reception"
  | "benchmark"
  | "transcription"
  | "medications"
  | "arco";

/** Un rol desconocido se trata como el de menos privilegio. */
export function coerceRole(role: string | null | undefined): ActorRole {
  return role === "DOCTOR" ? "DOCTOR" : "RECEPCION";
}

export function isDoctor(role: string | null | undefined): boolean {
  return coerceRole(role) === "DOCTOR";
}

export function roleLabel(role: string | null | undefined): string {
  return isDoctor(role) ? "Médico" : "Recepción";
}

/** Vistas que el rol puede abrir; recepción solo opera recepción y caja. */
export function allowedViewsForRole(role: string | null | undefined): WorkspaceView[] {
  if (isDoctor(role)) {
    return ["agenda", "patients", "reception", "transcription", "medications", "arco", "benchmark"];
  }
  return ["reception"];
}

export function defaultViewForRole(role: string | null | undefined): WorkspaceView {
  return isDoctor(role) ? "agenda" : "reception";
}

export function viewAllowedForRole(role: string | null | undefined, view: WorkspaceView): boolean {
  return allowedViewsForRole(role).includes(view);
}

/**
 * Bloqueo por inactividad (plan 14, fase 1.15): sin el, el medico deja su
 * sesion abierta y recepcion opera con sus permisos. Diez minutos sin teclado
 * ni puntero devuelven la app a la pantalla de desbloqueo; el cambio rapido de
 * usuario es el mismo camino (bloquear y abrir con otra credencial).
 */
export const INACTIVITY_LOCK_MS = 10 * 60_000;

/** Eventos del DOM que cuentan como actividad y reinician el temporizador. */
export const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
