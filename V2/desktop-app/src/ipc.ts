import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { parseIpcResponse } from "./ipcSchemas";

/**
 * Canal unico hacia el proceso nativo. Toda respuesta, del backend real o del
 * mock de navegador, se valida contra el contrato de su comando antes de llegar
 * a la UI (REGLAS_DESARROLLO.md §3: validacion en las fronteras).
 *
 * Fuera de Tauri (vite dev en un navegador) sirve datos de demostracion para
 * trabajar las pantallas sin la app nativa. Ese mock se carga con `import()`
 * solo en desarrollo, asi que no viaja en el bundle distribuido.
 */

const isTauri = "__TAURI_INTERNALS__" in window;

export function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    return invoke<unknown>(command, args)
      .catch((error: unknown) => {
        throw formatIpcError(command, error);
      })
      .then((raw) => parseIpcResponse<T>(command, raw));
  }
  return callMock<T>(command, args);
}

/**
 * Camino de navegador. En un build de produccion no hay mock que cargar: si la
 * pagina corre fuera de la app nativa, se dice y no se inventan datos.
 */
async function callMock<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!import.meta.env.DEV) {
    throw new Error(
      "MiDoc necesita la aplicacion de escritorio para trabajar con el expediente; esta ventana no tiene acceso a la base local."
    );
  }
  const { mockCall } = await import("./ipcMock");
  const raw = await mockCall<unknown>(command, args);
  return parseIpcResponse<T>(command, raw);
}

/**
 * Escape visto por el proceso nativo (`escape_key.rs`). Llega aunque el foco
 * este dentro del visor de PDF de WebView2, que no deja pasar el teclado a la
 * pagina. Devuelve la funcion para dejar de escuchar. En el navegador no hace
 * nada: ahi el `keydown` de la pagina basta.
 */
export function onNativeEscape(handler: () => void): () => void {
  if (!isTauri) return () => {};
  let stopped = false;
  let unlisten: (() => void) | undefined;
  void listen("midoc://escape", handler).then((stop) => {
    if (stopped) stop();
    else unlisten = stop;
  });
  return () => {
    stopped = true;
    unlisten?.();
  };
}

function formatIpcError(command: string, error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error);
  if (/command .* not found/i.test(raw) || raw.includes(`Command ${command} not found`)) {
    return new Error(
      `El proceso nativo de MiDoc no tiene registrado el comando "${command}". Reinicia la app de escritorio para cargar el backend actualizado.`
    );
  }
  return error instanceof Error ? error : new Error(raw);
}
