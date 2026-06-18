# AGENTS.md

This file provides guidance to Codex when working in `Sistema MiDoc`.

## Repository structure

```text
Sistema MiDoc/
├── V1/                     # Previous system. FROZEN — read-only reference, never modified.
└── V2/                     # Main workspace for MiDoc V2
    ├── consultorio-app/    # Cloud portal (Next.js 16)
    ├── desktop-app/        # Doctor's app (Tauri 2 + encrypted SQLite) — created in step 0
    ├── docs/               # Plans and support docs for the implementation
    └── *.md                # Product, roadmap, and functional documentation
```

V2 is **local-first** (decision 2026-06-09): clinical data lives encrypted on the doctor's machine in the desktop app; the cloud portal only handles public booking, a temporary inbox (purged after sync), notifications, and subscription. Never persist clinical data permanently in the cloud, and never log clinical content. Notifications are oriented to official provider channels: `SMS`, `EMAIL`, and WhatsApp Business only when sent through an official provider such as Twilio. Do not use unofficial WhatsApp automation, browser scraping, or V1-style `whatsapp-web.js`.

Binding rules: `V2/REGLAS_DESARROLLO.md`. Development line and gates: `V2/10_linea_de_desarrollo.md`. V1 feature inventory: `V2/12_inventario_funcional_v1.md`.

---

## consultorio-app

### Commands

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run env:check
npm run db:migrate:dev
npm run db:generate:no-engine
```

### Environment variables

Current validated variables live in `consultorio-app/src/lib/env.ts` and include:

```bash
DATABASE_URL
NEXTAUTH_SECRET
APP_BASE_URL
QUESTIONNAIRE_TOKEN_SECRET
TERMS_VERSION
PRIVACY_VERSION
SMS_PROVIDER
SMS_BASE_URL
SMS_API_KEY
WHATSAPP_PROVIDER
PHONE_NOTIFICATION_CHANNEL
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_MESSAGING_SERVICE_SID
TWILIO_FROM_PHONE_NUMBER
TWILIO_WHATSAPP_MESSAGING_SERVICE_SID
TWILIO_WHATSAPP_FROM_PHONE_NUMBER
NOTIFICATION_CRON_SECRET
PAYMENTS_PROVIDER
PAYMENTS_WEBHOOK_SECRET
```

### Next.js version warning

This project uses **Next.js 16**. Before writing App Router, dynamic route, or route handler code, check the relevant guide in `consultorio-app/node_modules/next/dist/docs/`.

### Current architecture

**App Router** (`src/app/`):
- `api/auth/*` — registration, login, logout, password recovery, subscription, setup status
- `api/admin/*` — doctor profile, services, availability, availability blocks
- `api/public/*` — public doctor profile data
- `perfil/[slug]` — public doctor profile page

**Domain services** (`src/services/`):
- `auth/auth-service.ts`
- `doctor/doctor-profile-service.ts`

**Utilities** (`src/lib/`):
- `auth/session-cookie.ts`
- `auth/session-user.ts`
- `audit.ts`
- `env.ts`
- `prisma.ts`
- `rate-limit.ts`
- `security/*`

### Data model highlights

- `User` supports doctor and patient roles
- `DoctorProfile` owns public identity, specialty, services, availability, and subscription records
- `DoctorService` stores active/inactive services with pricing and duration
- `DoctorAvailability` stores weekly rules or date overrides
- `DoctorAvailabilityBlock` stores temporary schedule exceptions
- `Notification` supports `SMS`, `EMAIL`, and `WHATSAPP` (WhatsApp Business via official Twilio channel only).

### Current onboarding flow

Doctor registration → login → `POST /api/auth/subscribe` → profile/services/availability setup → `GET /api/auth/setup-status`

`nextStep` currently returns:
- `SUBSCRIPTION`
- `ONBOARDING`
- `DASHBOARD`

### Verification baseline

Before claiming work is complete, run:

```bash
npm run test
npm run lint
npm run build
```
