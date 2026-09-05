# Contexto de trabajo — continuar desde la laptop

> Documento de handoff para retomar el desarrollo de **Sistema MiDoc V2** en otro
> equipo. Última actualización: 2026-06-23.

## 1. Estado actual del repo

- **Rama activa:** `v2/paso22-diarizacion-local` (ya está en `origin`).
- **Remoto:** `git@github.com:ZhadowIA/sistema-midoc.git`.
- Todo lo trabajado hasta hoy está **commiteado y subido**. Al llegar a la laptop,
  basta con clonar/actualizar y seguir desde esta rama.
- Flujo git (regla del proyecto): se trabaja en ramas cortas `v2/<paso>-<desc>`,
  PR hacia `dev`; `main` solo recibe merges validados desde `dev`.

### Pasos del plan de desarrollo
- DONE: 0–10, 13, 14, 18, 19, 20.
- En progreso: 11/12.
- Paso 15 (Whisper local) implementado y extendido (CPU + CUDA).
- Paso 22: diarización local (en curso, esta rama).

## 2. Últimos cambios (qué se hizo recientemente)

Foco reciente: **transcripción local de la consulta + ayuda IA + diarización**, todo
en `V2/desktop-app`.

1. **Whisper local optimizado para CPU** (commit `8c76264`): el modelo se conserva
   en memoria entre transcripciones y usa los núcleos físicos disponibles.
2. **Build CUDA separado** del build CPU: feature `whisper-cuda` aparte para poder
   distribuir también en equipos sin GPU NVIDIA. Comandos `npm run tauri:dev:cuda`
   y `npm run tauri:build:cuda`.
3. **Diarización local con sherpa-onnx** (paso 22): el médico puede fijar el número
   de hablantes (Auto / 1..3) en `ai_diarize_consultation` (`num_speakers`).
4. **Nuevo comando** `ai_discard_reviewed_transcription` para descartar una revisión
   de transcripción.
5. **Expediente / historia clínica:** componentes nuevos `MedicalHistoryGroups.tsx`
   y `AutoGrowTextarea.tsx`; ajustes en `MedicalHistoryEditor`, `Atencion`,
   `Expediente`.
6. **Layout del panel de transcripción** reorganizado en dos filas (protegido por
   tests).
7. **Tests nuevos:** `consultationRecorder.test.ts`, `consultationScribe.test.ts`,
   `expedienteMedicalHistory.test.ts`.

Archivos clave: `src-tauri/src/{ai.rs, diarization.rs, sherpa_diarization.rs, lib.rs}`,
`src/{Atencion.tsx, ConsultationTranscriptionPanel.tsx, consultationRecorder.ts,
consultationScribe.ts, transcriptionWorkspace.ts}`.

## 3. Puesta a punto en la laptop nueva

### 3.1 Obtener el código
```bash
git clone git@github.com:ZhadowIA/sistema-midoc.git
cd sistema-midoc
git checkout v2/paso22-diarizacion-local
git pull
```
> Requiere tener la **clave SSH** de GitHub configurada en la laptop (o usar HTTPS
> con token). Sin eso, el `clone`/`pull`/`push` fallará.

### 3.2 Toolchain de build del desktop (Windows) — lo más delicado
La app de escritorio (Tauri 2 + Rust + SQLCipher + Whisper) necesita:

- **Rust** (rustup, toolchain **MSVC**).
- **Visual Studio Build Tools 2022** con la carga de trabajo **C++ (Desktop development)**.
- **CMake**.
- **LLVM / libclang** (para los bindings nativos).
- **Strawberry Perl** y **NASM** — solo para compilar OpenSSL/SQLCipher la primera vez.
- **(Opcional, solo NVIDIA)** CUDA Toolkit, para los comandos `:cuda`.

Sin estos, `npm run tauri:dev` falla al compilar la capa Rust.

### 3.3 Instalar dependencias y correr
```bash
# Portal (cloud)
cd V2/consultorio-app
npm install
npm run dev            # necesita Postgres; ver variables de entorno del portal

# Desktop (app del médico)
cd ../desktop-app
npm install
npm run tauri:dev      # app con Whisper local (CPU)
# npm run tauri:dev:cuda   # si la laptop tiene GPU NVIDIA
```

### 3.4 Modelos de IA (Whisper + diarización)
- **No están en el repo.** Se descargan **desde dentro de la app** (comandos
  `download_transcription_model` y `download_diarization_model`) hacia el app data
  dir: `%APPDATA%/com.midoc.app/`.
- Al abrir la app por primera vez en la laptop, descarga el modelo de Whisper y los
  dos ONNX de diarización (segmentación + embedding) desde la UI. Hasta entonces, la
  transcripción guía a descargarlos y la diarización degrada sin separar hablantes.

### 3.5 Base de datos local
- Vive cifrada en `%APPDATA%/com.midoc.app/midoc.db` (SQLCipher).
- **Es local a cada equipo: no se sincroniza por git.** En la laptop empiezas con una
  base nueva (se crea al desbloquear con tu frase de seguridad). No hay datos clínicos
  que transferir salvo que copies manualmente un respaldo (`.../backups/`).

## 4. Comprobaciones antes de seguir programando

```bash
# Desktop frontend
cd V2/desktop-app
npm run build          # typecheck + build
npm test               # tests del frontend (Vitest)

cd src-tauri
cargo test             # capa Rust (cifrado, migraciones, etc.)
cargo clippy           # lint Rust

# Portal
cd ../../consultorio-app
npm run lint
npm run test
```

## 5. Reglas que siguen aplicando (recordatorio)
- Mandatorio leer `V2/REGLAS_DESARROLLO.md` y `V2/10_linea_de_desarrollo.md`.
- Nunca persistir contenido clínico en la nube, logs ni telemetría — solo IDs.
- El portal usa **Next.js 16** (breaking changes): consultar
  `V2/consultorio-app/node_modules/next/dist/docs/` antes de escribir código Next.
- Sin tests + lint/tipos en verde + docs actualizadas, ningún feature está "done".

## 6. Pendiente / próximos pasos
- Cerrar paso 22 (diarización local) y abrir PR de esta rama hacia `dev`.
- Continuar 11/12 en progreso.
- Pasos 16–17 pendientes.
