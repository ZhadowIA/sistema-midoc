# Contexto de trabajo — continuar desde otro equipo

> Documento de handoff para retomar el desarrollo de **Sistema MiDoc V2** en otro
> equipo. Última actualización: 2026-10-09.

## 1. Estado actual del repo

- **Remoto:** `git@github.com:ZhadowIA/sistema-midoc.git` (repositorio **público**:
  nunca commitear llaves, `.env*` ni datos de pacientes).
- **Rama más reciente:** `v2/paso30-pasarela-ia` — todo lo trabajado está commiteado
  y subido.
- Flujo git: ramas cortas `v2/<paso>-<desc>`, PR hacia `dev`; `main` solo recibe
  merges validados desde `dev`.

### Dónde quedamos
- Pasos **27, 28 y 29 terminados**; **paso 30 (pasarela de IA) con código listo**.
- Lo que falta del paso 30: validarlo en staging con un proveedor real (firmar
  BAA/ZDR, `AI_GATEWAY_PROVIDER` con clave real, consulta asistida de punta a punta)
  y después retirar de la app los proveedores directos (`MIDOC_GEMINI_*`,
  `MIDOC_OPENAI_*`).
- **Siguiente paso de la línea:** 31 (copiloto longitudinal). Ver
  `10_linea_de_desarrollo.md`.

### Pila de PRs abiertos (mergear en este orden)
Cada uno tiene como base el anterior; al mergear uno, el siguiente se retargetea a `dev`.

| PR | Rama | Contenido |
|----|------|-----------|
| #46 | `v2/paso28-expediente-calidad` | paso 28 r1, documentos locales |
| #47 | `v2/paso28-cie10` | r2, CIE-10 |
| #48 | `v2/paso28-busqueda` | r3, búsqueda |
| #49 | `v2/paso28-pdf` | r4, PDF + docs del modelo de negocio |
| #50 | `v2/paso28-fhir` | r5, FHIR R4 |
| #51 | `v2/paso28-csv` | r6, CSV (cierra paso 28) |
| #52 | `v2/paso29-licencia` | paso 29 r1-r2, licencia firmada |
| #53 | `v2/paso29-creditos` | r3, créditos de IA |
| #55 | `v2/paso29-cuenta` | r4, cuenta y saldo |
| #56 | `v2/paso29-actualizaciones` | r5, actualizaciones (cierra paso 29) |
| nuevo | `v2/retirar-suscripcion` | retiro de la suscripción del alcance activo |
| nuevo | `v2/paso30-pasarela-ia` | paso 30, pasarela de IA de texto |

Aparte, **#54** `v2/fix-arco-cancelacion` → `dev` (fix de la cancelación ARCO; al
integrar la pila hay que quitar su entrada abierta de `PENDIENTES.md`) y **#41**
(odontograma doble vista, antiguo).

### Paso 30 en breve
- Portal: `POST /api/sync/ai/generate` y `GET /api/sync/ai/gateway`;
  `text-gateway-service.ts` cobra créditos antes de llamar al proveedor, es
  idempotente por `runId` y devuelve el cobro si falla. Códigos
  `PROVIDER_OVERLOADED` / `PROVIDER_REJECTED` / `GATEWAY_DISABLED`. Configuración:
  `AI_GATEWAY_PROVIDER` (`none|fake|gemini|openai`), `AI_GATEWAY_MODELS`,
  `AI_GATEWAY_BAA_APPROVED`.
- App: `GatewayProvider` en `ai.rs`, estado `ai_gateway` en `sync_state`,
  `resolve_text_registry(&state, …)`.

### Ramas de respaldo (`backup/*`)
Trabajo local que no tenía remoto, subido solo para no perderlo. No son para
mergear tal cual:
- `backup/preconsulta-por-servicio` — preconsulta por servicio (congelada) + menú de
  configuración de cuatro secciones. Decisión pendiente en `PENDIENTES.md`.
- `backup/stash-odontograma-svg-spike` — WIP del spike SVG del odontograma (era un stash).
- `backup/codex-paso16-openai-transcription-impl`, `backup/paso4-estacion-modos`,
  `backup/paso7-whatsapp-twilio` — experimentos antiguos.

## 2. Puesta a punto en el equipo nuevo

### 2.1 Código
```bash
git clone git@github.com:ZhadowIA/sistema-midoc.git
cd sistema-midoc
git checkout v2/paso30-pasarela-ia
```
Requiere la clave SSH de GitHub (o HTTPS con token).

### 2.2 Toolchain del desktop (Windows)
Rust (rustup, MSVC), Visual Studio Build Tools 2022 (C++), CMake, LLVM/libclang,
Strawberry Perl y NASM. `cargo test` necesita **OpenSSL MSVC**
(`C:\Program Files\OpenSSL-Win64`) con un `.cargo/config.toml` local que defina
`OPENSSL_DIR`, `OPENSSL_LIB_DIR` y `OPENSSL_INCLUDE_DIR`, y el `bin` de OpenSSL en el
PATH. CUDA Toolkit solo para los comandos `:cuda`.

### 2.3 Secretos locales (no están en git)
- `V2/consultorio-app/.env.local` y `V2/desktop-app/src-tauri/.env` son locales.
  En un equipo nuevo hay que crear una llave de licencias de desarrollo:
  `npm run license:keygen` (portal), copiar la pública a `MIDOC_LICENSE_PUBKEYS` del
  desktop, y otorgar licencia/créditos con `npm run license:grant -- <correo>` y
  `npm run credits:grant`.
- PostgreSQL local para el portal; `npm run env:check` dice qué falta.

### 2.4 Correr
```bash
cd V2/consultorio-app && npm install && npm run db:migrate:dev && npm run dev
cd V2/desktop-app && npm install && npm run tauri:dev
```
Modelos de Whisper y diarización se descargan desde la app. La base local cifrada
(`%APPDATA%/com.midoc.app/`) es propia de cada equipo.

## 3. Comprobaciones antes de seguir
```bash
cd V2/desktop-app && npm run build && npm test
cd V2/desktop-app/src-tauri && cargo test && cargo clippy --all-targets
cd V2/consultorio-app && npm run lint && npm run test
```
Las pruebas de integración del portal corren secuencialmente y chocan con
`npm run dev` abierto.

## 4. Lectura obligatoria
`CLAUDE.md`, `V2/14_reenfoque_expediente_ia.md`, `V2/15_modelo_de_negocio.md`,
`V2/REGLAS_DESARROLLO.md`, `V2/10_linea_de_desarrollo.md` y `V2/PENDIENTES.md`
(lista viva; todo lo no resuelto va ahí con fecha y origen). Nunca persistir
contenido clínico en la nube, logs ni telemetría. Commits sin co-autor de IA.
