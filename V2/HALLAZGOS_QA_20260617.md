# Hallazgos QA — pasada autónoma 2026-06-17

Rama: `qa/autonomous-test-run-20260617`
Alcance: arreglar + commit local (sin push/PR). Respetando REGLAS_DESARROLLO.md.

## Estado de tests (antes / después)

| Suite | Antes | Después |
|-------|-------|---------|
| portal lint | — | — |
| portal typecheck | — | — |
| portal unit | — | — |
| portal integration | — | — |
| portal e2e | — | — |
| desktop typecheck/build | — | — |

## 🐛 Bugs encontrados

### Bug #1 — `notifications.integration.test.ts` no compila (falta import) ✅ ARREGLADO
- **Síntoma:** `npx tsc --noEmit` falla con `TS2304: Cannot find name 'approveDoctorAccountForTesting'` (líneas 109, 333, 486).
- **Causa:** el test usa el helper `approveDoctorAccountForTesting` pero, a diferencia del resto de tests de integración, no lo importaba desde `../helpers/doctor-accounts`.
- **Impacto:** el typecheck del proyecto entero quedaba roto; CI con typecheck habría fallado.
- **Fix:** añadido el import faltante.

## 🔁 Redundancias de flujo

(pendiente)

## ⚠️ Requieren tu decisión

(pendiente)

## ✅ Arreglos aplicados (commits)

(pendiente)
