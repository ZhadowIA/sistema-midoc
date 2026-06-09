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

## V2 architecture (current decision, 2026-06-09)

V2 is **local-first**: all clinical data (records, SOAP notes, prescriptions, documents) lives encrypted on the doctor's computer inside the installable desktop app. The cloud portal only handles public booking, the doctor's public profile, a temporary encrypted inbox (pre-consultation forms and patient uploads, purged after the desktop app syncs them down), SMS/email notifications, and the SaaS subscription. **No clinical data is ever persisted permanently in the cloud.** Everything is TypeScript.

There is no WhatsApp bot in V2 — notifications use SMS and email.

## Mandatory reading before working on V2

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
npm run db:generate:no-engine
```

## V1 reference documentation

Canonical V1 spec (for understanding inherited business rules): `V1/consultorio-app/docs/SISTEMA_ACTUAL.md`, index at `V1/consultorio-app/docs/INDICE_DOCUMENTACION.md`.
