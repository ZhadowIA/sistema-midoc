# Sistema MiDoc — Documentacion Tecnica Completa (Respaldo Legacy)

> Archivo historico de respaldo.
> Documento vigente: **`docs/SISTEMA_ACTUAL.md`**.
> Indice de documentacion: **`docs/INDICE_DOCUMENTACION.md`**.

---

## 🗂️ Índice

1. [Descripción General](#1-descripción-general)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Estructura de Carpetas](#3-estructura-de-carpetas)
4. [Base de Datos (Esquema)](#4-base-de-datos-esquema)
5. [Autenticación y Roles](#5-autenticación-y-roles)
6. [API — Rutas Públicas](#6-api--rutas-públicas)
7. [API — Rutas del Médico (Admin)](#7-api--rutas-del-médico-admin)
8. [API — Rutas Internas](#8-api--rutas-internas)
9. [Flujos de Usuario](#9-flujos-de-usuario)
10. [Servicios Backend](#10-servicios-backend)
11. [Sistema de Notificaciones (WhatsApp)](#11-sistema-de-notificaciones-whatsapp)
12. [Cuestionario Pre-clínico](#12-cuestionario-pre-clínico)
13. [Expediente Clínico (SOAP)](#13-expediente-clínico-soap)
14. [Variables de Entorno](#14-variables-de-entorno)
15. [Scripts y Utilidades](#15-scripts-y-utilidades)

---

## 1. Descripción General

MiDoc es una plataforma SaaS para consultorios médicos que permite:

- **Pacientes:** Reservar citas online, responder cuestionarios pre-clínicos y (con cuenta) ver su historial de citas.
- **Médicos:** Gestionar agenda, revisar citas, redactar notas SOAP, emitir recetas digitales y administrar expedientes de pacientes.
- **Sistema:** Enviar notificaciones automáticas de confirmación, recordatorio y cuestionario por WhatsApp.

---

## 2. Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Lenguaje | TypeScript 5 |
| Base de Datos | PostgreSQL |
| ORM | Prisma 6 |
| Autenticación | JWT (jose) + cookies HttpOnly |
| UI | Vanilla CSS + Tailwind (variables CSS) |
| Animaciones | Framer Motion (motion/react) |
| Notificaciones | Microservicio WhatsApp externo (puerto 3001) |
| Rate Limiting | In-memory por IP (personalizado) |
| Validación | Zod |
| Fechas | date-fns v4 |

---

## 3. Estructura de Carpetas

```
consultorio-app/
├── prisma/
│   └── schema.prisma              # Definición completa de la BD
├── src/
│   ├── app/
│   │   ├── page.tsx               # Landing pública del médico (con slug)
│   │   ├── agendar/               # Flujo de agendado en 7 pasos
│   │   ├── confirmacion/          # Página post-reserva
│   │   ├── cuestionario/[token]/  # Cuestionario pre-clínico dinámico
│   │   ├── medico/                # Panel médico (protegido)
│   │   │   ├── login/
│   │   │   ├── registro/
│   │   │   ├── dashboard/
│   │   │   ├── agenda/
│   │   │   ├── citas/[id]/        # Detalle + SOAP + Receta
│   │   │   ├── pacientes/         # Directorio + [id] ficha
│   │   │   ├── configuracion/
│   │   │   └── cuestionarios/
│   │   └── api/
│   │       ├── auth/              # login, register (médico y paciente)
│   │       ├── public/            # Endpoints abiertos (sin auth)
│   │       ├── admin/             # Endpoints del médico (con auth)
│   │       └── internal/          # Endpoints internos (cron/microservicio)
│   ├── components/                # Componentes UI reutilizables
│   ├── services/                  # Lógica de negocio (backend)
│   ├── lib/                       # Utilidades: auth, prisma, dateTime, rateLimit
│   └── tests/                     # Suite de pruebas (unit + integration)
├── docs/                          # Documentación del sistema
└── .env                           # Variables de entorno
```

---

## 4. Base de Datos (Esquema)

### Modelos

#### `User`
Unificado para todos los roles del sistema.

| Campo | Tipo | Descripción |
|---|---|---|
| id | cuid | PK |
| name | String | Nombre completo |
| email | String (único) | Correo de acceso |
| passwordHash | String | Contraseña hasheada (bcrypt) |
| role | UserRole | `DOCTOR`, `ADMIN` o `PATIENT` |
| active | Boolean | Cuenta activa o suspendida |
| specialty | String? | Especialidad (solo médicos) |
| slug | String? | URL pública del médico (`/dr-nombre`) |
| bio | String? | Descripción pública |
| profileImage | String? | URL de imagen de perfil |

#### `DoctorConfig`
Configuración del consultorio del médico.

| Campo | Descripción |
|---|---|
| consultationDurationMin | Duración base de cita normal (ej. 30 min) |
| extendedConsultationEnabled | Habilitar cita extendida (doble duración) |
| whatsappConnected | Si el microservicio WhatsApp está activo |
| normalConsultationPrice | Precio consulta normal |
| extendedConsultationPrice | Precio consulta extendida |

#### `Patient`
Representa a un paciente. Puede estar vinculado o no a una cuenta `User`.

| Campo | Descripción |
|---|---|
| userId | FK opcional a User (vincula cuenta de paciente) |
| fullName | Nombre del paciente |
| dateOfBirth | Fecha de nacimiento (para cálculo de edad) |
| phone | Teléfono (usado para WhatsApp) |
| email | Correo opcional |

> **Nota:** Un solo `User` puede tener múltiples registros `Patient` (ej. una madre que agenda para sus hijos).

#### `AvailabilityBlock`
Bloques de tiempo en los que el médico atiende.

| Campo | Descripción |
|---|---|
| date | Fecha del bloque |
| startTime / endTime | Horario de inicio y fin |
| isPublic | Visible para el agendado público |
| active | Bloque activo o cancelado |

#### `ScheduleBlock`
Bloqueos manuales de la agenda (vacaciones, reuniones, etc.).

| Tipo | Descripción |
|---|---|
| BLOCKED | Franja bloqueada por cualquier razón |
| PRIVATE_RESERVED | Reservada internamente, sin cita pública |

#### `Appointment`
La cita en sí.

| Campo | Descripción |
|---|---|
| appointmentType | `NORMAL` o `EXTENDED` |
| source | `PATIENT` (online) o `DOCTOR` (manual) |
| status | `PENDING`, `CONFIRMED`, `CANCELLED`, `RESCHEDULED`, `COMPLETED` |
| notes | Comentarios internos del médico (no visibles al paciente) |

#### `Questionnaire`
Cuestionario pre-clínico respondido por el paciente antes de la cita.

| Campo | Descripción |
|---|---|
| primarySymptom | Síntoma principal seleccionado |
| responses | JSON flexible con preguntas y respuestas |

#### `ClinicalNote` (Nota SOAP)
Nota de la consulta por el médico.

| Campo | Descripción |
|---|---|
| subjective | Subjetivo: síntomas referidos por el paciente |
| objective | Objetivo: signos observados |
| assessment | Diagnóstico/evaluación |
| plan | Plan de tratamiento |
| privateNotes | Notas privadas del médico (nunca visibles al paciente) |

#### `Prescription`
Medicamentos recetados, vinculados a una `ClinicalNote`.

| Campo | Descripción |
|---|---|
| medication | Nombre del medicamento |
| dosage | Dosis |
| frequency | Frecuencia de administración |
| duration | Duración del tratamiento |
| instructions | Indicaciones especiales |

#### `MedicalRecord`
Expediente fijo del paciente (datos crónicos).

| Campo | Descripción |
|---|---|
| bloodType | Tipo de sangre |
| allergies | Alergias conocidas |
| chronicConditions | Enfermedades crónicas |
| familyHistory | Antecedentes familiares |

#### `Notification`
Cola de mensajes salientes por WhatsApp.

| Estado | Descripción |
|---|---|
| PENDING | En cola, no enviado aún |
| SENT | Enviado exitosamente |
| FAILED | Falló el envío (con razón en `externalId`) |

---

## 5. Autenticación y Roles

### Flujo de sesión
1. El usuario envía correo + contraseña a `/api/auth/login`
2. El servidor valida y genera un **JWT** firmado con `NEXTAUTH_SECRET`
3. El token se guarda en una cookie `med_token` (HttpOnly, SameSite=strict)
4. Todas las rutas protegidas llaman a `getAuthenticatedDoctorId()` de `src/lib/auth.ts`

### Roles

| Rol | Acceso |
|---|---|
| `DOCTOR` | Panel médico completo (`/medico/*`) |
| `ADMIN` | Mismo que DOCTOR (acceso a gestión de configuración) |
| `PATIENT` | Solo puede acceder a su sesión en el flujo de agendado |

### Registro
- **Médicos/Admins:** `POST /api/auth/register` — crea usuario + configuración inicial
- **Pacientes:** `POST /api/auth/patient/register` — crea usuario con rol `PATIENT`

---

## 6. API — Rutas Públicas

> Sin autenticación requerida. Con **rate limiting** por IP.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/public/doctors` | Lista médicos activos con slug/perfil |
| GET | `/api/public/doctors?slug=X` | Datos de un médico específico |
| GET | `/api/public/availability` | Horarios disponibles para una fecha |
| GET | `/api/public/availability/month` | Días disponibles en un rango de mes |
| POST | `/api/public/appointments` | Crear una nueva cita (reserva pública) |
| GET | `/api/public/questionnaire/[token]` | Obtener cuestionario por token |
| POST | `/api/public/questionnaire/[token]` | Guardar respuestas del cuestionario |

---

## 7. API — Rutas del Médico (Admin)

> Requieren cookie `med_token` válida con rol `DOCTOR` o `ADMIN`.

### Perfil y Configuración
| Método | Ruta | Descripción |
|---|---|---|
| GET/PATCH | `/api/admin/profile` | Ver y editar perfil del médico |
| GET/PATCH | `/api/admin/config` | Ver y editar configuración del consultorio |

### Agenda
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/agenda/day` | Citas del día con detalles |

### Disponibilidad
| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/admin/availability` | Listar/crear bloques de disponibilidad |
| PATCH/DELETE | `/api/admin/availability/[id]` | Editar o eliminar un bloque |
| GET | `/api/admin/availability/slots` | Franjas específicas de un bloque |

### Bloqueos
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/admin/blocks` | Crear un bloqueo manual |

### Citas
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/appointments/[id]` | Detalle completo de una cita |
| PATCH | `/api/admin/appointments/[id]` | Actualizar estado/notas/reagendar |
| GET/POST | `/api/admin/appointments/[id]/note` | Ver o guardar nota SOAP |

### Pacientes
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/patients` | Directorio de todos los pacientes |
| GET/PATCH | `/api/admin/patients/[id]` | Ficha + expediente de un paciente |
| POST | `/api/admin/patients/merge` | Fusionar dos expedientes duplicados |

### Cuestionarios
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/questionnaires` | Listar cuestionarios pendientes |

### Notificaciones
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/admin/notifications/process` | Procesar cola + reintentos + recordatorios |
| GET | `/api/admin/notifications/status` | Panel de estado de notificaciones |

---

## 8. API — Rutas Internas

> Para uso de cron jobs o el microservicio de WhatsApp.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/internal/notifications` | Trigger de procesamiento interno |

---

## 9. Flujos de Usuario

### 9.1 Flujo de Agendado Público (`/agendar`)

El paciente sigue un wizard de **7 pasos**:

```
[Cuenta] → [Médico] → [Tipo] → [Fecha] → [Horario] → [Datos] → [Confirmar]
```

| Paso | Descripción |
|---|---|
| **Cuenta** | Iniciar sesión, registrarse o continuar como invitado |
| **Médico** | Seleccionar especialista (si no viene por slug directo) |
| **Tipo** | Consulta Normal o Primera Vez/Integral (extendida) |
| **Fecha** | Calendario mensual — solo habilita días con horarios reales |
| **Horario** | Franjas disponibles ese día sin solapamiento |
| **Datos** | Nombre, teléfono, fecha de nacimiento (correo opcional) |
| **Confirmar** | Resumen + botón de reserva |

**Post-reserva:**
- Si WhatsApp conectado → mensaje de confirmación + link a cuestionario
- Redirige a `/confirmacion`

### 9.2 Cuestionario Pre-clínico (`/cuestionario/[token]`)

Wizard de **3 pasos**:
1. **Catálogo de síntomas** — el paciente selecciona sus síntomas principales
2. **Preguntas contextuales** — preguntas específicas al síntoma elegido
3. **Datos base** — confirmación y envío

El token se genera del `appointmentId` y expira si ya fue respondido.

### 9.3 Panel del Médico (`/medico/*`)

| Sección | Funcionalidad |
|---|---|
| **Dashboard** | Resumen del día: citas pendientes, urgencias |
| **Agenda** | Vista de citas con filtro por día |
| **Cita [id]** | Status, reagendamiento, notas SOAP, receta |
| **Pacientes** | Directorio buscable + ficha con expediente y fusión |
| **Configuración** | Perfil público, precios, duración, WhatsApp |
| **Cuestionarios** | Revisar formularios pendientes de citas |

---

## 10. Servicios Backend

### `AppointmentService`
- `createPublicAppointment()` — valida disponibilidad, crea paciente (o vincula existente), crea cita y dispara notificaciones
- Lógica de deduplicación: busca paciente por `userId+nombre` o `nombre+teléfono` antes de crear uno nuevo.

### `AvailabilityService`
- `getAvailability()` — franjas disponibles para una fecha específica
- `getAvailableDatesInMonth()` — días del mes con al menos una franja libre (para el calendario)

### `NotificationService`
Sistema de cola completo:
- `enqueueConfirmation()` — encola mensaje de confirmación
- `enqueueQuestionnaireInvitation()` — encola link al cuestionario
- `enqueueDueReminders()` — detecta citas próximas y encola recordatorios
- `processPendingQueue()` — despacha mensajes PENDING al proveedor WhatsApp
- `retryFailedNotifications()` — reintenta mensajes FAILED (máx. 3 intentos en 24h)
- `getDoctorNotificationStatus()` — estadísticas del panel de notificaciones

### `QuestionnaireService`
- `generateToken()` — token seguro derivado del `appointmentId`
- `validateToken()` — verifica token y retorna cita asociada
- `saveQuestionnaire()` — guarda objeto JSON de respuestas flexible

---

## 11. Sistema de Notificaciones (WhatsApp)

### Arquitectura
```
MiDoc (Next.js)  →  Cola Notification (PostgreSQL)  →  Microservicio WA (localhost:3001)
```

### Tipos de mensajes
| Tipo | Cuándo se envía |
|---|---|
| `CONFIRMATION` | Al crear una cita exitosamente |
| `QUESTIONNAIRE_INVITATION` | Junto con la confirmación, con link al cuestionario |
| `REMINDER` | `X` minutos antes de la cita (configurable por env) |

### Configuración
```env
WHATSAPP_API_URL=http://localhost:3001/api/whatsapp/send
NOTIFICATION_REMINDER_LEAD_MINUTES=60
NOTIFICATION_MAX_RETRY_ATTEMPTS=3
NOTIFICATION_RETRY_WINDOW_HOURS=24
```

### Reintentos
- Máximo `3` intentos por mensaje en una ventana de `24h`
- Razón del fallo guardada en `externalId` con prefijo `FAILED:`
- Mensajes de reintento registran `RETRY_OF:<id_original>`

---

## 12. Cuestionario Pre-clínico

### Catálogo de síntomas disponibles

Cada síntoma despliega preguntas específicas adaptadas:

- **Dolor** → localización, intensidad, duración, irradiación, tipo
- **Fiebre** → temperatura, días, escalofríos
- **Tos** → productiva o seca, duración, expectoración
- **Problemas digestivos** → náuseas, vómito, diarrea, dolor abdominal
- **Problemas respiratorios** → disnea, sibilancias, posición ortopneica
- **Piel** → tipo de lesión, distribución, prurito
- **Otros síntomas** → descripción libre

Las respuestas se guardan como `Json` en `Questionnaire.responses`, permitiendo escalabilidad sin migraciones constantes.

---

## 13. Expediente Clínico (SOAP)

Cada cita puede tener una **Nota Clínica SOAP**:

| Sección | Descripción |
|---|---|
| **S** (Subjetivo) | Lo que refiere el paciente: síntomas, historia |
| **O** (Objetivo) | Lo que observa el médico: signos, estudios |
| **A** (Assessment) | Diagnóstico o impresión clínica |
| **P** (Plan) | Tratamiento, medicamentos, seguimiento |
| **Notas privadas** | Observaciones internas (nunca visibles al paciente) |

Junto a la nota SOAP, el médico puede agregar **Recetas** con medicamentos, dosis y frecuencia. La receta es **imprimible en hoja carta** desde la vista de la cita.

### Privacidad
- El paciente (con cuenta) puede ver sus **citas futuras y pasadas**
- El paciente **NO** puede ver notas SOAP, notas privadas ni diagnósticos

---

## 14. Variables de Entorno

```env
# Base de datos
DATABASE_URL="postgresql://user:password@localhost:5432/consultorio"

# JWT
NEXTAUTH_SECRET="tu_secreto_seguro_aqui"

# URL base de la aplicación
APP_BASE_URL="http://localhost:3000"

# WhatsApp
WHATSAPP_API_URL="http://localhost:3001/api/whatsapp/send"

# Notificaciones (opcionales, tienen valores por defecto)
NOTIFICATION_REMINDER_LEAD_MINUTES=60
NOTIFICATION_MAX_RETRY_ATTEMPTS=3
NOTIFICATION_RETRY_WINDOW_HOURS=24
```

---

## 15. Scripts y Utilidades

### Comandos clave

```bash
# Iniciar en desarrollo
npm run dev

# Compilar producción
npm run build

# Sincronizar esquema BD (sin migraciones)
npx prisma db push

# Generar cliente Prisma
npx prisma generate

# Abrir Prisma Studio (explorador visual de BD)
npx prisma studio

# Ejecutar todas las pruebas
npx tsx src/tests/run-all.ts

# Solo pruebas unitarias
npx tsx src/tests/run-unit.ts

# Solo pruebas de integración
npx tsx src/tests/run-integration.ts
```

### Rate Limiting (`src/lib/rateLimitCore.ts`)

Sistema in-memory por IP. Configuración estándar:
- **Agendado público:** 10 solicitudes / 5 minutos
- **Login:** 5 intentos / 15 minutos
- Límite máximo de buckets en memoria: 10,000

### `src/lib/dateTime.ts`

Utilidades para manejo de fechas locales sin problemas de zona horaria:
- `parseDateOnlyLocal(dateStr)` — parsea `YYYY-MM-DD` sin conversión UTC
- `getDayRangeLocal(dateStr)` — inicio y fin exclusivo de un día
- `toLocalDateKey(date)` — convierte Date a string `YYYY-MM-DD` local
- `alignToSlotGrid(gridStart, target, slotMinutes)` — alinea hora al siguiente slot disponible

---

## 📌 Pendientes y Mejoras Futuras

- [ ] Vista del paciente autenticado: `/mis-citas` con historial de reservas
- [ ] Panel de estadísticas del médico (ingresos, citas por mes)
- [ ] Soporte multi-médico por consultorio
- [ ] Integración de pagos anticipados (Stripe/Conekta)
- [ ] App móvil nativa (React Native / Expo)
- [ ] Agenda recurrente (bloques semanales automáticos)
