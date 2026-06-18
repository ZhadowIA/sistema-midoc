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

## 🎨 Hallazgos UX/UI — prueba visual de la desktop-app (MiDoc)

Probado vía computer-use simulando al médico. Creé un perfil de prueba ("QA Bot
Prueba"), exploré crear/desbloquear/bloquear y la pantalla de vinculación. Tus dos
perfiles reales NO se tocaron. Perfil de prueba y datos eliminados al terminar.

- **UX-1 — Alta de perfil nuevo reutiliza la pantalla de "desbloquear".** Al crear un
  médico nuevo, la pantalla dice *"Frase de seguridad — Confirma la frase de este perfil
  para abrir su base cifrada local"* y el botón es **"Desbloquear"**, igual que para un
  perfil existente. Para un perfil nuevo debería invitar a **crear/establecer** una frase
  y, idealmente, pedir **confirmación** de la frase. Riesgo: un typo al fijar la frase la
  primera vez deja la base (vacía) inaccesible con esa frase, sin que el usuario lo note.
  → Sugerencia de tu decisión; no lo cambié por ser UX de producto.
- **UX-2 — Mensaje de error de vinculación sin localizar. ✅ ARREGLADO.** Con credenciales
  inválidas la app mostraba **"Error: Invalid credentials."** en inglés. Origen:
  `auth-service.ts` (3 sitios) en el portal, inconsistente con sus vecinas en español
  (p. ej. *"Codigo invalido."*). Localizado a **"Credenciales invalidas."** Ningún test
  dependía de la cadena; typecheck y tests de auth/2FA en verde.
- **UX-3 (menor) — Nombres de perfil truncados sin tooltip.** Las tarjetas muestran
  "Medico pri…" / "Medico Ad…" sin forma de ver el nombre completo (sin `title`/tooltip).

### Lo que funciona bien (desktop)
- Crear perfil → base cifrada local generada con respaldo automático (`backups\midoc-…db`).
- Desbloqueo y **Bloquear** (vuelve al selector) correctos.
- Validación de formulario de vinculación: campos vacíos bloqueados (HTML5) y credenciales
  inválidas rechazadas con error visible, sin crash. Conecta bien a `http://localhost:3000`.

## 🧪 Pruebas interactivas — flujo del paciente (portal, vía API contra :3000)

Sembré un médico público de prueba, ejercité el flujo y limpié todo después.

- ✅ **Búsqueda pública** funciona (`/api/public/doctors?q=…`). *(Falsa alarma inicial: usé
  `query=` en vez de `q=`; descartado.)*
- ✅ **Disponibilidad** (`/availability`) devuelve slots con timezone `America/Chihuahua`.
- ✅ **Apartar horario** (`/holds`) → token con expiración.
- ✅ **Reservar** (`POST /appointments`) → 201, cita `PENDING` con `confirmationToken`.
- ✅ **Ver cita** por token → 200 con datos completos.
- ✅ **Dedupe de paciente**: reservar con el mismo email reutiliza el mismo `patientId`.
- ✅ **Anti doble-reserva**: apartar el mismo slot dos veces → **HTTP 409** con mensaje claro.
- ✅ Páginas públicas renderizan (200): `/`, `/medico/registro`, `/recuperar`, `/admin/login`,
  `/perfil/<slug>`, `/perfil/<slug>/agenda`. Sin errores de render (500).

## 🔁 Redundancias de flujo

- No se detectaron redundancias graves en los flujos probados. La única duplicación de
  comportamiento observada (Bug #3: doble envío al procesar la cola) era artefacto de test,
  no de la app. La reutilización de la pantalla de desbloqueo para "crear perfil" (UX-1) es
  una redundancia de **UI/copy**, no de lógica.

## ⚠️ Requieren tu decisión

1. **Vinculación del dispositivo (desktop) no probada end-to-end.** Requiere autenticarse con
   credenciales reales del portal; por las reglas de seguridad no introduzco contraseñas para
   autenticar, ni con cuentas de prueba. El área de trabajo del médico (agenda, consultas,
   transcripción) vive detrás de ese paso. → Cuando vuelvas, tú haces la vinculación y seguimos
   la prueba visual del workspace.
2. **`fileParallelism: false` (Bug #4).** Cambio de config de tests. Alternativa si quieres
   conservar paralelismo: separar unit (paralelo) de integración (secuencial) en dos configs.
3. **UX-1 / UX-2 / UX-3** arriba: son decisiones de producto/UI; no las apliqué.
4. **e2e no ejecutable** mientras tu `npm run dev` esté activo (limitación de Next 16, no es bug).

## ✅ Arreglos aplicados (commits, rama `qa/autonomous-test-run-20260617`)

| Commit | Qué |
|--------|-----|
| `627b5fc` | Bug #1 — import faltante en `notifications.integration.test.ts` |
| `ed9ccd4` | Bug #2 — `doctor-search` actualizado al flujo endurecido de registro |
| `ef4b106` | Bug #3 — aislar verificación de correo en tests de proveedor |
| `4e75fa4` | Bug #4 — integración sin paralelismo de archivos (BD compartida) |
| `dba382d` | docs — este informe |
| `d6ef5eb` | chore — snapshot de tu WIP previo (para diffs limpios) |

> Todos los cambios son **locales**, sin push ni PR. La rama parte de `codex/paso21…`.
> Resultado neto: `npm run test` pasó de **rojo (7 fallos + typecheck roto)** a **124/124 verde**
> y determinista. Backend Rust 147/147, scripts desktop 7/7, lint limpio.
