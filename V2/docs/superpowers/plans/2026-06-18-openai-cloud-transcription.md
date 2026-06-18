# OpenAI Cloud Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MiDoc-managed OpenAI transcription with optional speaker diarization, local-only transcript storage, idempotent cloud usage records, and duration-based credit charging.

**Architecture:** The desktop app keeps Whisper local as the default and sends cloud requests only to an authenticated MiDoc portal endpoint. The portal validates WAV bytes in memory, reserves an operational usage row by `(doctorId, runId)`, invokes an injectable OpenAI provider, computes credits from validated duration, and returns transcript/segments without persisting clinical content. Desktop stores the returned draft and speaker segments only in encrypted SQLite.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript, Zod, Prisma/PostgreSQL, Vitest, Tauri 2, Rust, reqwest, rusqlite/SQLCipher, React 19.

---

## File map

Portal:

- Create `V2/consultorio-app/src/services/ai/audio-duration.ts`: strict WAV duration parser.
- Create `V2/consultorio-app/src/services/ai/openai-transcription-provider.ts`: OpenAI multipart adapter and response validation.
- Create `V2/consultorio-app/src/services/ai/cloud-transcription-service.ts`: capability gate, idempotency, provider orchestration, credit finalization.
- Create `V2/consultorio-app/src/app/api/sync/ai/transcriptions/route.ts`: authenticated multipart HTTP boundary.
- Create `V2/consultorio-app/tests/unit/audio-duration.test.ts`.
- Create `V2/consultorio-app/tests/unit/openai-transcription-provider.test.ts`.
- Create `V2/consultorio-app/tests/integration/cloud-transcription.integration.test.ts`.
- Modify `V2/consultorio-app/src/services/ai/ai-credits.ts`: provider/mode-aware prices.
- Modify `V2/consultorio-app/tests/unit/ai-credits.test.ts`.
- Modify `V2/consultorio-app/src/lib/env.ts` and `V2/consultorio-app/tests/unit/env.test.ts`.
- Modify `V2/consultorio-app/prisma/schema.prisma` and add migration `V2/consultorio-app/prisma/migrations/20260618120000_cloud_transcription_usage/migration.sql`.
- Modify `V2/consultorio-app/src/services/sync/sync-service.ts`: preserve portal-authoritative cloud credits.
- Modify `V2/consultorio-app/tests/integration/sync.integration.test.ts`.

Desktop:

- Replace `V2/desktop-app/src-tauri/src/cloud_transcription.rs` with a MiDoc portal client.
- Modify `V2/desktop-app/src-tauri/src/sync.rs`: reusable cloud transcription HTTP contract.
- Modify `V2/desktop-app/src-tauri/src/ai.rs`: remote run IDs, modes, segments, credits, local persistence and usage reporting.
- Modify `V2/desktop-app/src-tauri/src/db.rs`: forward-only encrypted SQLite migration.
- Modify `V2/desktop-app/src-tauri/src/lib.rs`: provider resolution from linked portal/token.
- Modify `V2/desktop-app/src/consultationScribe.ts` and `V2/desktop-app/scripts/consultation-scribe.test.mjs`: anonymous-speaker mapping.
- Modify `V2/desktop-app/src/Atencion.tsx`: three-mode selector, estimate, diarized review.
- Modify `V2/desktop-app/src/ipc.ts`: browser mock parity.
- Modify `V2/desktop-app/src/TranscriptionSetup.tsx`: explain cloud options and rates.

Documentation:

- Modify `V2/10_linea_de_desarrollo.md`.
- Modify `V2/docs/catalogo-comercial-planes-ia-2026-06.md`.
- Modify `AGENTS.md` environment variable list if portal variables are documented there.

### Task 1: Credit formulas and operational schema

**Files:**

- Modify: `V2/consultorio-app/tests/unit/ai-credits.test.ts`
- Modify: `V2/consultorio-app/src/services/ai/ai-credits.ts`
- Modify: `V2/consultorio-app/prisma/schema.prisma`
- Create: `V2/consultorio-app/prisma/migrations/20260618120000_cloud_transcription_usage/migration.sql`

- [ ] **Step 1: Write failing credit tests**

Add:

```ts
expect(getTranscriptionCreditCost({ mode: "standard", durationSeconds: 900 })).toBe(1);
expect(getTranscriptionCreditCost({ mode: "standard", durationSeconds: 901 })).toBe(2);
expect(getTranscriptionCreditCost({ mode: "diarized", durationSeconds: 600 })).toBe(1);
expect(getTranscriptionCreditCost({ mode: "diarized", durationSeconds: 601 })).toBe(2);
expect(getAiCreditCost("TRANSCRIPTION", { providerName: "whisper-local-medium" })).toBe(0);
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```powershell
npm run test -- tests/unit/ai-credits.test.ts
```

Expected: FAIL because `getTranscriptionCreditCost` and the contextual overload do not exist.

- [ ] **Step 3: Implement the formulas**

Add:

```ts
export type TranscriptionMode = "standard" | "diarized";

export function getTranscriptionCreditCost(input: {
  mode: TranscriptionMode;
  durationSeconds: number;
}) {
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
    throw new Error("Invalid transcription duration");
  }
  const blockSeconds = input.mode === "diarized" ? 600 : 900;
  return Math.max(1, Math.ceil(input.durationSeconds / blockSeconds));
}
```

Keep the existing fixed catalog for non-transcription uses. Local providers matching `whisper-local` return zero. Cloud cost is supplied only by the authoritative cloud service.

- [ ] **Step 4: Add operational Prisma columns**

Add to `AiUsageLog`:

```prisma
durationSeconds   Int?
transcriptionMode String?
```

Create a migration containing only:

```sql
ALTER TABLE "AiUsageLog" ADD COLUMN "durationSeconds" INTEGER;
ALTER TABLE "AiUsageLog" ADD COLUMN "transcriptionMode" TEXT;
```

- [ ] **Step 5: Generate Prisma client and verify GREEN**

Run:

```powershell
npm run db:generate
npm run test -- tests/unit/ai-credits.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add V2/consultorio-app/src/services/ai/ai-credits.ts V2/consultorio-app/tests/unit/ai-credits.test.ts V2/consultorio-app/prisma
git commit -m "feat: price transcription by duration"
```

### Task 2: Environment compliance gate

**Files:**

- Modify: `V2/consultorio-app/tests/unit/env.test.ts`
- Modify: `V2/consultorio-app/src/lib/env.ts`

- [ ] **Step 1: Add failing environment tests**

Spawn `env.ts` with:

```ts
OPENAI_TRANSCRIPTION_ENABLED: "true",
OPENAI_API_KEY: "",
OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
OPENAI_DIARIZATION_MODEL: "gpt-4o-transcribe-diarize",
OPENAI_TRANSCRIPTION_ZDR_APPROVED: "true"
```

Expect non-zero status. Add separate cases for missing ZDR approval and a successful fully configured environment.

- [ ] **Step 2: Run test and verify RED**

```powershell
npm run test -- tests/unit/env.test.ts
```

Expected: FAIL because the new variables are not validated.

- [ ] **Step 3: Add validated variables**

Use:

```ts
OPENAI_TRANSCRIPTION_ENABLED: z.stringbool().default(false),
OPENAI_TRANSCRIPTION_MODEL: z.string().min(1).default("gpt-4o-mini-transcribe"),
OPENAI_DIARIZATION_MODEL: z.string().min(1).default("gpt-4o-transcribe-diarize"),
OPENAI_TRANSCRIPTION_ZDR_APPROVED: z.stringbool().default(false)
```

In `superRefine`, when enabled require `OPENAI_API_KEY` and `OPENAI_TRANSCRIPTION_ZDR_APPROVED === true`.

- [ ] **Step 4: Run test and verify GREEN**

```powershell
npm run test -- tests/unit/env.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add V2/consultorio-app/src/lib/env.ts V2/consultorio-app/tests/unit/env.test.ts
git commit -m "feat: gate OpenAI transcription configuration"
```

### Task 3: WAV validation and authoritative duration

**Files:**

- Create: `V2/consultorio-app/tests/unit/audio-duration.test.ts`
- Create: `V2/consultorio-app/src/services/ai/audio-duration.ts`

- [ ] **Step 1: Write failing WAV tests**

Build minimal PCM16 WAV fixtures and assert:

```ts
expect(readWavDurationSeconds(oneSecondWav)).toBe(1);
expect(readWavDurationSeconds(twoChannelWav)).toBe(2);
expect(() => readWavDurationSeconds(Buffer.from("not wav"))).toThrow();
expect(() => readWavDurationSeconds(emptyDataWav)).toThrow();
```

- [ ] **Step 2: Run test and verify RED**

```powershell
npm run test -- tests/unit/audio-duration.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement strict RIFF/WAVE parsing**

Parse `RIFF`, `WAVE`, `fmt ` and `data` chunks with bounds checks. Accept PCM WAV only and compute:

```ts
durationSeconds = dataSize / byteRate;
```

Reject non-finite, zero, truncated and malformed values. Return a decimal number; credit calculation performs ceiling.

- [ ] **Step 4: Run test and verify GREEN**

```powershell
npm run test -- tests/unit/audio-duration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add V2/consultorio-app/src/services/ai/audio-duration.ts V2/consultorio-app/tests/unit/audio-duration.test.ts
git commit -m "feat: validate WAV duration server side"
```

### Task 4: OpenAI provider contract

**Files:**

- Create: `V2/consultorio-app/tests/unit/openai-transcription-provider.test.ts`
- Create: `V2/consultorio-app/src/services/ai/openai-transcription-provider.ts`

- [ ] **Step 1: Write failing provider tests**

Inject a transport function and assert standard requests include:

```ts
Authorization: Bearer secret
file: consultation.wav
model: gpt-4o-mini-transcribe
response_format: json
```

Assert diarized requests include:

```ts
model: gpt-4o-transcribe-diarize
response_format: diarized_json
chunking_strategy: auto
```

Assert they do not include `known_speaker_names[]`, `known_speaker_references[]`, patient IDs or original filenames.

- [ ] **Step 2: Run test and verify RED**

```powershell
npm run test -- tests/unit/openai-transcription-provider.test.ts
```

Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Implement provider and schemas**

Define:

```ts
export interface CloudTranscriptSegment {
  speaker: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface CloudTranscriptionResult {
  text: string;
  segments: CloudTranscriptSegment[] | null;
  reportedDurationSeconds: number | null;
  model: string;
  latencyMs: number;
}
```

Validate JSON with Zod. Sanitize all provider failures to stable messages without including response bodies.

- [ ] **Step 4: Verify GREEN**

```powershell
npm run test -- tests/unit/openai-transcription-provider.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add V2/consultorio-app/src/services/ai/openai-transcription-provider.ts V2/consultorio-app/tests/unit/openai-transcription-provider.test.ts
git commit -m "feat: add OpenAI transcription provider"
```

### Task 5: Governed cloud service and endpoint

**Files:**

- Create: `V2/consultorio-app/tests/integration/cloud-transcription.integration.test.ts`
- Create: `V2/consultorio-app/src/services/ai/cloud-transcription-service.ts`
- Create: `V2/consultorio-app/src/app/api/sync/ai/transcriptions/route.ts`
- Modify: `V2/consultorio-app/src/services/sync/sync-service.ts`
- Modify: `V2/consultorio-app/tests/integration/sync.integration.test.ts`

- [ ] **Step 1: Write failing service integration tests**

Using a fake provider, cover:

```ts
standard 900s -> 1 credit
standard 901s -> 2 credits
diarized 600s -> 1 credit
diarized 601s -> 2 credits
provider failure -> FAILED + 0 credits
same doctor/runId retry -> one usage row and unchanged credit
same runId with another mode -> 409
Whisper sync report -> 0 credits
later desktop cloud report -> does not overwrite authoritative credit
```

Also inspect the database serialization and assert it contains neither fake transcript text nor audio marker bytes.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm run test -- tests/integration/cloud-transcription.integration.test.ts tests/integration/sync.integration.test.ts
```

Expected: FAIL because the service and cloud-aware sync rules do not exist.

- [ ] **Step 3: Implement capability gate and idempotent reservation**

Create a `TRANSCRIPTION` provider row for the configured model. Reserve `AiUsageLog` with:

```ts
status: AiUsageStatus.PENDING,
creditCost: 0,
durationSeconds,
transcriptionMode: mode,
inputReference: { kind: "REMOTE_AUDIO_TRANSIENT", runId },
outputReference: { kind: "LOCAL_ENCRYPTED_TRANSCRIPT", runId }
```

Use the unique `(doctorId, externalRunId)` key. Reject active `PENDING` duplicates; reject mode mismatch. On success update to `COMPLETED` and set authoritative credits. On provider failure update to `FAILED`, zero credits, and throw a sanitized service error.

- [ ] **Step 4: Implement multipart route**

Use Next.js 16 native `request.formData()`. Validate:

```ts
runId: z.uuid()
mode: z.enum(["standard", "diarized"])
audio instanceof File
audio.type in ["audio/wav", "audio/x-wav"]
audio.size between 1 and 25 MiB
```

Authenticate with `authenticateSyncDevice`, rate limit each device to 30 requests per 15 minutes, call the service, and return JSON. Export:

```ts
export const runtime = "nodejs";
export const maxDuration = 120;
```

- [ ] **Step 5: Protect authoritative credit during sync**

In `recordAiUsageBatch`, if an existing row is a portal cloud transcription, update review status/references only. Do not replace `creditCost`, `durationSeconds`, `transcriptionMode`, provider or model from desktop input. Local `whisper-local-*` reports receive zero credits.

- [ ] **Step 6: Verify GREEN**

```powershell
npm run test -- tests/integration/cloud-transcription.integration.test.ts tests/integration/sync.integration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add V2/consultorio-app/src V2/consultorio-app/tests/integration V2/consultorio-app/prisma
git commit -m "feat: proxy governed cloud transcription"
```

### Task 6: Desktop portal client and encrypted local draft

**Files:**

- Modify: `V2/desktop-app/src-tauri/src/cloud_transcription.rs`
- Modify: `V2/desktop-app/src-tauri/src/sync.rs`
- Modify: `V2/desktop-app/src-tauri/src/ai.rs`
- Modify: `V2/desktop-app/src-tauri/src/db.rs`
- Modify: `V2/desktop-app/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests**

Add tests for:

```rust
// response parsing
assert_eq!(response.credit_cost, 3);
assert_eq!(response.segments.unwrap()[0].speaker, "speaker_0");

// local draft persistence
assert_eq!(draft.run_id, supplied_run_id);
assert_eq!(draft.transcription_mode, "diarized");
assert_eq!(draft.credit_cost, 3);
```

Add a migration test asserting `ai_runs` has `transcription_mode`, `duration_seconds`, `credit_cost`, and `segments_json`.

- [ ] **Step 2: Run Rust tests and verify RED**

```powershell
cargo test cloud_transcription ai::
```

Expected: FAIL because the fields and portal contract are absent.

- [ ] **Step 3: Implement async portal call**

Add a `sync::transcribe_cloud` function that posts multipart to:

```text
{server_url}/api/sync/ai/transcriptions
```

with Bearer device token, neutral filename, `runId`, `mode`, and WAV bytes. Deserialize only the approved response fields.

- [ ] **Step 4: Extend local encrypted schema**

Append a forward-only migration:

```sql
ALTER TABLE ai_runs ADD COLUMN transcription_mode TEXT;
ALTER TABLE ai_runs ADD COLUMN duration_seconds INTEGER;
ALTER TABLE ai_runs ADD COLUMN credit_cost INTEGER;
ALTER TABLE ai_runs ADD COLUMN segments_json TEXT;
```

`segments_json` is `CLINICO` and remains in encrypted SQLite.

- [ ] **Step 5: Preserve supplied cloud run ID**

Extend `transcribe_audio` so local mode generates a UUID internally, while cloud mode supplies the portal `runId` and response metadata. Pending usage reports include mode/duration but no segments or transcript.

- [ ] **Step 6: Resolve cloud provider from linked state**

Remove `MIDOC_CLOUD_STT_*`. When cloud is selected, require `server_url` and `device_token` from encrypted sync state. Keep Whisper provider logic unchanged.

- [ ] **Step 7: Verify GREEN**

```powershell
cargo test
cargo clippy --all-targets -- -D warnings
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add V2/desktop-app/src-tauri
git commit -m "feat: store governed cloud transcription locally"
```

### Task 7: Diarized turn mapping and UI

**Files:**

- Modify: `V2/desktop-app/src/consultationScribe.ts`
- Modify: `V2/desktop-app/scripts/consultation-scribe.test.mjs`
- Modify: `V2/desktop-app/src/Atencion.tsx`
- Modify: `V2/desktop-app/src/ipc.ts`
- Modify: `V2/desktop-app/src/TranscriptionSetup.tsx`

- [ ] **Step 1: Write failing speaker mapping tests**

Add:

```ts
const mapped = diarizedSegmentsToTurns([
  { speaker: "speaker_0", start_seconds: 0, end_seconds: 3, text: "Buenos días" },
  { speaker: "speaker_1", start_seconds: 3, end_seconds: 7, text: "Tengo dolor" }
]);
assert.equal(mapped.speakers[0].label, "Hablante 1");
assert.equal(mapped.turns[0].speakerRole, "UNASSIGNED");
```

Assert no speaker is automatically assigned as doctor or patient.

- [ ] **Step 2: Run script and verify RED**

```powershell
node scripts/consultation-scribe.test.mjs
```

Expected: FAIL because `diarizedSegmentsToTurns` does not exist.

- [ ] **Step 3: Implement speaker types and mapping**

Add roles:

```ts
type DiarizedSpeakerRole = "UNASSIGNED" | "MEDICO" | "PACIENTE" | "ACOMPANANTE" | "OTRO";
```

Map stable provider labels to display labels without guessing roles. Convert to the existing `ConsultationTurn` contract only after all used speakers are assigned.

- [ ] **Step 4: Replace checkbox with three-mode selector**

Use:

```ts
type TranscriptionMode = "local" | "cloud-standard" | "cloud-diarized";
```

Show estimated credits from locally measured recording duration:

```ts
local => 0
cloud-standard => Math.ceil(seconds / 900)
cloud-diarized => Math.ceil(seconds / 600)
```

Pass `mode` to Tauri. Show definitive `credit_cost` and `duration_seconds` from the response.

- [ ] **Step 5: Add role review gate**

For diarized results, render a selector per anonymous speaker. Disable `Acomodar en plantilla` until every speaker appearing in a non-empty turn has a non-`UNASSIGNED` role. Preserve manual text editing.

- [ ] **Step 6: Update mock and setup copy**

Mock standard and diarized responses with no PHI. Update setup copy to state local `0`, standard `15 min/credit`, diarized `10 min/credit`.

- [ ] **Step 7: Verify GREEN**

```powershell
node scripts/consultation-scribe.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add V2/desktop-app/src V2/desktop-app/scripts
git commit -m "feat: review diarized consultation speakers"
```

### Task 8: Documentation and complete verification

**Files:**

- Modify: `V2/10_linea_de_desarrollo.md`
- Modify: `V2/docs/catalogo-comercial-planes-ia-2026-06.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update product and environment documentation**

Document:

```text
Whisper local = 0 credits
OpenAI standard = ceil(seconds / 900)
OpenAI diarized = ceil(seconds / 600)
Gemini structuring = 1 additional credit
```

Add the four OpenAI transcription environment variables and the BAA/ZDR activation gate.

- [ ] **Step 2: Run portal verification**

```powershell
npm run test
npm run lint
npm run build
```

Expected: all commands exit 0 with no new warnings.

- [ ] **Step 3: Run desktop verification**

```powershell
node scripts/consultation-scribe.test.mjs
npm run build
cargo test
cargo clippy --all-targets -- -D warnings
```

Expected: all commands exit 0.

- [ ] **Step 4: Review privacy**

Run:

```powershell
rg -n "transcriptText|segments|audioBase64|audio bytes" V2/consultorio-app/src V2/consultorio-app/prisma
```

Expected: clinical values appear only in transient request/response code and tests, never Prisma writes, audit metadata or logs.

- [ ] **Step 5: Commit**

```powershell
git add AGENTS.md V2/10_linea_de_desarrollo.md V2/docs/catalogo-comercial-planes-ia-2026-06.md
git commit -m "docs: document cloud transcription credits"
```
