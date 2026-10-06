# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository structure

```text
Sistema MiDoc/
├── V1/                      # Previous system. FROZEN — read-only reference, never modified or deployed.
│   ├── consultorio-app/     # Next.js 16 full-stack SaaS app
│   ├── whatsapp-bot/        # Express service (whatsapp-web.js)
│   └── frontend/            # Legacy UI reference
└── V2/                      # Active development
    ├── consultorio-app/     # Cloud portal (Next.js + minimal PostgreSQL)
    ├── desktop-app/         # Doctor's app (Tauri 2 + React + encrypted SQLite) — created in step 0
    └── *.md                 # Product docs, development line, rules
```

## V2 scope (current decision, 2026-09-07)

V2 is **a clinical-records app with AI support for the doctor**. Active scope: patient directory and longitudinal record, the clinical encounter (SOAP, templates, prescription, instructions), the general-medicine and dentistry profiles, local clinical documents, deterministic medication safety, and the whole AI layer (local transcription, diarization, scribe, assisted anamnesis, dental dictation) with its governance.

Out of active scope and **frozen behind a capability flag — turned off, never deleted**: public scheduling, patient portal, precheckin/mailbox, reception and waiting list, cash drawer and consultation payments, patient SMS/email notifications, and the desktop day/week agenda. The cloud portal keeps only the doctor's account, licensing/activation and AI credits, and the AI gateway (provider keys and BAA server-side; it never sees clinical content).

## Business model (decision 2026-10-06)

MiDoc is sold as a **one-time purchase**, not a mandatory subscription: the app (records, prescriptions, exports, local transcription) works forever, offline after a one-time activation with a signed license; purchase includes 12 months of updates and the last version received stays the doctor's. Revenue comes mainly from **AI credits** (non-expiring top-ups plus an optional monthly credit plan). Step 29 must be redone on this basis. Full detail in `V2/15_modelo_de_negocio.md`.

Full detail in `V2/14_reenfoque_expediente_ia.md`; step-by-step reclassification and the new steps 27-31 in `V2/10_linea_de_desarrollo.md`. Local-first and the data-residency rules are unchanged — only the product surface shrank.

## V2 architecture (2026-06-09, unchanged)

V2 is **local-first**: all clinical data (records, SOAP notes, prescriptions, documents) lives encrypted on the doctor's computer inside the installable desktop app. The cloud portal was built to handle public booking, the doctor's public profile, a temporary encrypted inbox (pre-consultation forms and patient uploads, purged after the desktop app syncs them down), SMS/email notifications, and the SaaS subscription; under the 2026-09-07 scope decision only the account, the subscription and the AI gateway stay active and the rest is frozen. **No clinical data is ever persisted permanently in the cloud.** Everything is TypeScript.

There is no WhatsApp bot in V2 — notifications use SMS and email.

## Mandatory reading before working on V2

- `V2/14_reenfoque_expediente_ia.md` — the 2026-09-07 scope decision. It overrides any wider scope described in older docs.
- `V2/15_modelo_de_negocio.md` — the 2026-10-06 business-model decision (one-time purchase + AI credits). It overrides the subscription assumptions in older docs and in step 29.
- `V2/PENDIENTES.md` — living list of open items; add anything left unresolved during work, with date and origin.
- `V2/REGLAS_DESARROLLO.md` — binding development rules (layering, Zod at boundaries, data-residency classification, testing requirements, Definition of Done, git flow). Follow them exactly.
- `V2/10_linea_de_desarrollo.md` — stepped development line with gates. Every task must be located in a step; tasks belonging to future steps are documented, not implemented.
- `V2/01_contexto_v2.md` — product context and architecture decision.
- `V2/12_inventario_funcional_v1.md` — full V1 feature inventory with keep/adapt/defer/omit proposals.

## Key rules (summary — full version in REGLAS_DESARROLLO.md)

- Never persist clinical content in the cloud, in logs, telemetry, or error messages — reference IDs only.
- Route handlers and UI components delegate business logic to domain services; validate all external input with Zod.
- V1 code is consulted for business rules but never imported — reimplement under V2 conventions.
- No feature is done without tests, passing lint/types, and updated docs.
- Work on short branches (`v2/<step>-<description>`), PR into `dev`; `main` only receives validated merges from `dev`.

## Next.js version warning

V2's portal uses **Next.js 16**, which has breaking changes from prior versions. Before writing any Next.js-specific code, check `V2/consultorio-app/node_modules/next/dist/docs/` for the relevant guide. Do not rely on training-data conventions.

## V2 portal commands (V2/consultorio-app)

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run env:check
npm run db:migrate:dev
npm run db:migrate:deploy
npm run db:generate
```

## V1 reference documentation

Canonical V1 spec (for understanding inherited business rules): `V1/consultorio-app/docs/SISTEMA_ACTUAL.md`, index at `V1/consultorio-app/docs/INDICE_DOCUMENTACION.md`.
