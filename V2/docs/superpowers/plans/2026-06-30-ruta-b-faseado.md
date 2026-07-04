# Ruta B — Plan de implementación faseado (transcripción OpenAI gobernada por el portal)

Fecha: 2026-06-30
Estado: F1+F2+F3 completas y mergeadas a dev; F4 casi completa (lógica + UI listas, PR #32 draft en `v2/paso15-diarizacion-nube`), falta solo la activación externa (BAA/ZDR en staging)
Superficies: `V2/desktop-app`, `V2/consultorio-app`
Pasos línea de desarrollo: 15 ext. (respaldo nube gobernado) → 16 (activación staging con BAA/ZDR)

> Este documento es la **capa de orquestación** sobre el plan task-by-task
> [`2026-06-18-openai-cloud-transcription.md`](./2026-06-18-openai-cloud-transcription.md).
> No reemplaza las tareas: las agrupa en fases entregables e independientemente
> mergeables a `dev`, respetando la regla de "rama corta por unidad de trabajo"
> ([REGLAS_DESARROLLO.md §7](../../REGLAS_DESARROLLO.md)).

## Decisión de fondo (por qué Ruta B y no el adaptador directo)

- La clave de proveedor NO se hornea en el binario (extraíble) — el diseño ya
  descartó ese anti-patrón.
- El cobro por créditos (`ceil(s/900)` estándar, `ceil(s/600)` diarizado) solo
  es posible si el portal media la llamada y mide la duración autoritativa.
- El multi-proveedor (RF41) se centraliza en el portal: agregar Deepgram u otro
  proveedor no requiere recompilar la app de escritorio.

## Multi-proveedor en dos niveles

| Nivel | Abstracción | Intercambiable |
|---|---|---|
| Desktop (Rust) | `trait TranscriptionProvider` | Whisper local ↔ Portal |
| Portal (TS) | Interfaz de proveedor de nube inyectable | OpenAI ↔ Deepgram ↔ HealthScribe… |

Decisión abierta para F1: introducir una interfaz `CloudTranscriptionProvider`
en el portal (OpenAI como primera implementación) en lugar de acoplar a un único
`openai-transcription-provider.ts`, para que el multi-proveedor sea pluggable
desde el día uno.

## Principio rector

Cada fase termina en estado **mergeable a `dev` y verificable**. OpenAI real NO
se llama hasta F4 (todo contra proveedor *fake*). El audio nunca toca disco; el
contenido clínico nunca se persiste en el portal.

## Las 4 fases

| Fase | Alcance | Tareas base | Superficie | Branch sugerido |
|---|---|---|---|---|
| **F1 · Portal: cimientos puros** | Fórmulas de crédito por modo, gate de entorno BAA/ZDR, parser WAV autoritativo, contrato del proveedor (estándar + diarizado) — unidad, sin red | 1, 2, 3, 4 | `consultorio-app` | `v2/paso15-nube-cimientos` |
| **F2 · Portal: servicio + endpoint** | Servicio gobernado (idempotencia `(doctorId, runId)`, reserva, finalización de crédito), route handler multipart autenticado, protección del crédito autoritativo en sync | 5 | `consultorio-app` | `v2/paso15-nube-endpoint` |
| **F3 · Desktop: cliente del portal (estándar)** | Reemplazar `cloud_transcription.rs` por cliente del portal (token + `runId`), borrador SQLite cifrado, eliminar `MIDOC_CLOUD_STT_*`, selector local / nube estándar | 6 + parte de 7 | `desktop-app` | `v2/paso15-desktop-cliente-nube` |
| **F4 · Diarización + activación** | Mapeo hablantes anónimos → turnos, gate de roles antes de Gemini, tercer modo del selector, docs, y activación real con BAA/ZDR en staging | resto de 7, 8 | ambas | `v2/paso15-diarizacion-ui` + `v2/paso16-activacion-staging` |

## Por qué este orden

1. El portal construye AMBOS modos desde F1 (es más barato construir el contrato
   completo una vez, testeado con fake) y se gobierna la *exposición* desde el
   desktop/UI.
2. El portal va antes que el desktop: el desktop consume un contrato HTTP que
   debe estar estable.
3. La diarización se separa al final: el valor mínimo viable (estándar en nube)
   ya se entregó en F3.
4. La activación real es lo último y depende de algo que NO es código: BAA
   firmado + ZDR verificado.

## Gates de salida por fase (Definition of Done)

| Fase | Verificación obligatoria |
|---|---|
| F1 | `npm run test/lint/build` verde; tests rojo→verde por fórmula; env rechaza sin ZDR; WAV inválido no calcula duración |
| F2 | Integración con fake: 900s→1, 901s→2, 600s(diar)→1; reintento mismo `runId`→sin doble cobro; fallo→`FAILED` 0 créditos; DB sin audio ni transcript; migración desde cero y sobre base existente |
| F3 | `cargo test` + `cargo clippy --all-targets -D warnings` + `npm run build`; Whisper local intacto; camino de fallo de red probado; migración SQLCipher forward-only desde cero y sobre base existente |
| F4 | Gate de roles impide acomodar sin asignar; `rg` confirma texto/segmentos solo en request/response transitorio; prueba manual con OpenAI real solo en staging con BAA/ZDR + audio autorizado |

## Riesgos y mitigaciones

| Riesgo | Fase | Mitigación |
|---|---|---|
| Next.js 16 rompe convenciones de Route Handlers / `request.formData()` | F2 | Consultar `node_modules/next/dist/docs/` antes de escribir el handler (REGLAS §10) |
| Carrera de idempotencia con `runId` concurrente | F2 | Constraint único `(doctorId, externalRunId)` + reserva antes de llamar al proveedor |
| Cambiar `TRANSCRIPTION` de crédito fijo rompe usos existentes | F1 | Catálogo fijo intacto para usos no-transcripción; cobro de nube solo del servicio autoritativo |
| Migraciones (Prisma + SQLCipher) sobre base existente | F1/F3 | Probar ambos sentidos; SQLCipher forward-only |
| BAA/ZDR es bloqueante externo, no código | F4 | F4 se planifica pero no se activa hasta verificación humana/documental del contrato |
| Audio fuera del equipo = único punto donde sale PHI | F2-F4 | Endpoint sin logs de cuerpo, sin colas, sin object storage; nombre neutro `consultation.wav`; consentimiento validado localmente |

## Camino crítico

F1 → F2 → F3 entregan transcripción estándar en nube usable (en staging).
F4 agrega diarización y producción. F1+F2+F3 son 100% código y testeables sin
terceros; solo F4 depende del BAA.

## Estado de ejecución

- [x] F1 · Tarea 1 — fórmulas de crédito por modo + esquema operativo (7/7 tests verde; migración `20260630140000_cloud_transcription_usage`)
- [x] F1 · Tarea 2 — gate de entorno BAA/ZDR (5/5 tests verde; esquema separado en `env-schema.ts` para testeabilidad sin secretos)
- [x] F1 · Tarea 3 — parser WAV autoritativo (6/6 tests verde; `audio-duration.ts` puro, recorre sub-chunks RIFF, rechaza no-PCM/vacío/truncado)
- [x] F1 · Tarea 4 — contrato del proveedor (7/7 tests verde; interfaz pluggable `CloudTranscriptionProvider` + `OpenAiTranscriptionProvider` con transporte inyectable)
- [x] **F1 COMPLETA** — 25/25 tests verde, 0 errores de tipos en `src`. Decisión aplicada: multi-proveedor pluggable en el portal desde el día uno.
- [x] **F2 COMPLETA** — 10/10 integración + 4 unit del factory verde; `tsc` 0 errores en `src`; lint limpio.
  - [x] Servicio gobernado `cloud-transcription-service.ts`: gate de capacidad (403), duración autoritativa WAV (422), reserva idempotente `(doctorId, runId)` PENDING→COMPLETED/FAILED, mismo runId otro modo→409, retry sin doble cobro, sin persistir texto/audio.
  - [x] Route handler `POST /api/sync/ai/transcriptions` (Next 16 `request.formData()`, `runtime=nodejs`, `maxDuration=120`, límites 25 MiB/WAV) + factory `resolveOpenAiTranscriptionProvider` env-gated (403 sin ZDR/key).
  - [x] Protección de crédito autoritativo en `recordAiUsageBatch`: fila con `transcriptionMode` solo actualiza revisión; `whisper-local*`→0 créditos.
  - Nota: 1 test preexistente de sync (`charges plan credits...`) falla solo por frontera de mes UTC (hardcodea junio 2026); ajeno a F2.
- [x] **F3 COMPLETA** — 195 cargo tests + 25 node tests verde; clippy limpio en archivos tocados (11 lints restantes preexistentes en `ai.rs`/`operations.rs`). 5 ciclos TDD:
  - [x] `parse_portal_response` + `PortalTranscriptionResult`/`PortalSegment` (parser puro de la respuesta del endpoint de F2).
  - [x] `PortalTranscriptionProvider` (reemplaza el adaptador Deepgram): multipart `bearer_auth(device_token)` + `runId` + `mode` a `{server_url}/api/sync/ai/transcriptions`; solo campos aprobados, nombre neutro. Feature `multipart` de reqwest.
  - [x] Wiring en `lib.rs`: `ai_transcribe_audio` construye el provider desde el estado de sync cifrado (`server_url`+`device_token`); eliminado `CloudConfig`/`CloudTranscriptionProvider`/`MIDOC_CLOUD_STT_*`.
  - [x] Migración forward-only en `db.rs`: `ai_runs` + `transcription_mode`/`duration_seconds`/`credit_cost`/`segments_json`.
  - [x] Flujo de metadata: `AiResponse`+`CloudTranscriptionMeta`; `record_transcription_run` reusa el `runId` autoritativo del portal y persiste el borrador cifrado.
  - Nota: F3 cubre el modo estándar; el toggle local/nube ya existía y rutea al portal. Selector de 3 modos + estimación de créditos + deshabilitar-sin-vínculo van en F4/polish.
- [~] F4 CASI COMPLETA — lógica pura + plumbing Rust + UI listos (12 node + 198 cargo tests verde; clippy limpio en tocados). Falta solo la activación externa.
  - [x] `diarizedSegmentsToTurns` (consultationScribe.ts): hablantes anónimos del portal (`speaker_0`) → "Hablante N" con rol `UNASSIGNED`, sin asumir roles. Tipos `DiarizedSpeakerRole`/`DiarizedSegment`/`DiarizedSpeaker`/`DiarizedTurn`/`DiarizedReview`.
  - [x] Gate de roles: `assignDiarizedRole` (inmutable) + `diarizedRolesResolved` (todo hablante con texto debe tener rol; ignora hablantes vacíos).
  - [x] Rust: `ai_transcribe_audio` acepta `mode: Option<String>` (`standard`/`diarized`, default standard) y lo pasa al `PortalTranscriptionProvider`.
  - [x] **Decisión de producto (2026-07-01):** Acompañante/Otro NO colapsan a Paciente — `ConsultationTurn`/`ScribeSpeaker` se extendieron a los 4 roles en TS y Rust (antes solo Medico/Paciente). Tocado: `validate_consultation_turns` (ai.rs, usado por `save_reviewed_transcription` y `structure_consultation`), `ScribeSpeaker` type + `diarizedReviewToConsultationTurns` (consultationScribe.ts), selects de rol por turno (4 opciones), y se corrigió `swapScribeRoles` (antes mapeaba cualquier turno no-MEDICO a MEDICO, lo que habría corrompido turnos de Acompañante/Otro).
  - [x] Rust: `TranscriptionDraft` ahora expone `segments_json` en la respuesta de `ai_transcribe_audio` (antes solo se persistía en `ai_runs`, no viajaba al frontend); poblado desde `CloudTranscriptionMeta` en `transcribe_audio`.
  - [x] **UI (ciclo 4)**: selector de 3 modos (`local`/`cloud_standard`/`cloud_diarized`, `TranscriptionMode` en `transcriptionWorkspace.ts`) en `ConsultationTranscriptionPanel.tsx`/`Atencion.tsx`; `segments_json` del borrador se mapea a `DiarizedReview` (`diarizedSegmentsToTurns`); render de asignación de roles por hablante (select por hablante, propaga a sus turnos); "Marcar como revisada" bloqueado (`rolesResolved` en `deriveTranscriptionView`) hasta `diarizedRolesResolved`, lo que gatea indirectamente "Acomodar en plantilla" (ya dependía de `reviewedTranscription`); `mode:"diarized"` se pasa al comando; mock `ipc.ts` diarizado con diálogo de demostración para browser-dev. Verificado en navegador (vite dev + mock): flujo completo audio→2 hablantes anónimos→asignación Medico/Paciente→auto-transición al editor de turnos→"Marcar como revisada"→"Ayuda IA" pasa de "pendiente" a "lista", sin errores de consola.
  - [x] Docs: `10_linea_de_desarrollo.md` (sección "Extension (Ruta B)" reemplaza la narrativa obsoleta de la rebanada 3) + `catalogo-comercial-planes-ia-2026-06.md` (nota técnica con las fórmulas de crédito; se dejó explícitamente pendiente de decisión de negocio si "transcripción local: 1 crédito" se mantiene como cobro comercial pese a costar `0` técnicamente).
  - [ ] ⚠️ Externo (no código): activación real con BAA firmado + ZDR verificado en staging. NOTA: el gate `OPENAI_TRANSCRIPTION_ZDR_APPROVED` es auto-declarado (evita activación accidental); no hay verificación técnica con OpenAI — la barrera es legal (BAA) + config de la cuenta OpenAI (ZDR).
