# Checklist P0 con evidencia para go-live comercial

Estado: Vigente  
Última actualización: 2026-04-30  
Referencia principal: `docs/ops/go-live-roadmap-4-6-semanas.md`

## Instrucción de uso

No marcar una casilla solo porque “ya existe algo en código”.  
Cada ítem requiere una evidencia concreta: link a PR, documento, comando, incidente de prueba, captura o resultado verificable.

---

## 1. Pagos productivos

- [ ] Proveedor real confirmado (`STRIPE`, `CONEKTA` u `OPENPAY`)
  - Evidencia: bitácora `docs/ops/payments-e2e-evidence-2026-04-30.md` (campo `Proveedor`) + decisión operativa firmada.
- [ ] Credenciales productivas separadas de staging
  - Evidencia: bitácora `docs/ops/payments-e2e-evidence-2026-04-30.md` (precondiciones) + inventario de secretos por entorno.
- [ ] Alta de suscripción validada end-to-end
  - Evidencia: matriz E2E en `docs/ops/payments-e2e-evidence-2026-04-30.md` (caso Alta en `OK`).
- [ ] Renovación validada
  - Evidencia: matriz E2E en `docs/ops/payments-e2e-evidence-2026-04-30.md` (caso Renovación en `OK`).
- [ ] Impago validado
  - Evidencia: matriz E2E en `docs/ops/payments-e2e-evidence-2026-04-30.md` (caso Impago en `OK`) + coherencia con `docs/ops/commercial-state-policy.md`.
- [ ] Cancelación validada
  - Evidencia: matriz E2E en `docs/ops/payments-e2e-evidence-2026-04-30.md` (caso Cancelación en `OK`).
- [ ] Reactivación validada
  - Evidencia: matriz E2E en `docs/ops/payments-e2e-evidence-2026-04-30.md` (caso Reactivación en `OK`).
- [ ] Webhook repetido / idempotente validado
  - Evidencia: matriz E2E en `docs/ops/payments-e2e-evidence-2026-04-30.md` (caso Reenvío webhook en `OK`) + runbook `docs/ops/runbook-payment-webhook-failure.md`.

## 2. Estado comercial y política de gracia

- [x] Estado comercial canónico documentado
  - Evidencia: `docs/ops/commercial-state-policy.md` (definición explícita de `PENDING`, `ACTIVE`, `PAST_DUE`, `CANCELED`).
- [x] Regla de degradación funcional definida por estado
  - Evidencia: `docs/ops/commercial-state-policy.md` (fases de degradación y matriz funcional sugerida) + `docs/ops/runbook-impago.md`.
- [x] Política de gracia definida
  - Evidencia: `docs/ops/commercial-state-policy.md` (duración 0–3 / 4–7 / 8+ días).
- [x] Decisión explícita: bloqueo progresivo o corte total
  - Evidencia: `docs/ops/commercial-state-policy.md` (regla recomendada: bloqueo progresivo por fases).
- [x] UI muestra impacto funcional y siguiente acción
  - Evidencia: `src/server/subscription/helpers.ts` (severidad + mensaje accionable por estado) y consumo en overview de suscripción (`src/server/subscription/getSubscriptionOverview.ts`, `src/app/admin/clientes/AdminClientsConsole.tsx`).

## 3. Seguridad operativa

- [ ] Secretos de pruebas rotados
  - Evidencia: pendiente de corrida operativa en infraestructura (rotación efectiva + registro de fecha + responsable).
- [ ] Secrets staging/prod separados
  - Evidencia: pendiente de evidencia operativa (inventario de variables por entorno y validación de aislamiento).
- [x] Rate limit y lockout fuera de memoria de proceso
  - Evidencia: `src/lib/securityStateStore.ts` + `src/lib/rateLimitCore.ts` + `src/lib/authLockout.ts`; backend `SecurityState` (PostgreSQL) habilitado en `NODE_ENV=production` o `SECURITY_STATE_BACKEND=DATABASE`.
- [x] Validación multi-instancia o simulación equivalente documentada
  - Evidencia: `docs/security-hardening.md` (serialización con `pg_advisory_xact_lock(hashtext(key))`) + pruebas unitarias `src/tests/unit/rateLimit.test.ts` y `src/tests/unit/authLockout.test.ts`.
- [x] 2FA activado para `ADMIN`
  - Evidencia: rutas `src/app/api/admin/security/2fa/route.ts`, `src/app/api/auth/login/2fa/route.ts`, recovery codes en `src/app/api/admin/security/2fa/recovery-codes/route.ts`, store `src/server/security/twoFactorCredentialStore.ts`, y visibilidad operativa en `src/app/api/internal-admin/security/2fa/overview/route.ts`.

## 4. Continuidad

- [ ] Migraciones ejecutadas en staging con éxito
  - Evidencia: `docs/ops/migrations-playbook.md` + bitácora `docs/ops/continuity-drill-evidence-2026-04-30.md` (pendiente de salida real).
- [ ] Simulacro de backup documentado
  - Evidencia: `docs/ops/backup-restore.md` + bitácora `docs/ops/continuity-drill-evidence-2026-04-30.md` (pendiente de ejecución).
- [ ] Simulacro de restore documentado
  - Evidencia: `docs/ops/backup-restore.md` + bitácora `docs/ops/continuity-drill-evidence-2026-04-30.md` (pendiente de ejecución).
- [ ] Smoke tests posteriores al restore validados
  - Evidencia: `docs/ops/smoke-tests.md` + bitácora `docs/ops/continuity-drill-evidence-2026-04-30.md` (pendiente de salida `npm run smoke`).

## 5. Observabilidad mínima

- [x] Alertas de 5xx definidas
  - Evidencia: `docs/ops/minimum-alerts-matrix.md` (API tasa 5xx > 1%/5min) + instrumentación por endpoint en `src/lib/observability.ts` (`withEndpointObservability`, `logEndpointDuration`).
- [x] Alertas de webhook de pagos definidas
  - Evidencia: `docs/ops/minimum-alerts-matrix.md` + endpoint interno `GET /api/internal-admin/ops/overview` (`src/app/api/internal-admin/ops/overview/route.ts`) con contador `paymentWebhookFailed1h`.
- [x] Alertas de notificaciones fallidas definidas
  - Evidencia: `docs/ops/minimum-alerts-matrix.md` + `notificationsFailed1h` en `src/server/internal-admin/opsOverview.ts`.
- [x] Alertas de latencia crítica definidas
  - Evidencia: umbrales por endpoint en `src/lib/observability.ts` (`ENDPOINT_THRESHOLDS`) con severidad `warning/critical`.
- [x] Alertas de fallos IA definidas
  - Evidencia: `docs/ops/minimum-alerts-matrix.md` + `aiJobsFailed1h` en `src/server/internal-admin/opsOverview.ts`.
- [x] Alertas de costo IA anómalo definidas
  - Evidencia: `docs/ops/minimum-alerts-matrix.md` + métrica `estimatedAiCostUsd30d` en `src/server/internal-admin/opsOverview.ts` expuesta en `/admin/clientes` (`AdminClientsConsole.tsx`).

## 6. Cumplimiento mínimo

- [ ] Términos y privacidad con revisión final
  - Evidencia:
- [ ] Claims de IA alineados con política interna
  - Evidencia:
- [ ] Política de retención operativa lista para go-live
  - Evidencia:
- [ ] Consentimientos revisados para texto final
  - Evidencia:

## 7. Go / No-Go

- [ ] Todos los P0 cerrados con evidencia
- [ ] Rollback documentado
- [ ] Responsable técnico confirmado
- [ ] Responsable operativo confirmado
- [ ] Fecha tentativa de salida:
- [ ] Decisión final: `GO / NO-GO`

## Observaciones finales

- Riesgos abiertos:
- Riesgos aceptados:
- Acciones post-go-live inmediatas:
