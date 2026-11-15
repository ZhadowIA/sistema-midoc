// Bloqueo por inactividad (decision del 2026-10-18): tras N minutos sin uso la
// app cierra la base cifrada y pide la frase de seguridad. Modulo sin React
// para probarlo con node --test.

/** Eventos que cuentan como uso de la app. */
export const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/** Opciones que ofrece la interfaz (espejo de `preferences.rs`); 0 lo desactiva. */
export const INACTIVITY_LOCK_CHOICES = [0, 5, 10, 15, 30, 60, 120] as const;

export function inactivityLabel(minutes: number): string {
  if (minutes === 0) return "Desactivado";
  if (minutes >= 60) return minutes === 60 ? "1 hora" : `${minutes / 60} horas`;
  return `${minutes} minutos`;
}

let holds = 0;

/**
 * Mientras alguien retenga la app despierta (por ejemplo, una grabacion de la
 * consulta en curso), la inactividad no bloquea. Devuelve la funcion que la
 * suelta; llamarla dos veces no descuenta de mas.
 */
export function holdAwake(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
  };
}

export function isHeldAwake(): boolean {
  return holds > 0;
}

interface Timers {
  setTimeout: (handler: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

/**
 * Vigila la actividad en `target` y llama `onIdle` tras `timeoutMs` sin ella.
 * Si al vencer hay una retencion activa, vuelve a esperar. Devuelve la funcion
 * que deja de vigilar.
 */
export function watchInactivity(options: {
  target: EventTarget;
  timeoutMs: number;
  onIdle: () => void;
  timers?: Timers;
}): () => void {
  const timers: Timers = options.timers ?? {
    setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>)
  };
  let timer: unknown;
  let stopped = false;

  const arm = () => {
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = timers.setTimeout(() => {
      timer = undefined;
      if (stopped) return;
      if (isHeldAwake()) {
        arm();
        return;
      }
      stopped = true;
      detach();
      options.onIdle();
    }, options.timeoutMs);
  };

  const onActivity = () => {
    if (!stopped) arm();
  };
  const detach = () => {
    for (const event of ACTIVITY_EVENTS) options.target.removeEventListener(event, onActivity);
  };

  for (const event of ACTIVITY_EVENTS) options.target.addEventListener(event, onActivity, { passive: true });
  arm();

  return () => {
    stopped = true;
    if (timer !== undefined) timers.clearTimeout(timer);
    detach();
  };
}
