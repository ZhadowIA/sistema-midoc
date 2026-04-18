# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo structure

```
sistema-midoc/
├── consultorio-app/   # Next.js 16 full-stack app (frontend + API)
└── whatsapp-bot/      # Standalone Express service (whatsapp-web.js)
```

The two services communicate via webhooks: the bot forwards inbound WhatsApp messages to `POST /api/internal/whatsapp/incoming` (authenticated with `x-whatsapp-secret`), and `consultorio-app` sends outbound messages by calling the bot's REST API at `WHATSAPP_API_URL`.

---

## consultorio-app

### Commands

```bash
npm run dev             # dev server (localhost:3000)
npm run dev:turbo       # dev with Turbopack
npm run build
npm run lint
npm run env:check       # validate all required env vars
npm run test            # unit + integration
npm run test:unit
npm run test:integration

# Database
npm run db:migrate:dev         # apply dev migrations
npm run db:migrate:deploy      # apply production migrations
npm run db:migrate:status
npm run db:generate:no-engine  # regenerate Prisma client
```

Seed the local DB with `tsx prisma/seed.ts`. Default credentials: `admin@consultorio.com` / `admin123`.

### Next.js version warning

This project uses **Next.js 16**, which has breaking changes from prior versions. Before writing any Next.js-specific code, check `node_modules/next/dist/docs/` for the relevant guide. Do not rely on training-data conventions for routing, data fetching, or middleware — they may not apply.

### Architecture

**API route layers** (`src/app/api/`):
- `public/*` — unauthenticated booking endpoints (availability, slot holds, appointments, questionnaires)
- `auth/*` — doctor and patient auth, registration, onboarding, subscription
- `admin/*` — doctor panel (appointments, SOAP/AI, patients, config, WhatsApp, billing)
- `internal/*` — cron-triggered notification processing and inbound WhatsApp webhook
- `payments/*` — checkout placeholder and idempotent payment webhook

**Domain services** (`src/services/`): `AppointmentService`, `AvailabilityService`, `NotificationService`, `QuestionnaireService`, `AppointmentAuditService`, `WhatsAppMessageLogService`. Route handlers should delegate business logic here rather than implementing it inline.

**Utilities** (`src/lib/`): `aiNoteService.ts` (OpenAI integration with Zod validation, retry/backoff, JSON sanitization), `auth.ts`/`session.ts` (JWT in HttpOnly cookie `med_token`), `whatsappProvider.ts`, `env.ts`, `rateLimit.ts`, `dateTime.ts`.

### Key data model relationships

- `User` (doctor) → `DoctorConfig` (1:1), `DoctorSubscription` (1:1), `DoctorOnboarding` (1:1)
- `Patient` is per-doctor (`ownerDoctorId`) and can optionally be linked to a `User` patient account (`userId`)
- `Appointment` has `source` (PATIENT | DOCTOR) and `status` (PENDING | CONFIRMED | CANCELLED | RESCHEDULED | COMPLETED)
- `Notification` is a queue consumed by the internal cron; supports WhatsApp/SMS/EMAIL channels
- `AppointmentAuditLog` records every critical state change with actor + source

### SaaS onboarding flow

Register → Subscribe (`POST /api/auth/subscribe`) → Onboarding (`POST /api/auth/onboarding/complete`). `GET /api/auth/setup-status` returns `nextStep` (`SUBSCRIPTION` | `ONBOARDING` | `DASHBOARD`) to drive redirects.

### AI features

Audio-to-SOAP pipeline: audio upload → OpenAI transcription → structured SOAP JSON, validated with Zod. `src/lib/aiNoteService.ts` owns this with timeout, retry-with-backoff, and deterministic pharmacovigilance deduplication. `AIInsight` stores diagnosis/treatment suggestions separately from `ClinicalNote`.

### Required environment variables

```
DATABASE_URL
NEXTAUTH_SECRET
APP_BASE_URL
QUESTIONNAIRE_TOKEN_SECRET
TERMS_VERSION
PRIVACY_VERSION
WHATSAPP_API_URL
WHATSAPP_WEBHOOK_SECRET
NOTIFICATION_CRON_SECRET
OPENAI_API_KEY           # optional; required for AI features
PAYMENTS_PROVIDER        # MOCK | STRIPE | CONEKTA | OPENPAY
PAYMENTS_WEBHOOK_SECRET
```

Full reference in `consultorio-app/.env.example`. Run `npm run env:check` to validate.

---

## whatsapp-bot

### Commands

```bash
npm run dev   # node index.js (localhost:3001)
```

### Environment variables

```
PORT=3001
APP_WEBHOOK_URL=http://localhost:3000/api/internal/whatsapp/incoming
APP_WEBHOOK_SECRET=<must match consultorio-app WHATSAPP_WEBHOOK_SECRET>
```

---

## Authoritative documentation

- `consultorio-app/docs/SISTEMA_ACTUAL.md` — canonical technical and functional spec (updated 2026-04-15)
- `consultorio-app/docs/DEPLOY_CHECKLIST.md` — pre-production requirements
- `consultorio-app/docs/ROADMAP_FASES_BLOQUES.md` — planned phase roadmap
