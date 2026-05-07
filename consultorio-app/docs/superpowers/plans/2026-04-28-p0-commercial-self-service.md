# P0 Commercial Self-Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect MiDoc's canonical commercial catalog to Stripe and prepare subscription self-service screens for real checkout, cancellation/reactivation, invoices, credits, and onboarding.

**Architecture:** Stripe remains the source of payment collection, invoices, payment methods and subscription lifecycle events. MiDoc remains the source of feature entitlement by normalizing selected plans into `DoctorSubscription.features`. The first implementation slice is a safe foundation: deterministic Stripe price mapping and checkout line item planning, then API routes and UI consume that contract.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, Stripe Billing, Zod, local unit test harness.

---

## Task 1: Stripe price catalog contract

**Files:**
- Create: `consultorio-app/src/lib/stripeCatalog.ts`
- Create: `consultorio-app/src/tests/unit/stripeCatalog.test.ts`
- Modify: `consultorio-app/src/tests/run-unit.ts`
- Modify: `consultorio-app/.env.example`

- [ ] **Step 1: Write the failing test**

Test that the local canonical plan selection resolves to the exact Stripe test price IDs created for P0-B.

- [ ] **Step 2: Run the test to verify RED**

Run: `node --import tsx src/tests/unit/stripeCatalog.test.ts`

Expected: FAIL because `src/lib/stripeCatalog.ts` does not exist yet.

- [ ] **Step 3: Implement `stripeCatalog.ts`**

Expose:
- `STRIPE_PRICE_ENV_KEYS`
- `getStripePriceConfig(env)`
- `buildStripeSubscriptionLineItems(selection, env)`

The function must:
- require one base plan price.
- allow zero or more add-on prices.
- return Stripe line items with quantity `1`.
- throw a clear configuration error when a selected plan/add-on lacks a price.

- [ ] **Step 4: Run focused tests**

Run: `node --import tsx src/tests/unit/stripeCatalog.test.ts`

Expected: PASS.

- [ ] **Step 5: Add env documentation**

Add P0-B Stripe price IDs to `.env.example`.

## Task 2: Checkout API consumes selected catalog

**Files:**
- Modify: `consultorio-app/src/app/api/payments/checkout/route.ts`
- Test: add pure helper coverage in `consultorio-app/src/tests/unit/stripeCatalog.test.ts`

- [ ] **Step 1: Update checkout request parsing**

Accept `{ basePlan, addOns }` and resolve line items via `buildStripeSubscriptionLineItems`.

- [ ] **Step 2: Preserve MOCK behavior**

When `PAYMENTS_PROVIDER !== "STRIPE"`, return the selected plan and mock checkout URL without creating a Stripe session.

- [ ] **Step 3: Preserve Stripe metadata**

Set `basePlan`, `addOns`, `displayName`, `doctorId`, `initiatedByUserId`, and `mode` on checkout/session subscription metadata.

## Task 3: Billing self-service endpoints

**Files:**
- Create: `consultorio-app/src/app/api/admin/subscription/cancel/route.ts`
- Create: `consultorio-app/src/app/api/admin/subscription/reactivate/route.ts`
- Create: `consultorio-app/src/app/api/admin/billing/portal/route.ts`
- Create: `consultorio-app/src/app/api/admin/billing/invoices/route.ts`

- [ ] **Step 1: Implement cancel/reactivate as explicit commands**

Use existing subscription service for DB state. For Stripe subscriptions, update `cancel_at_period_end` through Stripe where an external subscription ID exists.

- [ ] **Step 2: Implement Billing Portal route**

Create Stripe customer portal sessions when Stripe customer ID exists. Return clear 409 if no customer is attached yet.

- [ ] **Step 3: Implement invoice list route**

List invoices through Stripe for Stripe customers. Return local payment webhook history fallback for MOCK.

## Task 4: Impeccable UI pass

**Files:**
- Modify: `consultorio-app/src/app/medico/suscripcion/page.tsx`
- Modify: `consultorio-app/src/app/medico/onboarding/page.tsx`
- Optional create focused UI components under `consultorio-app/src/components/billing/`

- [ ] **Step 1: Redesign subscription page**

Use restrained product UI: status rail, selected plan editor, actions, invoices, credit CTA, and clear failure states.

- [ ] **Step 2: Redesign onboarding as wizard**

Use specialty-aware steps: profile, specialty, services/pricing, schedule, deposit/no-show, IA/credits, review.

## Self-review

- No placeholders remain in Task 1.
- Later tasks are intentionally scoped as implementation sequence after the contract is in place.
- The first slice is independently testable and safe to ship before UI rewiring.
