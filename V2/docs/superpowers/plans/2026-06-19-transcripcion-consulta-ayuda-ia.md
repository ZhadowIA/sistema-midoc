# Transcripción consulta y Ayuda IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar la sección de transcripción como un flujo exclusivo de captura y revisión, y mover la generación de propuestas clínicas a una `Ayuda IA` persistente en la columna derecha de la Estación Clínica.

**Architecture:** La implementación se divide en dos fases que funcionan de manera independiente. Primero se crea un borrador de transcripción revisable y persistente en SQLite cifrado, con una UI central de tres áreas. Después se agrega un comando de ayuda clínica tipado que consume únicamente una transcripción revisada, antecedentes, preconsulta y plantilla activa; sus resultados se muestran y aplican manualmente desde la columna derecha permanente.

**Tech Stack:** React 19, TypeScript estricto, CSS existente, Tauri 2, Rust, rusqlite/SQLCipher, serde/serde_json, pruebas `node:test` y `cargo test`.

---

## Mapa de archivos

### Archivos nuevos

- `V2/desktop-app/src/transcriptionWorkspace.ts`
  - Estados derivados, etiquetas y reglas puras de habilitación de la transcripción.
- `V2/desktop-app/src/transcriptionWorkspace.test.ts`
  - Pruebas de estados por lotes, revisión y disponibilidad de Ayuda IA.
- `V2/desktop-app/src/TranscriptionWorkspace.tsx`
  - Las tres áreas centrales: captura, configuración y transcripción.
- `V2/desktop-app/src/clinicalAid.ts`
  - Tipos de resultado, etiquetas Alta/Media/Baja y aplicación pura de SOAP/segmentos.
- `V2/desktop-app/src/clinicalAid.test.ts`
  - Pruebas de niveles, fuentes y aplicación explícita.
- `V2/desktop-app/src/ClinicalAidRail.tsx`
  - Cabecera `Ayuda IA`, fuentes, estados y resultados en la columna derecha.

### Archivos modificados

- `V2/desktop-app/src/encounterModes.ts`
  - Cambiar la etiqueta visible de la sección.
- `V2/desktop-app/src/Atencion.tsx`
  - Orquestar grabación, revisión, persistencia, generación y aplicación.
- `V2/desktop-app/src/App.css`
  - Layout de tres áreas, columna derecha y adaptación responsiva.
- `V2/desktop-app/src/ipc.ts`
  - Mock de navegador para transcripción revisada y Ayuda IA.
- `V2/desktop-app/src-tauri/src/db.rs`
  - Migración local para conservar la transcripción corregida/revisada.
- `V2/desktop-app/src-tauri/src/ai.rs`
  - Persistencia de revisión y nuevo contrato tipado de ayuda clínica.
- `V2/desktop-app/src-tauri/src/lib.rs`
  - Comandos Tauri y registro.
- `V2/10_linea_de_desarrollo.md`
  - Documentar la separación de responsabilidades y su verificación.

No se agregan dependencias.

---

## Fase 1: Transcripción consulta

### Task 1: Renombrar la sección y definir sus estados puros

**Files:**
- Create: `V2/desktop-app/src/transcriptionWorkspace.ts`
- Create: `V2/desktop-app/src/transcriptionWorkspace.test.ts`
- Modify: `V2/desktop-app/src/encounterModes.ts`

- [ ] **Step 1: Escribir las pruebas que fijan la etiqueta y los estados**

Crear `transcriptionWorkspace.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildEncounterModes } from "./encounterModes.ts";
import {
  deriveTranscriptionView,
  type TranscriptionWorkspaceInput
} from "./transcriptionWorkspace.ts";

const base: TranscriptionWorkspaceInput = {
  voiceConsent: true,
  recordingState: "idle",
  processing: false,
  hasTranscript: false,
  reviewed: false,
  streamingSupported: false
};

test("renombra la sección como Transcripción consulta", () => {
  const modes = buildEncounterModes({
    hasPreconsulta: true,
    hasHistory: false,
    signed: false,
    moduleLabel: "Medicina general / familiar"
  });
  assert.equal(modes.find((mode) => mode.id === "ia")?.label, "Transcripción consulta");
});

test("explica que el texto aparecerá al finalizar cuando no existe streaming", () => {
  assert.equal(
    deriveTranscriptionView(base).transcriptMessage,
    "La transcripción aparecerá al finalizar la grabación."
  );
});

test("habilita revisión después de recibir texto y Ayuda IA después de revisarlo", () => {
  assert.equal(
    deriveTranscriptionView({ ...base, hasTranscript: true }).canMarkReviewed,
    true
  );
  assert.equal(
    deriveTranscriptionView({ ...base, hasTranscript: true, reviewed: true })
      .canUseClinicalAid,
    true
  );
});

test("no presenta capacidad casi en vivo como streaming real", () => {
  const view = deriveTranscriptionView({
    ...base,
    realtimeCapable: true,
    streamingSupported: false
  });
  assert.equal(view.transcriptStatus, "Por lotes");
  assert.equal(view.transcriptMessage, "La transcripción aparecerá al finalizar la grabación.");
});
```

- [ ] **Step 2: Ejecutar la prueba para confirmar el fallo**

Run:

```powershell
cd V2/desktop-app
npm run test
```

Expected: FAIL porque `transcriptionWorkspace.ts` no existe y la etiqueta todavía es `Asistencia de IA`.

- [ ] **Step 3: Implementar el modelo de presentación mínimo**

Crear `transcriptionWorkspace.ts`:

```ts
export type RecordingState = "idle" | "recording" | "paused" | "stopping";

export interface TranscriptionWorkspaceInput {
  voiceConsent: boolean;
  recordingState: RecordingState;
  processing: boolean;
  hasTranscript: boolean;
  reviewed: boolean;
  streamingSupported: boolean;
  realtimeCapable?: boolean;
}

export interface TranscriptionWorkspaceView {
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canStop: boolean;
  canMarkReviewed: boolean;
  canUseClinicalAid: boolean;
  transcriptStatus: "En vivo" | "Por lotes" | "Lista para revisar" | "Revisada";
  transcriptMessage: string;
}

export function deriveTranscriptionView(
  input: TranscriptionWorkspaceInput
): TranscriptionWorkspaceView {
  const canMarkReviewed = input.hasTranscript && !input.reviewed && !input.processing;
  const canUseClinicalAid = input.hasTranscript && input.reviewed;
  const transcriptStatus = input.reviewed
    ? "Revisada"
    : input.hasTranscript
      ? "Lista para revisar"
      : input.streamingSupported && input.recordingState === "recording"
        ? "En vivo"
        : "Por lotes";

  return {
    canStart:
      input.voiceConsent &&
      input.recordingState === "idle" &&
      !input.processing,
    canPause: input.recordingState === "recording",
    canResume: input.recordingState === "paused",
    canStop:
      input.recordingState === "recording" ||
      input.recordingState === "paused",
    canMarkReviewed,
    canUseClinicalAid,
    transcriptStatus,
    transcriptMessage:
      input.streamingSupported && input.recordingState === "recording"
        ? "La transcripción se actualizará durante la grabación."
        : input.hasTranscript
          ? "Revisa el texto y los hablantes antes de marcarla como lista."
          : "La transcripción aparecerá al finalizar la grabación."
  };
}
```

Cambiar en `encounterModes.ts`:

```ts
if (!signed) modes.push({ id: "ia", label: "Transcripción consulta" });
```

- [ ] **Step 4: Ejecutar las pruebas**

Run:

```powershell
npm run test
```

Expected: todas las pruebas TypeScript PASS.

- [ ] **Step 5: Commit**

```powershell
git add V2/desktop-app/src/encounterModes.ts V2/desktop-app/src/transcriptionWorkspace.ts V2/desktop-app/src/transcriptionWorkspace.test.ts
git commit -m "feat: definir estados de transcripcion consulta"
```

---

### Task 2: Persistir la transcripción corregida y revisada

**Files:**
- Modify: `V2/desktop-app/src-tauri/src/db.rs`
- Modify: `V2/desktop-app/src-tauri/src/ai.rs`

- [ ] **Step 1: Agregar pruebas Rust para migración y residencia**

En las pruebas de `db.rs`, agregar:

```rust
#[test]
fn reviewed_transcriptions_are_local_clinical_records() {
    let path = temp_db_path("reviewed-transcriptions");
    let conn = open_encrypted(&path, "clave-correcta").unwrap();
    let columns: Vec<String> = {
        let mut stmt = conn
            .prepare("PRAGMA table_info(consultation_transcriptions)")
            .unwrap();
        stmt.query_map([], |row| row.get(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    };
    assert_eq!(
        columns,
        vec![
            "id",
            "encounter_id",
            "run_id",
            "transcript_text",
            "turns_json",
            "status",
            "created_at",
            "reviewed_at"
        ]
    );
}
```

En las pruebas de `ai.rs`, agregar:

```rust
#[test]
fn saves_and_reads_reviewed_transcription_without_audio() {
    let conn = test_conn("reviewed-transcription");
    let (encounter_id, patient_id) = seed_encounter(&conn);
    grant_consent(&conn, &patient_id, SCOPE_VOICE_TRANSCRIPTION).unwrap();
    let provider = FakeTranscriptionProvider::new("fake-transcriptor");
    let draft = transcribe_audio(
        &conn,
        &encounter_id,
        AudioInput {
            file_name: Some("consulta.wav".into()),
            media_type: "audio/wav".into(),
            bytes: vec![1, 2, 3],
            duration_seconds: Some(20),
        },
        &provider,
    )
    .unwrap();

    let reviewed = save_reviewed_transcription(
        &conn,
        &encounter_id,
        &draft.run_id,
        vec![ConsultationTurn {
            id: "turn-1".into(),
            speaker: "MEDICO".into(),
            text: "¿Desde cuándo?".into(),
        }],
    )
    .unwrap();

    assert_eq!(reviewed.status, "REVIEWED");
    assert_eq!(reviewed.turns.len(), 1);
    assert_eq!(
        latest_reviewed_transcription(&conn, &encounter_id)
            .unwrap()
            .unwrap()
            .run_id,
        draft.run_id
    );

    let stored: String = conn
        .query_row(
            "SELECT turns_json FROM consultation_transcriptions WHERE run_id = ?1",
            params![draft.run_id],
            |row| row.get(0),
        )
        .unwrap();
    assert!(!stored.contains("audioBase64"));
}
```

- [ ] **Step 2: Ejecutar las pruebas para confirmar el fallo**

Run:

```powershell
cd V2/desktop-app/src-tauri
cargo test reviewed_transcription
```

Expected: FAIL porque la tabla y las funciones todavía no existen.

- [ ] **Step 3: Agregar la migración transaccional**

Añadir al final de `MIGRATIONS` en `db.rs`:

```rust
// Transcripción corregida y revisada por el médico. Clase CLINICO: solo vive
// en SQLite cifrado local. No contiene audio, únicamente texto y turnos.
"CREATE TABLE consultation_transcriptions (
    id TEXT PRIMARY KEY NOT NULL,
    encounter_id TEXT NOT NULL REFERENCES encounters(id),
    run_id TEXT NOT NULL UNIQUE REFERENCES ai_runs(id),
    transcript_text TEXT NOT NULL,
    turns_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'REVIEWED',
    created_at TEXT NOT NULL,
    reviewed_at TEXT NOT NULL
);
CREATE INDEX idx_consultation_transcriptions_encounter
    ON consultation_transcriptions(encounter_id, reviewed_at DESC);",
```

- [ ] **Step 4: Implementar el contrato de transcripción revisada**

En `ai.rs`, agregar:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewedTranscription {
    pub id: String,
    pub encounter_id: String,
    pub run_id: String,
    pub transcript_text: String,
    pub turns: Vec<ConsultationTurn>,
    pub status: String,
    pub created_at: String,
    pub reviewed_at: String,
}

fn validate_reviewed_turns(
    turns: Vec<ConsultationTurn>,
) -> Result<Vec<ConsultationTurn>, AiError> {
    let turns = validate_consultation_turns(&turns)?;
    if turns.is_empty() {
        return Err(AiError::Invalid(
            "la transcripcion revisada necesita al menos un turno".into(),
        ));
    }
    Ok(turns)
}

pub fn save_reviewed_transcription(
    conn: &Connection,
    encounter_id: &str,
    run_id: &str,
    turns: Vec<ConsultationTurn>,
) -> Result<ReviewedTranscription, AiError> {
    let run = read_run(conn, run_id)?;
    if run.encounter_id.as_deref() != Some(encounter_id)
        || run.usage_type != USAGE_TRANSCRIPTION
        || run.status != "DRAFT"
    {
        return Err(AiError::Invalid(
            "el borrador de transcripcion no puede revisarse".into(),
        ));
    }

    let turns = validate_reviewed_turns(turns)?;
    let transcript_text = turns
        .iter()
        .map(|turn| format!("{}: {}", turn.speaker, turn.text))
        .collect::<Vec<_>>()
        .join("\n");
    let turns_json = serde_json::to_string(&turns)
        .map_err(|error| AiError::Invalid(format!("turnos invalidos: {error}")))?;
    let id = uuid::Uuid::new_v4().to_string();
    let reviewed_at = now();

    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO consultation_transcriptions
            (id, encounter_id, run_id, transcript_text, turns_json, status, created_at, reviewed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'REVIEWED', ?6, ?6)",
        params![id, encounter_id, run_id, transcript_text, turns_json, reviewed_at],
    )?;
    review_run(&tx, run_id, "APPROVED", None)?;
    tx.commit()?;

    Ok(ReviewedTranscription {
        id,
        encounter_id: encounter_id.into(),
        run_id: run_id.into(),
        transcript_text,
        turns,
        status: "REVIEWED".into(),
        created_at: reviewed_at.clone(),
        reviewed_at,
    })
}
```

Implementar `latest_reviewed_transcription` consultando por
`encounter_id`, `status = 'REVIEWED'`, orden `reviewed_at DESC LIMIT 1`, y
deserializando `turns_json` a `Vec<ConsultationTurn>`.

- [ ] **Step 5: Ejecutar pruebas Rust**

Run:

```powershell
cargo test reviewed_transcription
cargo test db::
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add V2/desktop-app/src-tauri/src/db.rs V2/desktop-app/src-tauri/src/ai.rs
git commit -m "feat: persistir transcripcion revisada localmente"
```

---

### Task 3: Exponer revisión y recuperación por IPC

**Files:**
- Modify: `V2/desktop-app/src-tauri/src/lib.rs`
- Modify: `V2/desktop-app/src/ipc.ts`

- [ ] **Step 1: Agregar comandos Tauri**

En `lib.rs`:

```rust
#[tauri::command]
fn ai_save_reviewed_transcription(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    run_id: String,
    turns: Vec<ai::ConsultationTurn>,
) -> Result<ai::ReviewedTranscription, String> {
    with_ai(&state, |conn| {
        ai::save_reviewed_transcription(conn, &encounter_id, &run_id, turns)
    })
}

#[tauri::command]
fn ai_latest_reviewed_transcription(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
) -> Result<Option<ai::ReviewedTranscription>, String> {
    with_ai(&state, |conn| {
        ai::latest_reviewed_transcription(conn, &encounter_id)
    })
}
```

Registrar ambos comandos junto a `ai_transcribe_audio`.

- [ ] **Step 2: Agregar estado y casos al mock de navegador**

Añadir a `mockState`:

```ts
reviewedTranscriptions: {} as Record<
  string,
  {
    id: string;
    encounter_id: string;
    run_id: string;
    transcript_text: string;
    turns: Array<{ id: string; speaker: "MEDICO" | "PACIENTE"; text: string }>;
    status: "REVIEWED";
    created_at: string;
    reviewed_at: string;
  }
>,
```

Agregar casos:

```ts
case "ai_save_reviewed_transcription": {
  const encounterId = String(args?.encounterId ?? "");
  const runId = String(args?.runId ?? "");
  const turns = (args?.turns ?? []) as Array<{
    id: string;
    speaker: "MEDICO" | "PACIENTE";
    text: string;
  }>;
  if (!encounterId || !runId || turns.every((turn) => !turn.text.trim())) {
    throw "la transcripcion revisada necesita texto";
  }
  const reviewedAt = new Date().toISOString();
  const value = {
    id: `reviewed-${runId}`,
    encounter_id: encounterId,
    run_id: runId,
    transcript_text: turns.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n"),
    turns,
    status: "REVIEWED" as const,
    created_at: reviewedAt,
    reviewed_at: reviewedAt
  };
  mockState.reviewedTranscriptions[encounterId] = value;
  const run = mockState.aiRuns.find((item) => item.id === runId);
  if (run) run.status = "APPROVED";
  return value as T;
}
case "ai_latest_reviewed_transcription":
  return (mockState.reviewedTranscriptions[String(args?.encounterId ?? "")] ?? null) as T;
```

- [ ] **Step 3: Verificar tipos y backend**

Run:

```powershell
cd V2/desktop-app
npm run build
cd src-tauri
cargo test reviewed_transcription
cargo clippy --lib
```

Expected: build, tests y clippy PASS sin advertencias nuevas.

- [ ] **Step 4: Commit**

```powershell
git add V2/desktop-app/src-tauri/src/lib.rs V2/desktop-app/src/ipc.ts
git commit -m "feat: exponer revision de transcripcion"
```

---

### Task 4: Construir el componente central de tres áreas

**Files:**
- Create: `V2/desktop-app/src/TranscriptionWorkspace.tsx`
- Modify: `V2/desktop-app/src/Atencion.tsx`
- Modify: `V2/desktop-app/src/App.css`

- [ ] **Step 1: Crear las props explícitas del componente**

`TranscriptionWorkspace.tsx` debe exportar:

```tsx
import type { ChangeEvent } from "react";
import type { ConsultationTurn, ScribeSpeaker } from "./consultationScribe";
import {
  deriveTranscriptionView,
  type RecordingState
} from "./transcriptionWorkspace";

export interface TranscriptionWorkspaceProps {
  busy: boolean;
  voiceConsent: boolean;
  recordingState: RecordingState;
  recordingSeconds: number;
  recordingError: string;
  processing: boolean;
  useCloudTranscription: boolean;
  realtimeCapable: boolean;
  streamingSupported: boolean;
  modelLabel: string;
  transcriptionProvider: string | null;
  estimatedCostLabel: string;
  turns: ConsultationTurn[];
  reviewed: boolean;
  onToggleVoiceConsent(): void;
  onStart(): void;
  onPause(): void;
  onResume(): void;
  onStop(): void;
  onFile(file: File | null): void;
  onCloudChange(value: boolean): void;
  onTurnChange(
    id: string,
    patch: Partial<Pick<ConsultationTurn, "speaker" | "text">>
  ): void;
  onSwapRoles(): void;
  onMarkReviewed(): void;
  onDiscard(): void;
}
```

El render debe usar:

```tsx
const view = deriveTranscriptionView({
  voiceConsent,
  recordingState,
  processing,
  hasTranscript: turns.some((turn) => turn.text.trim()),
  reviewed,
  streamingSupported,
  realtimeCapable
});
```

La tercera área siempre se renderiza. Sin texto:

```tsx
<div className="transcription-empty">
  <strong>{view.transcriptStatus}</strong>
  <p>{view.transcriptMessage}</p>
</div>
```

Con texto, renderizar `select` de hablante y `textarea` por turno. No incluir
botones de SOAP, plantilla, estudios o tratamientos.

- [ ] **Step 2: Agregar pausa y reanudación reales a la captura**

En `Atencion.tsx`, importar `RecordingState` desde
`transcriptionWorkspace.ts` y cambiar el estado local.

Agregar:

```ts
async function pauseConsultationRecording() {
  if (recordingState !== "recording" || !audioContextRef.current) return;
  await audioContextRef.current.suspend();
  setRecordingState("paused");
}

async function resumeConsultationRecording() {
  if (recordingState !== "paused" || !audioContextRef.current) return;
  await audioContextRef.current.resume();
  setRecordingState("recording");
}
```

Modificar `stopConsultationRecording` para aceptar `"recording"` o `"paused"`.
El tiempo debe conservarse durante la pausa; sustituir el cálculo basado solo
en `Date.now()` por un acumulador:

```ts
const recordedElapsedMsRef = useRef(0);
const recordingSegmentStartedAtRef = useRef(0);
```

Al pausar, sumar el segmento activo. Al reanudar, iniciar otro segmento. El
temporizador presenta la suma acumulada sin contar el tiempo suspendido.

- [ ] **Step 3: Guardar la revisión sin aplicar automáticamente a SOAP**

Agregar estado:

```ts
const [reviewedTranscription, setReviewedTranscription] =
  useState<ReviewedTranscription | null>(null);
```

Al cargar el encuentro:

```ts
call<ReviewedTranscription | null>("ai_latest_reviewed_transcription", {
  encounterId
})
  .then((reviewed) => {
    setReviewedTranscription(reviewed);
    if (reviewed) setScribeTurns(reviewed.turns);
  })
  .catch(() => setReviewedTranscription(null));
```

Reemplazar `useAiTranscription` por:

```ts
function markTranscriptionReviewed() {
  if (!aiTranscription || scribeTurns.every((turn) => !turn.text.trim())) return;
  setBusy(true);
  call<ReviewedTranscription>("ai_save_reviewed_transcription", {
    encounterId,
    runId: aiTranscription.run_id,
    turns: scribeTurns
  })
    .then((reviewed) => {
      setReviewedTranscription(reviewed);
      setAiTranscription(null);
      setMessage("Transcripción revisada. Ayuda IA ya puede usarla.");
    })
    .catch((cause: unknown) => setError(String(cause)))
    .finally(() => setBusy(false));
}
```

No copiar la transcripción al campo subjetivo en esta acción.

- [ ] **Step 4: Sustituir el bloque actual**

En `resolvedSection === "ia"`, dejar:

```tsx
<section className="panel transcription-panel">
  <div className="panel-header">
    <h3>Transcripción consulta</h3>
    <p>
      Graba o carga la conversación, revisa el texto y corrige los hablantes.
      El acomodo clínico se solicita desde Ayuda IA.
    </p>
  </div>
  <TranscriptionWorkspace
    /* props conectadas a los estados y handlers anteriores */
  />
</section>
```

Eliminar de esta sección:

- presupuesto de IA;
- Borrador SOAP;
- resumen longitudinal;
- instrucciones;
- brechas;
- editor de plantillas;
- `structureConsultation`;
- resultados de acomodo.

La administración de plantillas y los resultados se reubicarán en la fase 2.

- [ ] **Step 5: Agregar CSS estructural**

En `App.css`:

```css
.transcription-workspace {
  display: grid;
  grid-template-columns: minmax(210px, 0.85fr) minmax(190px, 0.65fr) minmax(280px, 1.15fr);
  gap: 12px;
}

.transcription-capture,
.transcription-settings,
.transcription-review {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
  background: var(--bg);
  padding: 14px;
}

.transcription-capture {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  text-align: center;
  background: color-mix(in oklch, var(--surface) 70%, var(--bg));
}

.transcription-settings,
.transcription-review {
  display: grid;
  align-content: start;
  gap: 12px;
}

@media (max-width: 1180px) {
  .transcription-workspace {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Verificar fase 1**

Run:

```powershell
cd V2/desktop-app
npm run test
npm run build
```

Expected: PASS.

Validación manual en navegador:

1. La pestaña dice `Transcripción consulta`.
2. La tercera área existe antes de grabar.
3. No afirma “en vivo” cuando solo existe `realtimeCapable`.
4. Pausar no añade segundos.
5. Marcar revisada no modifica SOAP.
6. Al cambiar de pestaña y volver, el estado revisado se recupera.

- [ ] **Step 7: Commit**

```powershell
git add V2/desktop-app/src/TranscriptionWorkspace.tsx V2/desktop-app/src/Atencion.tsx V2/desktop-app/src/App.css
git commit -m "feat: rediseñar flujo de transcripcion consulta"
```

---

## Fase 2: Ayuda IA permanente

### Task 5: Definir el resultado clínico tipado y su validación

**Files:**
- Modify: `V2/desktop-app/src-tauri/src/ai.rs`

- [ ] **Step 1: Escribir pruebas del contrato clínico**

Agregar en `ai.rs`:

```rust
#[test]
fn clinical_aid_requires_reviewed_transcription_and_uses_compatibility_levels() {
    let conn = test_conn("clinical-aid");
    let (encounter_id, patient_id) = seed_encounter(&conn);
    grant_consent(&conn, &patient_id, SCOPE_CONSULTATION_SCRIBE).unwrap();
    let registry = ProviderRegistry::default_local();

    assert!(matches!(
        generate_clinical_aid(
            &conn,
            &encounter_id,
            scribe_segments(),
            &registry
        ),
        Err(AiError::Invalid(_))
    ));

    seed_reviewed_transcription(&conn, &encounter_id);
    let draft = generate_clinical_aid(
        &conn,
        &encounter_id,
        scribe_segments(),
        &registry
    )
    .unwrap();

    assert!(draft
        .possibilities
        .iter()
        .all(|item| matches!(item.compatibility.as_str(), "HIGH" | "MEDIUM" | "LOW")));
    assert!(!draft.possibilities[0].explanation.is_empty());
    assert!(!draft.possibilities[0].supporting_findings.is_empty());
    assert_eq!(draft.usage_type, USAGE_CLINICAL_AID);
}

#[test]
fn clinical_aid_rejects_percentages_and_unknown_template_segments() {
    let raw = r#"{
      "soap":{"subjective":"","objective":"","assessment":"","plan":"","diagnosis":"","instructions":"","specialty":null},
      "template_segments":[{"segment_id":"unknown","content":"x","confidence":"medium","source_turns":["turn-1"],"warnings":[]}],
      "possibilities":[{"title":"Anemia","compatibility":"82%","explanation":"x","supporting_findings":["fatiga"],"conflicting_findings":[],"missing_data":[]}],
      "studies":[],
      "treatments":[],
      "warnings":[]
    }"#;
    assert!(parse_clinical_aid_output(raw, &scribe_segments(), &scribe_turns()).is_err());
}
```

- [ ] **Step 2: Ejecutar las pruebas y confirmar el fallo**

Run:

```powershell
cd V2/desktop-app/src-tauri
cargo test clinical_aid
```

Expected: FAIL porque el contrato no existe.

- [ ] **Step 3: Crear tipos y constantes**

En `ai.rs`:

```rust
pub const USAGE_CLINICAL_AID: &str = "CLINICAL_AID";
pub const PROMPT_VERSION_CLINICAL_AID: &str = "clinical-aid/v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClinicalPossibility {
    pub title: String,
    pub compatibility: String,
    pub explanation: String,
    pub supporting_findings: Vec<String>,
    pub conflicting_findings: Vec<String>,
    pub missing_data: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudySuggestion {
    pub name: String,
    pub reason: String,
    pub priority: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreatmentSuggestion {
    pub name: String,
    pub reason: String,
    pub precautions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ClinicalAidOutput {
    soap: NoteContent,
    template_segments: Vec<SegmentDraft>,
    possibilities: Vec<ClinicalPossibility>,
    studies: Vec<StudySuggestion>,
    treatments: Vec<TreatmentSuggestion>,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ClinicalAidDraft {
    pub run_id: String,
    pub usage_type: String,
    pub provider: String,
    pub model_version: String,
    pub estimated_cost_cents: i64,
    pub latency_ms: i64,
    pub soap: NoteContent,
    pub template_segments: Vec<SegmentDraft>,
    pub possibilities: Vec<ClinicalPossibility>,
    pub studies: Vec<StudySuggestion>,
    pub treatments: Vec<TreatmentSuggestion>,
    pub warnings: Vec<String>,
}
```

- [ ] **Step 4: Validar semántica y ausencia de porcentajes**

`parse_clinical_aid_output` debe:

- aceptar solo `HIGH`, `MEDIUM`, `LOW`;
- rechazar strings con `%` en `compatibility`;
- exigir título y explicación no vacíos;
- validar `template_segments` con las mismas reglas de
  `parse_structuring_output`;
- aceptar prioridades `ROUTINE`, `SOON`, `URGENT`;
- exigir motivo en estudios y tratamientos;
- conservar `precautions` como lista explícita;
- rechazar `source_turns` ajenos a la transcripción revisada.

La comprobación central:

```rust
if !matches!(possibility.compatibility.as_str(), "HIGH" | "MEDIUM" | "LOW")
    || possibility.compatibility.contains('%')
{
    return Err(AiError::Invalid(
        "nivel de compatibilidad clinica invalido".into(),
    ));
}
```

- [ ] **Step 5: Implementar `generate_clinical_aid`**

La función:

```rust
pub fn generate_clinical_aid(
    conn: &Connection,
    encounter_id: &str,
    template_segments: Vec<TemplateSegment>,
    registry: &ProviderRegistry,
) -> Result<ClinicalAidDraft, AiError>
```

debe:

1. rechazar encuentros firmados;
2. exigir `SCOPE_CONSULTATION_SCRIBE`;
3. cargar `latest_reviewed_transcription`;
4. construir JSON con `build_context`, turnos y plantilla;
5. seudonimizar el JSON completo;
6. ejecutar `USAGE_CLINICAL_AID`;
7. validar JSON;
8. guardar `ai_runs` con estado `DRAFT`;
9. no guardar ni modificar nota, receta o plantilla.

Reglas del prompt:

```rust
let rules = [
    "Devuelve JSON valido siguiendo el schema.",
    "No diagnostiques ni expreses probabilidades numericas.",
    "Usa HIGH, MEDIUM o LOW solo como compatibilidad con la informacion disponible.",
    "Explica hallazgos a favor, hallazgos que no encajan y datos faltantes.",
    "Sugiere estudios o tratamientos solo cuando haya justificacion.",
    "No inventes datos y no apliques ningun resultado al expediente.",
];
```

- [ ] **Step 6: Extender proveedor fake y esquema Gemini**

`FakeProvider::generate` debe manejar `USAGE_CLINICAL_AID` con una salida
determinista que contenga:

- SOAP borrador;
- hasta cuatro segmentos de plantilla;
- una posibilidad `MEDIUM`;
- un estudio `ROUTINE`;
- un tratamiento con precaución;
- advertencia de revisión médica.

En `GeminiProvider`, usar respuesta JSON cuando:

```rust
matches!(
    request.usage_type.as_str(),
    USAGE_CONSULTATION_STRUCTURING | USAGE_CLINICAL_AID
)
```

y elegir `clinical_aid_schema()` para el nuevo uso.

- [ ] **Step 7: Ejecutar pruebas**

Run:

```powershell
cargo test clinical_aid
cargo test ai::
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add V2/desktop-app/src-tauri/src/ai.rs
git commit -m "feat: generar ayuda clinica tipada"
```

---

### Task 6: Exponer Ayuda IA por IPC y mock

**Files:**
- Modify: `V2/desktop-app/src-tauri/src/lib.rs`
- Modify: `V2/desktop-app/src/ipc.ts`

- [ ] **Step 1: Agregar comando**

En `lib.rs`:

```rust
#[tauri::command]
fn ai_generate_clinical_aid(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    template: ConsultationTemplatePayload,
) -> Result<ai::ClinicalAidDraft, String> {
    let registry = ai::ProviderRegistry::default_local();
    with_ai(&state, |conn| {
        ai::generate_clinical_aid(
            conn,
            &encounter_id,
            template.segments,
            &registry,
        )
    })
}
```

Registrar el comando junto a `ai_structure_consultation`.

- [ ] **Step 2: Agregar mock clínico sin porcentajes**

En `ipc.ts`, agregar `case "ai_generate_clinical_aid"` que:

- exige `aiScribeConsent`;
- exige una transcripción revisada para `encounterId`;
- registra uso `CLINICAL_AID`;
- devuelve `compatibility: "MEDIUM"`;
- nunca devuelve `%`;
- devuelve SOAP y segmentos, pero no modifica el mock del encuentro.

Resultado mínimo:

```ts
return {
  run_id: clinicalAidRunId,
  usage_type: "CLINICAL_AID",
  provider: "fake-clinico",
  model_version: "fake-1",
  estimated_cost_cents: 1,
  latency_ms: 2,
  soap: {
    subjective: "Fatiga de cinco días según la información disponible.",
    objective: "",
    assessment: "Requiere valoración clínica y exploración.",
    diagnosis: "",
    plan: "",
    instructions: "",
    specialty: null
  },
  template_segments: [],
  possibilities: [{
    title: "Alteración del sueño",
    compatibility: "MEDIUM",
    explanation: "La fatiga coincide con insomnio y descanso insuficiente.",
    supporting_findings: ["Insomnio", "Sueño menor al habitual"],
    conflicting_findings: [],
    missing_data: ["Exploración física", "Signos vitales"]
  }],
  studies: [{
    name: "Biometría hemática",
    reason: "Valorar causas frecuentes de fatiga si el criterio médico lo indica.",
    priority: "ROUTINE"
  }],
  treatments: [{
    name: "Medidas de higiene del sueño",
    reason: "La preconsulta refiere insomnio.",
    precautions: ["Confirmar causas secundarias antes de atribuir la fatiga solo al sueño."]
  }],
  warnings: ["Resultado de demostración. Requiere revisión médica."]
} as T;
```

- [ ] **Step 3: Verificar**

Run:

```powershell
cd V2/desktop-app
npm run build
cd src-tauri
cargo test clinical_aid
cargo clippy --lib
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add V2/desktop-app/src-tauri/src/lib.rs V2/desktop-app/src/ipc.ts
git commit -m "feat: exponer ayuda IA clinica"
```

---

### Task 7: Crear helpers de aplicación explícita

**Files:**
- Create: `V2/desktop-app/src/clinicalAid.ts`
- Create: `V2/desktop-app/src/clinicalAid.test.ts`

- [ ] **Step 1: Escribir pruebas**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyClinicalAidSoap,
  compatibilityLabel,
  type ClinicalAidSoap
} from "./clinicalAid.ts";

test("traduce niveles sin usar porcentajes", () => {
  assert.equal(compatibilityLabel("HIGH"), "Alta");
  assert.equal(compatibilityLabel("MEDIUM"), "Media");
  assert.equal(compatibilityLabel("LOW"), "Baja");
});

test("aplica SOAP al editor solo cuando el médico lo solicita", () => {
  const current = {
    subjective: "Texto manual",
    objective: "",
    assessment: "",
    diagnosis: "",
    plan: "",
    instructions: "",
    specialty: {}
  };
  const draft: ClinicalAidSoap = {
    subjective: "Borrador IA",
    objective: "Sin datos",
    assessment: "Revisar",
    diagnosis: "",
    plan: "Valorar",
    instructions: "",
    specialty: null
  };
  const next = applyClinicalAidSoap(current, draft);
  assert.equal(next.subjective, "Borrador IA");
  assert.equal(current.subjective, "Texto manual");
});
```

- [ ] **Step 2: Ejecutar y confirmar fallo**

Run:

```powershell
cd V2/desktop-app
npm run test
```

Expected: FAIL porque `clinicalAid.ts` no existe.

- [ ] **Step 3: Implementar tipos y helpers**

`clinicalAid.ts` debe exportar los tipos espejo de Rust y:

```ts
export type CompatibilityLevel = "HIGH" | "MEDIUM" | "LOW";

export function compatibilityLabel(level: CompatibilityLevel): string {
  return level === "HIGH" ? "Alta" : level === "MEDIUM" ? "Media" : "Baja";
}

export function applyClinicalAidSoap<T extends {
  subjective: string;
  objective: string;
  assessment: string;
  diagnosis: string;
  plan: string;
  instructions: string;
  specialty: unknown;
}>(current: T, draft: ClinicalAidSoap): T {
  return {
    ...current,
    subjective: draft.subjective,
    objective: draft.objective,
    assessment: draft.assessment,
    diagnosis: draft.diagnosis,
    plan: draft.plan,
    instructions: draft.instructions
  };
}
```

No crear un helper que guarde la nota; la persistencia sigue en `saveNote`.

- [ ] **Step 4: Ejecutar pruebas**

Run:

```powershell
npm run test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add V2/desktop-app/src/clinicalAid.ts V2/desktop-app/src/clinicalAid.test.ts
git commit -m "test: cubrir aplicacion manual de ayuda IA"
```

---

### Task 8: Construir `Ayuda IA` en la columna derecha permanente

**Files:**
- Create: `V2/desktop-app/src/ClinicalAidRail.tsx`
- Modify: `V2/desktop-app/src/Atencion.tsx`
- Modify: `V2/desktop-app/src/App.css`

- [ ] **Step 1: Crear el componente sin estado de negocio**

Props:

```tsx
export interface ClinicalAidRailProps {
  hasReviewedTranscription: boolean;
  hasMedicalHistory: boolean;
  hasPreconsulta: boolean;
  templateName: string;
  consent: boolean;
  busy: boolean;
  draft: ClinicalAidDraft | null;
  appliedSoap: boolean;
  appliedSegments: string[];
  onToggleConsent(): void;
  onGenerate(): void;
  onApplySoap(): void;
  onApplySegment(segment: SegmentDraft): void;
  onApprove(): void;
  onDiscard(): void;
}
```

La cabecera debe mostrar:

```tsx
<section className="clinical-aid-launch">
  <div>
    <h3>Ayuda IA</h3>
    <p>Genera propuestas clínicas para revisión del médico.</p>
  </div>
  <div className="clinical-aid-sources">
    <span className={hasReviewedTranscription ? "pill pill-success" : "pill pill-muted"}>
      Transcripción {hasReviewedTranscription ? "lista" : "pendiente"}
    </span>
    <span className={hasMedicalHistory ? "pill pill-success" : "pill pill-muted"}>
      Antecedentes {hasMedicalHistory ? "disponibles" : "no disponibles"}
    </span>
    <span className={hasPreconsulta ? "pill pill-success" : "pill pill-muted"}>
      Preconsulta {hasPreconsulta ? "disponible" : "no disponible"}
    </span>
  </div>
  <button
    className="action-button"
    onClick={onGenerate}
    disabled={busy || !consent || !hasReviewedTranscription}
  >
    Generar ayuda clínica
  </button>
  {!hasReviewedTranscription ? (
    <p className="meta">Revisa la transcripción para habilitar esta acción.</p>
  ) : null}
</section>
```

Los resultados se dividen en:

- `SOAP y plantilla`;
- `Posibilidades clínicas`;
- `Estudios sugeridos`;
- `Opciones de tratamiento`;
- `Advertencias`.

Cada posibilidad muestra `compatibilityLabel`, explicación, a favor, no encaja
y faltantes. No renderizar números ni barras de probabilidad.

- [ ] **Step 2: Conectar estado en `Atencion.tsx`**

Agregar:

```ts
const [clinicalAidDraft, setClinicalAidDraft] =
  useState<ClinicalAidDraft | null>(null);
const [clinicalAidSoapApplied, setClinicalAidSoapApplied] = useState(false);
const [clinicalAidSegmentsApplied, setClinicalAidSegmentsApplied] =
  useState<string[]>([]);
```

Generación:

```ts
function generateClinicalAid() {
  if (!reviewedTranscription) return;
  setBusy(true);
  setError("");
  setClinicalAidDraft(null);
  setClinicalAidSoapApplied(false);
  setClinicalAidSegmentsApplied([]);
  call<ClinicalAidDraft>("ai_generate_clinical_aid", {
    encounterId,
    template: activeTemplate
  })
    .then((draft) => {
      setClinicalAidDraft(draft);
      setMessage("Ayuda clínica generada. Revisa cada propuesta antes de aplicarla.");
      refreshUsage();
    })
    .catch((cause: unknown) => setError(String(cause)))
    .finally(() => setBusy(false));
}
```

Aplicación SOAP:

```ts
function applyClinicalAidSoapDraft() {
  if (!clinicalAidDraft) return;
  setNote((current) => applyClinicalAidSoap(current, clinicalAidDraft.soap));
  setClinicalAidSoapApplied(true);
  setMessage("SOAP aplicado al editor. Revisa y guarda manualmente.");
}
```

Los segmentos usan `appendSegmentToNote`. Aprobar o descartar usa
`ai_review_run`, igual que los borradores existentes.

- [ ] **Step 3: Reemplazar la columna derecha**

Mantener `<aside className="encounter-context">` fuera de `encounter-main`.
Su primer hijo será `ClinicalAidRail`; debajo conservar:

- alergias;
- preconsulta resumida;
- antecedentes resumidos;
- consultas previas.

Esto garantiza que `Ayuda IA` permanezca visible al cambiar de sección.

- [ ] **Step 4: Reubicar plantillas y controles de costo**

Dentro de `ClinicalAidRail`, agregar un bloque colapsable nativo:

```tsx
<details className="clinical-aid-settings">
  <summary>Configuración de Ayuda IA</summary>
  {/* consentimiento de texto/escriba, plantilla activa y presupuesto */}
</details>
```

Reutilizar los handlers existentes:

- `toggleConsent`;
- `toggleScribeConsent`;
- `saveBudget`;
- administración de plantillas.

No colocar consentimiento de voz aquí; permanece en `Transcripción consulta`.

- [ ] **Step 5: CSS y responsive**

Agregar:

```css
.clinical-aid-launch {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in oklch, var(--primary) 32%, var(--line));
  border-radius: var(--radius-panel);
  background: var(--bg);
}

.clinical-aid-sources,
.clinical-aid-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.clinical-aid-result {
  display: grid;
  gap: 8px;
  padding-block: 12px;
  border-top: 1px solid var(--line);
}

.compatibility-high { color: var(--success); }
.compatibility-medium { color: var(--warning); }
.compatibility-low { color: var(--muted); }
```

En el breakpoint actual donde `.encounter-layout` baja a dos columnas, mantener
`.encounter-context { grid-column: 1 / -1; }`. En móvil, orden:

1. contenido central;
2. `Ayuda IA`;
3. resto del contexto.

- [ ] **Step 6: Verificar interacción**

Run:

```powershell
cd V2/desktop-app
npm run test
npm run build
```

Validación manual:

1. `Ayuda IA` permanece en la derecha al visitar Nota, Receta y Transcripción.
2. Sin transcripción revisada explica el bloqueo.
3. Antecedentes o preconsulta ausentes aparecen como no disponibles.
4. Los niveles se muestran Alta/Media/Baja.
5. No hay porcentajes.
6. Aplicar SOAP o un segmento modifica el editor, pero no guarda.
7. Descartar no modifica el expediente.

- [ ] **Step 7: Commit**

```powershell
git add V2/desktop-app/src/ClinicalAidRail.tsx V2/desktop-app/src/Atencion.tsx V2/desktop-app/src/App.css
git commit -m "feat: añadir Ayuda IA a la estacion clinica"
```

---

### Task 9: Eliminar caminos antiguos y endurecer estados

**Files:**
- Modify: `V2/desktop-app/src/Atencion.tsx`
- Modify: `V2/desktop-app/src/App.css`
- Modify: `V2/desktop-app/src/ipc.ts`

- [ ] **Step 1: Eliminar código sin consumidores**

Eliminar de `Atencion.tsx` solo después de confirmar que no se usa:

- `generateAiDraft`, `useAiDraft`, `discardAiDraft`;
- `generateAiText`, `useAiInstructions`, `discardAiText`;
- `structureConsultation`, `scribeDraft` y sus handlers antiguos;
- `TEXT_ASSIST_LABELS`;
- estilos exclusivos del panel anterior que queden sin referencias.

Mantener en backend los comandos antiguos si otras pantallas o compatibilidad
los necesitan; esta tarea solo retira el camino visible de Atención.

- [ ] **Step 2: Cubrir errores y estados vacíos**

Comprobar:

- consentimiento de voz revocado durante una captura: la captura activa no se
  borra silenciosamente; se permite detener y luego se bloquea una nueva;
- error de micrófono: mensaje `role="alert"`;
- error de proveedor: no incluye input/output clínico;
- sin modelo local: enlaza verbalmente a la pestaña de configuración
  `Transcripción`;
- resultado de Ayuda IA vacío o malformado: backend lo rechaza;
- encuentro firmado: transcripción y generación no aparecen;
- al cambiar de paciente se limpian estados no persistidos.

- [ ] **Step 3: Verificar accesibilidad estática**

Comprobar en JSX:

- `aria-label` en áreas Captura, Configuración, Transcripción y Ayuda IA;
- `aria-live="polite"` para estado de grabación y procesamiento;
- `role="alert"` para errores;
- labels visibles para file input, select y textarea;
- foco visible heredado de controles existentes;
- ningún botón depende solo del color.

- [ ] **Step 4: Ejecutar verificación**

Run:

```powershell
cd V2/desktop-app
npm run test
npm run build
cd src-tauri
cargo test
cargo clippy --lib
```

Expected: todo PASS, sin advertencias nuevas.

- [ ] **Step 5: Commit**

```powershell
git add V2/desktop-app/src/Atencion.tsx V2/desktop-app/src/App.css V2/desktop-app/src/ipc.ts
git commit -m "refactor: retirar asistencia IA antigua de atencion"
```

---

### Task 10: Documentar y ejecutar la verificación final

**Files:**
- Modify: `V2/10_linea_de_desarrollo.md`

- [ ] **Step 1: Documentar el resultado**

Agregar una extensión a los pasos 21/22 que declare:

- `Transcripción consulta` solo captura y revisa;
- la transcripción corregida vive en `consultation_transcriptions`, CLINICO,
  SQLite cifrado;
- `Ayuda IA` vive en la columna derecha permanente;
- usa transcripción revisada, antecedentes, preconsulta y plantilla;
- compatibilidad Alta/Media/Baja, nunca porcentajes;
- no existe streaming real todavía;
- nada se aplica automáticamente.

- [ ] **Step 2: Buscar fugas y términos obsoletos**

Run:

```powershell
rg -n "Asistencia de IA|Borrador SOAP|Brechas clinicas|Acomodar en plantilla" V2/desktop-app/src/Atencion.tsx V2/desktop-app/src/encounterModes.ts
rg -n "audio_base64|audioBase64|transcript_text|turns_json" V2/desktop-app/src-tauri/src
```

Expected:

- no queda `Asistencia de IA` en la navegación o encabezado de Atención;
- `audio_base64` solo existe en la frontera IPC transitoria;
- no se registra audio en SQL, logs o auditoría;
- `transcript_text` y `turns_json` solo viven en la base local cifrada.

- [ ] **Step 3: Ejecutar baseline completo**

Desktop:

```powershell
cd V2/desktop-app
npm run test
npm run build
cd src-tauri
cargo test
cargo clippy --lib
```

Si el repositorio exige la verificación global de `consultorio-app` por cambios
compartidos, ejecutar desde `V2/consultorio-app`:

```powershell
npm run test
npm run lint
npm run build
```

No se espera tocar el portal en este plan.

- [ ] **Step 4: Verificación visual**

Ejecutar el desktop en navegador con el mock:

```powershell
cd V2/desktop-app
npm run dev
```

Validar al menos en:

- 1440 px: agenda, centro y Ayuda IA en tres columnas;
- 1024 px: contexto debajo sin solapamientos;
- 760 px: una columna, sin scroll horizontal;
- tema claro y nocturno;
- estados lista, grabando, pausada, procesando, revisada y error.

Verificar consola sin errores.

- [ ] **Step 5: Commit**

```powershell
git add V2/10_linea_de_desarrollo.md
git commit -m "docs: registrar transcripcion consulta y Ayuda IA"
```

---

## Criterios de terminación

- `Transcripción consulta` no contiene generación clínica.
- La transcripción revisada persiste localmente sin audio.
- La UI no confunde `realtimeCapable` con streaming.
- `Ayuda IA` pertenece a la columna derecha permanente.
- Solo usa una transcripción marcada como revisada.
- Las posibilidades usan Alta/Media/Baja sin porcentajes.
- SOAP, plantilla, estudios y tratamientos son propuestas independientes.
- Ninguna propuesta se guarda o firma automáticamente.
- No hay contenido clínico permanente en la nube ni en logs.
- Pruebas TypeScript y Rust, build y clippy pasan.

