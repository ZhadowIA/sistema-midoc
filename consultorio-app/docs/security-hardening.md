# Security Hardening - MiDoc

Fecha: 2026-04-27

## Medidas implementadas

### 1. Headers de seguridad globales

Archivo:

- `src/proxy.ts`

Headers aplicados:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `Content-Security-Policy` con:
  - `base-uri 'self'`
  - `object-src 'none'`
  - `frame-ancestors 'none'`
  - `form-action 'self'`
- `Strict-Transport-Security` en producción bajo HTTPS

### 2. No-cache para APIs

El proxy añade headers `no-store` a rutas `/api/*` cubiertas por el matcher:

- `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0`
- `Pragma: no-cache`
- `Expires: 0`

Esto reduce riesgo de cachear datos clínicos, de paciente o sesión.

### 3. Protección básica contra CSRF por validación de origen

El proxy bloquea requests mutantes (`POST`, `PUT`, `PATCH`, `DELETE`) cuando:

- existe cookie de sesión `med_token`
- la ruta pertenece a namespaces protegidos:
  - `/api/admin`
  - `/api/agenda/admin`
  - `/api/auth`
  - `/api/clinical/admin`
  - `/api/medico`
- `Origin` o `Referer` no coinciden con orígenes permitidos de la app

Orígenes permitidos:

- `request.nextUrl.origin`
- `APP_BASE_URL`
- `Host`
- `X-Forwarded-Host` + `X-Forwarded-Proto`

Esto evita falsos positivos en Docker/proxies donde el origen público (`localhost:3000`) puede no coincidir con el origen interno resuelto por Next.

Esto protege las rutas autenticadas basadas en cookie sin romper webhooks ni endpoints internos.

### 4. Política mínima de contraseña

Archivo:

- `src/lib/passwordPolicy.ts`

Requisitos:

- mínimo 10 caracteres
- al menos una mayúscula
- al menos una minúscula
- al menos un número
- al menos un símbolo

Aplicado en:

- `src/app/api/auth/register/route.ts`
- `src/app/api/auth/patient/register/route.ts`

### 5. Rate limit en registros

Se agregó rate limiting a:

- Registro médico: `POST /api/auth/register`
- Registro paciente: `POST /api/auth/patient/register`

Límite actual:

- 8 intentos por hora por IP + email/teléfono

### 6. Bloqueo progresivo por fuerza bruta

Archivo:

- `src/lib/authLockout.ts`

Aplicado en:

- Login médico: `POST /api/auth/login`
- Login paciente: `POST /api/auth/patient/login`

Política actual:

- 5 fallos en ventana de 30 minutos → bloqueo 5 minutos
- 8 fallos → bloqueo 15 minutos
- 12 fallos → bloqueo 60 minutos

El bloqueo se limpia al iniciar sesión correctamente.

### 7. Auditoría de accesos clínicos

Archivo:

- `src/lib/clinicalAudit.ts`

Registra eventos en `AuditLog` para accesos de lectura a información clínica sensible.

Acciones agregadas:

- `CLINICAL_PATIENT_VIEWED`
- `CLINICAL_HISTORY_VIEWED`
- `CLINICAL_APPOINTMENT_VIEWED`
- `CLINICAL_ENCOUNTER_CONTEXT_VIEWED`

Rutas instrumentadas:

- `GET /api/clinical/admin/patients/[id]`
- `GET /api/admin/patients/[id]/clinical-history`
- `GET /api/agenda/admin/appointments/[id]`
- `GET /api/clinical/admin/encounters/[id]/context`

Cada log incluye, cuando aplica:

- `doctorId`
- `actorUserId`
- `patientId`
- `appointmentId`
- IP
- user agent
- metadata de ruta

## Controles existentes observados

- Login médico con rate limit.
- Login paciente con rate limit.
- Cookie `med_token`:
  - `httpOnly`
  - `sameSite: strict`
  - `secure` en producción
  - expiración corta: 15 minutos
- Validación de sesión con JWT firmado.
- Verificación de usuario activo y rol contra base de datos en cada request autenticado.
- Modelo `AuditLog` existente para auditoría general.
- Modelo `SecurityIncident` existente para gestión de incidentes.

## Pendientes recomendados

1. Añadir rotación de refresh token si se requiere sesión larga.
2. Activar 2FA para médicos/admins.
3. Añadir auditoría de cambios de configuración.
4. Agregar allowlist explícita para callbacks externos.
5. Revisar CSP completa cuando se estabilicen dominios externos de imágenes, pagos, IA y analytics.
6. Añadir limpieza programada de estados expirados en `SecurityState` si el volumen lo exige.

## Nota de producción sobre rate limiting y lockout

Actualmente `rateLimitCore` y `authLockout` usan una abstracción compartida (`src/lib/securityStateStore.ts`).

La implementación productiva usa PostgreSQL mediante la tabla `SecurityState` cuando:

- `NODE_ENV=production`, o
- `SECURITY_STATE_BACKEND=DATABASE`

En desarrollo y pruebas, el fallback continúa en memoria para no exigir infraestructura adicional.

La actualización por clave se serializa con `pg_advisory_xact_lock(hashtext(key))`, lo que permite consistencia multi-instancia sin introducir Redis como dependencia obligatoria del stack actual.
