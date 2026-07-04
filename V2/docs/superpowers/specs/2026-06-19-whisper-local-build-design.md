# Whisper local en builds de escritorio

Fecha: 2026-06-19  
Paso: 15 — Transcripción local real (Whisper) y descarga de modelo

## Problema

La implementación de `WhisperLocalProvider` existe tras el feature de Cargo
`whisper-local`, pero los comandos habituales de `desktop-app` no lo activan.
Como resultado, una aplicación iniciada o empaquetada con `npm run tauri dev` o
`npm run tauri build` llega al bloque de compilación sin feature y muestra que
la versión no incluye transcripción local.

## Decisión

Los scripts de producto de `V2/desktop-app/package.json` activarán
explícitamente `whisper-local`:

- `npm run tauri:dev` iniciará Tauri con `--features whisper-local`.
- `npm run tauri:build` creará la distribución con `--features whisper-local`.
- El script genérico `npm run tauri` permanecerá disponible para tareas
  administrativas de la CLI.

No se agregará `whisper-local` a los features predeterminados de Cargo. Así,
`cargo test` y `cargo clippy --lib` conservarán su cadena liviana, mientras que
ejecutar y distribuir el producto requerirá CMake y LLVM/libclang, como ya
documenta el paso 15.

## Verificación automatizada

Una prueba Node leerá `package.json` y exigirá que ambos scripts de producto
incluyan exactamente el feature `whisper-local`. Primero se observará la prueba
fallar con la configuración actual y después pasar con los scripts nuevos.

La verificación final incluirá:

1. pruebas TypeScript/Node de `desktop-app`;
2. build de frontend;
3. pruebas Rust predeterminadas;
4. `cargo clippy --lib`;
5. compilación Rust con `cargo build --features whisper-local`;
6. build de distribución mediante el nuevo script cuando la configuración de
   firma/bundling local lo permita.

## Seguridad y residencia

El cambio sólo selecciona código nativo ya existente al compilar. No persiste
audio nuevo, no envía contenido clínico a la nube y no modifica logs,
telemetría, consentimiento ni el respaldo gobernado.

## Fuera de alcance

- Activar diarización local.
- Cambiar el modelo Whisper recomendado o su descarga.
- Hacer que la cadena nativa sea obligatoria para todas las pruebas Rust.
- Modificar el proveedor de transcripción en nube.
