# Hallazgos QA — pasada autónoma 2026-06-17

Rama: `qa/autonomous-test-run-20260617`
Alcance: arreglar + commit local (sin push/PR). Respetando REGLAS_DESARROLLO.md.

## Estado de tests (antes / después)

| Suite | Antes | Después |
|-------|-------|---------|
| portal lint | ✅ limpio | ✅ limpio |
| portal typecheck | ❌ roto (Bug #1) | ✅ 0 errores |
| portal unit | ✅ 39/39 | ✅ 39/39 |
| portal integration | ❌ 7 fallos (Bugs #2,#3,#4) | ✅ 84/84 |
| portal `npm run test` (unit+int+smoke) | ❌ rojo (flaky) | ✅ 124/124 determinista |
| portal e2e | ⚠️ no ejecutable en este entorno (ver nota) | ⚠️ idem |
| desktop typecheck (tsc) | ✅ 0 errores | ✅ 0 errores |
| desktop scripts (.mjs) | ✅ 7/7 | ✅ 7/7 |
| desktop Rust (cargo test) | ✅ 147/147 | ✅ 147/147 |

> **Nota e2e:** la suite e2e arranca su propio `next dev`, pero Next 16 se niega a
> levantar un segundo servidor de desarrollo mientras tu `npm run dev` (puerto 3000)
> está activo (`⨯ Another next dev server is already running`). Es una limitación de
> entorno, no un fallo de código; la suite corre en CI con el entorno limpio. No se
> tocó tu servidor en ejecución.

## 🐛 Bugs encontrados

### Bug #1 — `notifications.integration.test.ts` no compila (falta import) ✅ ARREGLADO
- **Síntoma:** `npx tsc --noEmit` falla con `TS2304: Cannot find name 'approveDoctorAccountForTesting'` (líneas 109, 333, 486).
- **Causa:** el test usa el helper `approveDoctorAccountForTesting` pero, a diferencia del resto de tests de integración, no lo importaba desde `../helpers/doctor-accounts`.
- **Impacto:** el typecheck del proyecto entero quedaba roto; CI con typecheck habría fallado.
- **Fix:** añadido el import faltante.

### Bug #2 — `doctor-search.integration.test.ts` desactualizado tras el endurecimiento de registro ✅ ARREGLADO
- **Síntoma:** 3 tests fallan (`Nombre invalido`, `Verifica tu correo...`, `Cedula profesional invalida`).
- **Causa:** el helper `createPublicDoctor` no se actualizó al nuevo flujo endurecido:
  1. Derivaba el `firstName` con `/^Dr\.?\s*/i`, que para `"Dra. ..."` dejaba `"a."` (1 letra) → falla la validación correcta de ≥2 letras.
  2. Publicaba el perfil (`isPublic: true`) sin aprobar/verificar la cuenta, que ahora es requisito.
  3. Usaba cédula `"CED-SEARCH"` (sin dígitos), inválida para `normalizeLicenseNumber`.
- **Nota:** la lógica de la app es correcta; el test estaba obsoleto. Arreglé el test (regex, `approveDoctorAccountForTesting`, cédula válida).

### Bug #3 — Tests de proveedor de notificaciones no aíslan la verificación de correo ✅ ARREGLADO
- **Síntoma:** 3 tests fallan (`spy called 2 times`, `expected 2 to be 1`, `To = null`).
- **Causa:** el registro endurecido ahora encola una notificación `EMAIL_VERIFICATION` pendiente (`auth-service.ts:251 → requestDoctorEmailVerification → queueNotification`). Los tests "delivers pending ... through provider" creaban su propia notificación y procesaban la cola sin contar esa verificación → doble envío.
- **Nota:** comportamiento de la app correcto; tests obsoletos. Fix: limpiar las notificaciones auto-creadas antes de encolar la del test (3 tests: SMS/Twilio, Email/Resend, WhatsApp/Twilio).

### Bug #4 — Suite de integración inestable por paralelismo sobre BD compartida ✅ ARREGLADO
- **Síntoma:** `operations.integration.test.ts` falla en la suite completa (`expiredHolds: 0` esperando `1`) pero pasa en aislado. `npm run test` quedaba en rojo de forma intermitente.
- **Causa:** los tests de integración comparten una sola BD PostgreSQL y ejecutan operaciones globales (`runPilotCleanup`, expiración perezosa de holds). vitest corría los archivos en paralelo (sin overrides de pool), provocando carreras: un test de reservas en paralelo expiraba el hold "vencido" del test de operaciones antes de que este lo contara.
- **Fix:** `fileParallelism: false` en `vitest.config.ts`, con el mismo criterio que ya usaba `vitest.e2e.config.ts`. Suite completa: **124/124 en verde** y determinista.
- **⚠️ Para tu revisión:** es un cambio de configuración de tests. La suite tarda ~20s (antes corría en paralelo). Si prefieres mantener el paralelismo, la alternativa sería separar unit (paralelo) de integración (secuencial) en configs distintas.

## 🔁 Redundancias de flujo

(pendiente)

## ⚠️ Requieren tu decisión

(pendiente)

## ✅ Arreglos aplicados (commits)

(pendiente)
