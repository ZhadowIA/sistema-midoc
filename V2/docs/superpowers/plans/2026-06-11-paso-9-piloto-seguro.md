# Paso 9 Piloto Seguro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-pilot safety controls for the portal and desktop app without moving clinical source-of-truth data into the cloud.

**Architecture:** Start with portal operational readiness because it can be completed independently: health/readiness routes, a maintenance cleanup service, and an authenticated internal cleanup endpoint. Then add desktop backup/restore and installer/update documentation as separate follow-up units.

**Tech Stack:** Next.js 16 App Router route handlers, Prisma, Vitest, Tauri 2/Rust for later desktop backup work, Playwright CLI for E2E verification.

---

### Task 1: Portal Health And Readiness

**Files:**
- Create: `V2/consultorio-app/src/services/operations/health-service.ts`
- Create: `V2/consultorio-app/src/app/api/health/route.ts`
- Create: `V2/consultorio-app/src/app/api/readiness/route.ts`
- Test: `V2/consultorio-app/tests/integration/operations.integration.test.ts`

- [x] **Step 1: Write failing tests** for liveness and DB readiness.
- [x] **Step 2: Run the focused test** with `npm run test -- tests/integration/operations.integration.test.ts` and confirm missing module failures.
- [x] **Step 3: Implement minimal service and routes** using `NextResponse.json`, no clinical data, and DB `SELECT 1`.
- [x] **Step 4: Re-run the focused test** and confirm it passes.

### Task 2: Portal Maintenance Cleanup

**Files:**
- Create: `V2/consultorio-app/src/services/operations/maintenance-service.ts`
- Create: `V2/consultorio-app/src/app/api/internal/maintenance/cleanup/route.ts`
- Test: `V2/consultorio-app/tests/integration/operations.integration.test.ts`

- [x] **Step 1: Write failing tests** for expiring holds, password reset tokens, upload links, authorized summaries, stale mailbox documents, and notifications whose short links expired.
- [x] **Step 2: Run the focused test** and confirm `runPilotCleanup` is missing.
- [x] **Step 3: Implement cleanup as a domain service** with counts-only audit metadata and no logged clinical content.
- [x] **Step 4: Add authenticated internal route** using `NOTIFICATION_CRON_SECRET`.
- [x] **Step 5: Re-run focused test** and confirm status/counts.

### Task 3: Desktop Backup And Restore

**Files:**
- Modify: `V2/desktop-app/src-tauri/src/db.rs`
- Modify: `V2/desktop-app/src-tauri/src/lib.rs`
- Modify: `V2/desktop-app/src/ipc.ts`
- Modify: `V2/desktop-app/README.md`
- Test: Rust unit tests or command-level integration tests under `V2/desktop-app/src-tauri`.

- [x] **Step 1: Write failing Rust tests** for encrypted backup creation and restore rejection on wrong key.
- [x] **Step 2: Implement encrypted automatic backup on unlock and explicit restore check.**
- [x] **Step 3: Document restore drill commands.**

### Task 4: E2E Pilot Checklist

**Files:**
- Create: `V2/docs/paso-9-piloto-seguro.md`
- Create: `V2/consultorio-app/tests/e2e/pilot-smoke.e2e.test.ts`

- [x] **Step 1: Document staging checklist** for registration, booking, sync, consultation, documents, notifications, recovery, backup, restore.
- [x] **Step 2: Live HTTP smoke** (`tests/e2e/pilot-smoke.e2e.test.ts`, `npm run test:e2e`) boots `next dev` and verifies liveness, DB readiness, a seeded public profile render, and a 404 for an unknown slug. Implemented as a Vitest HTTP suite (no browser engine) to match the existing test stack; a dedicated `vitest.e2e.config.ts` keeps it out of the default `npm run test`.

### Task 5: Windows Installer Signing

**Files:**
- Create: `V2/desktop-app/scripts/sign-windows-installer.ps1`
- Modify: `V2/docs/paso-9-piloto-seguro.md`

- [x] **Step 1: Add a repeatable signing script** that validates prereqs and invokes `signtool.exe`.
- [x] **Step 2: Document the exact build/sign/verify flow** for the Windows installer.
- [ ] **Step 3: Obtain or import a real code-signing certificate** for release distribution.
