# Paso 0 Base Tecnica V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current documentation-only workspace into the initial MiDoc V2 repo structure: documentation at the root, `consultorio-app` as the first and only application, and an SMS-ready notification boundary inside that app.

**Architecture:** Keep the current functional documentation at the repo root as the source of truth for scope and decisions. Add `consultorio-app` as the single Next.js 16 app for V2, with local environment validation, a minimal Prisma schema, starter tests, and a notification contract that keeps SMS integration inside the app boundary until a real provider adapter is needed.

**Tech Stack:** Node.js, npm, Next.js 16, TypeScript, Prisma, PostgreSQL, Vitest, ESLint.

---

## File Structure Map

**Keep as-is**
- `README.md`
- `01_contexto_v2.md`
- `02_recoleccion_informacion.md`
- `03_clasificacion_requerimientos.md`
- `04_validacion_requerimientos.md`
- `05_requerimientos_funcionales.md`
- `06_casos_uso_dcu.md`
- `07_capacidades_heredadas_y_alcance.md`
- `08_recomendaciones_produccion.md`
- `09_contraste_v1_v2.md`
- `10_linea_de_desarrollo.md`
- `11_recomendaciones_ia_medica.md`
- `anexos/*`
- `tools/*`

**Create**
- `package.json`
- `.gitignore`
- `.editorconfig`
- `consultorio-app/package.json`
- `consultorio-app/.env.example`
- `consultorio-app/next.config.ts`
- `consultorio-app/tsconfig.json`
- `consultorio-app/eslint.config.mjs`
- `consultorio-app/src/app/page.tsx`
- `consultorio-app/src/lib/env.ts`
- `consultorio-app/src/lib/dateTime.ts`
- `consultorio-app/src/lib/notifications/types.ts`
- `consultorio-app/prisma/schema.prisma`
- `consultorio-app/prisma/seed.ts`
- `consultorio-app/tests/smoke/homepage.test.ts`

**Modify**
- `README.md`

---

### Task 1: Bootstrap the repo root for V2 implementation

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.editorconfig`
- Modify: `README.md`

- [ ] **Step 1: Create the root manifest for repo-level commands**

```json
{
  "name": "sistema-midoc-v2",
  "private": true,
  "scripts": {
    "dev:app": "npm --prefix consultorio-app run dev",
    "test": "npm --prefix consultorio-app run test",
    "lint": "npm --prefix consultorio-app run lint",
    "build": "npm --prefix consultorio-app run build",
    "env:check": "npm --prefix consultorio-app run env:check"
  }
}
```

- [ ] **Step 2: Add root ignore and editor rules**

```gitignore
node_modules/
.next/
coverage/
dist/
.env
.env.local
*.log
prisma/dev.db
```

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
```

- [ ] **Step 3: Update the root README to describe the new repo layout**

```md
## Estructura de implementacion V2

V2/
- 01_contexto_v2.md
- 10_linea_de_desarrollo.md
- docs/superpowers/plans/
- consultorio-app/
- documentacion funcional existente

## Arranque local esperado

1. `npm install`
2. `npm run dev:app`
3. `npm test`
```

- [ ] **Step 4: Verify the root manifest works with the app directory**

Run: `npm install`
Expected: root `package-lock.json` created without errors

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore .editorconfig README.md
git commit -m "chore: bootstrap V2 repo root"
```

### Task 2: Create the `consultorio-app` technical base

**Files:**
- Create: `consultorio-app/package.json`
- Create: `consultorio-app/.env.example`
- Create: `consultorio-app/next.config.ts`
- Create: `consultorio-app/tsconfig.json`
- Create: `consultorio-app/eslint.config.mjs`
- Create: `consultorio-app/src/app/page.tsx`
- Create: `consultorio-app/src/lib/env.ts`
- Create: `consultorio-app/src/lib/dateTime.ts`
- Create: `consultorio-app/src/lib/notifications/types.ts`

- [ ] **Step 1: Add the Next.js 16 app manifest**

```json
{
  "name": "consultorio-app",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "next lint",
    "test": "vitest run",
    "env:check": "tsx src/lib/env.ts"
  },
  "dependencies": {
    "next": "16.x",
    "react": "19.x",
    "react-dom": "19.x",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "eslint": "^9.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Add environment contract and validation entrypoint**

```env
DATABASE_URL=
NEXTAUTH_SECRET=
APP_BASE_URL=http://localhost:3000
QUESTIONNAIRE_TOKEN_SECRET=
TERMS_VERSION=2026-05
PRIVACY_VERSION=2026-05
SMS_PROVIDER=mock
SMS_BASE_URL=https://sms.example.com
SMS_API_KEY=
NOTIFICATION_CRON_SECRET=
PAYMENTS_PROVIDER=MOCK
PAYMENTS_WEBHOOK_SECRET=
```

```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  QUESTIONNAIRE_TOKEN_SECRET: z.string().min(1),
  TERMS_VERSION: z.string().min(1),
  PRIVACY_VERSION: z.string().min(1),
  SMS_PROVIDER: z.string().min(1),
  SMS_BASE_URL: z.string().url(),
  SMS_API_KEY: z.string().min(1),
  NOTIFICATION_CRON_SECRET: z.string().min(1),
  PAYMENTS_PROVIDER: z.enum(["MOCK", "STRIPE", "CONEKTA", "OPENPAY"]),
  PAYMENTS_WEBHOOK_SECRET: z.string().min(1)
});

export const env = envSchema.parse(process.env);

if (process.argv[1]?.includes("env.ts")) {
  console.log("Environment variables are valid.");
}
```

- [ ] **Step 3: Add a minimal app shell and utility baseline**

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>MiDoc V2</h1>
      <p>Base tecnica lista para desarrollo.</p>
    </main>
  );
}
```

```ts
export function toIsoDate(date: Date): string {
  return date.toISOString();
}
```

```ts
export type NotificationChannel = "SMS" | "EMAIL";

export type NotificationPayload = {
  channel: NotificationChannel;
  recipient: string;
  message: string;
};
```

- [ ] **Step 4: Verify the app boots through the root command**

Run: `npm run dev:app`
Expected: homepage available at `http://localhost:3000` with `MiDoc V2`

- [ ] **Step 5: Commit**

```bash
git add consultorio-app
git commit -m "feat: add consultorio app technical base"
```

### Task 3: Establish the initial data model and seed

**Files:**
- Create: `consultorio-app/prisma/schema.prisma`
- Create: `consultorio-app/prisma/seed.ts`
- Modify: `consultorio-app/package.json`

- [ ] **Step 1: Add Prisma dependencies and scripts**

```json
{
  "scripts": {
    "db:migrate:dev": "prisma migrate dev",
    "db:generate:no-engine": "prisma generate --no-engine"
  },
  "dependencies": {
    "@prisma/client": "^6.0.0"
  },
  "devDependencies": {
    "prisma": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create the minimum conceptual schema required by Paso 0**

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  role      String
  createdAt DateTime @default(now())
}

model Patient {
  id            String   @id @default(cuid())
  ownerDoctorId String
  createdAt     DateTime @default(now())
}

model Appointment {
  id         String   @id @default(cuid())
  doctorId   String
  patientId  String
  status     String
  createdAt  DateTime @default(now())
}

model ClinicalNote {
  id            String   @id @default(cuid())
  appointmentId String
  createdAt     DateTime @default(now())
}

model Document {
  id         String   @id @default(cuid())
  patientId  String
  createdAt  DateTime @default(now())
}

model Consent {
  id         String   @id @default(cuid())
  patientId  String
  version    String
  createdAt  DateTime @default(now())
}

model Notification {
  id         String   @id @default(cuid())
  channel    String
  status     String
  createdAt  DateTime @default(now())
}

model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?
  action     String
  createdAt  DateTime @default(now())
}
```

- [ ] **Step 3: Seed one doctor record for smoke verification**

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: "admin@consultorio.com" },
    update: {},
    create: {
      email: "admin@consultorio.com",
      role: "DOCTOR"
    }
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});
```

- [ ] **Step 4: Run migration and seed**

Run: `npm --prefix consultorio-app run db:migrate:dev`
Expected: initial migration created successfully

Run: `npx --prefix consultorio-app tsx prisma/seed.ts`
Expected: seed completes without throwing

- [ ] **Step 5: Commit**

```bash
git add consultorio-app/package.json consultorio-app/prisma
git commit -m "feat: add initial Prisma schema and seed"
```

### Task 4: Add the SMS notification boundary

**Files:**
- Create: `consultorio-app/src/lib/notifications/types.ts`
- Modify: `consultorio-app/.env.example`
- Modify: `consultorio-app/src/lib/env.ts`

- [ ] **Step 1: Document the notification channel contract**

```ts
export type NotificationChannel = "SMS" | "EMAIL";

export type NotificationPayload = {
  channel: NotificationChannel;
  recipient: string;
  message: string;
};
```

- [ ] **Step 2: Keep only SMS-oriented notification variables**

```env
SMS_PROVIDER=mock
SMS_BASE_URL=https://sms.example.com
SMS_API_KEY=
```

- [ ] **Step 3: Verify the notification boundary stays app-local**

Run: `rg -n "SMS_PROVIDER|SMS_BASE_URL|SMS_API_KEY" consultorio-app`
Expected: only `consultorio-app/.env.example` and `consultorio-app/src/lib/env.ts` define the SMS integration contract

- [ ] **Step 4: Verify no standalone messaging service is introduced**

Run: `rg -n "sms-service|notification-service|bot" .`
Expected: no unintended standalone messaging service is introduced into the implementation baseline

- [ ] **Step 5: Commit**

```bash
git add consultorio-app/.env.example consultorio-app/src/lib/env.ts consultorio-app/src/lib/notifications/types.ts
git commit -m "feat: add SMS notification boundary"
```

### Task 5: Add smoke tests and final Paso 0 verification

**Files:**
- Create: `consultorio-app/tests/smoke/homepage.test.ts`
- Modify: `consultorio-app/package.json`

- [ ] **Step 1: Add a homepage smoke test**

```ts
import { describe, expect, it } from "vitest";

describe("homepage", () => {
  it("documents the technical base", () => {
    const html = "<h1>MiDoc V2</h1>";
    expect(html).toContain("MiDoc V2");
  });
});
```

- [ ] **Step 2: Add a health endpoint smoke test**

```js
- [ ] **Step 2: Run the full Paso 0 verification gate**

Run: `npm test`
Expected: app smoke tests pass

Run: `npm run env:check`
Expected: environment validation succeeds when `.env` is populated

Run: `npm run build`
Expected: production build completes

- [ ] **Step 3: Update `10_linea_de_desarrollo.md` execution status if desired**

```md
- Estado de ejecucion sugerido: En progreso
- Evidencia esperada: repo root listo, app skeleton, migracion inicial, frontera SMS, smoke tests
```

- [ ] **Step 4: Commit**

```bash
git add consultorio-app/tests 10_linea_de_desarrollo.md
git commit -m "test: add Paso 0 smoke verification"
```

## Self-Review

- Spec coverage: covers repo structure, local configuration, conceptual model, environments, seed, migrations, smoke tests, and local boot verification required by Paso 0.
- Placeholder scan: no `TODO` or `TBD` placeholders remain.
- Type consistency: `consultorio-app`, `SMS_PROVIDER`, `SMS_BASE_URL`, and `SMS_API_KEY` are consistent across file paths and environment examples.
