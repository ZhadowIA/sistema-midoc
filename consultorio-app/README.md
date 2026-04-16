# Sistema MiDoc (Next.js + Prisma)
Sistema web para operación de consultorio médico: agenda pública, panel médico, expediente clínico, cuestionario preconsulta y notificaciones.

Documentacion tecnica vigente: `docs/SISTEMA_ACTUAL.md`  
Indice de documentacion: `docs/INDICE_DOCUMENTACION.md`  
Documento tecnico anterior (legacy): `docs/README.md`

## Stack
- Next.js App Router
- Prisma ORM + PostgreSQL
- React + TypeScript
- Radix UI + Tailwind

## Requisitos
- Node.js 22+ (recomendado 24+)
- PostgreSQL 14+
- npm 10+

## Configuración local
1. Crea variables desde `.env.example`:
```bash
cp .env.example .env
```
En PowerShell:
```powershell
Copy-Item .env.example .env
```

2. Instala dependencias:
```bash
npm install
```

3. Inicializa base de datos:
```bash
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
```

4. Inicia app:
```bash
npm run dev
```

## Credenciales seed
- Admin médico: `admin@consultorio.com`
- Password: `admin123`

## Scripts útiles
- `npm run dev`: desarrollo
- `npm run build`: build producción
- `npm run start`: servir build
- `npm run lint`: lint
- `npm run test`: suite completa (unit + integración)
- `npm run test:unit`: solo unitarias
- `npm run test:integration`: solo integración

## Casos de prueba API (smoke tests)
Todos asumen `BASE_URL=http://localhost:3000`.

### 1) Catálogo público de médicos
```bash
curl -s "http://localhost:3000/api/public/doctors"
```
Esperado: `200` + arreglo de médicos.

### 2) Disponibilidad diaria pública
1. Toma un `doctorId` del caso anterior.
2. Ejecuta:
```bash
curl -s "http://localhost:3000/api/public/availability?date=2026-04-15&type=normal&doctorId=REEMPLAZA_DOCTOR_ID"
```
Esperado: `200` + `{ slots: [...] }`.

### 3) Disponibilidad mensual pública
```bash
curl -s "http://localhost:3000/api/public/availability/month?startDate=2026-04-01&endDate=2026-05-01&type=normal&doctorId=REEMPLAZA_DOCTOR_ID"
```
Esperado: `200` + `{ dates: [...] }`.

### 4) Crear cita pública
Usa un `startTime` devuelto por disponibilidad:
```bash
curl -i -X POST "http://localhost:3000/api/public/appointments" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName":"Paciente Prueba",
    "dateOfBirth":"1990-05-10",
    "phone":"6141234567",
    "email":"paciente@example.com",
    "appointmentType":"NORMAL",
    "startTime":"REEMPLAZA_SLOT_START_ISO",
    "doctorId":"REEMPLAZA_DOCTOR_ID"
  }'
```
Esperado: `201` + `appointmentId` y `questionnaire.url`.

### 5) Login médico (cookie de sesión)
```bash
curl -i -c cookies.txt -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@consultorio.com","password":"admin123"}'
```
Esperado: `200` + cookie `med_token`.

### 6) Agenda diaria admin autenticada
```bash
curl -s -b cookies.txt "http://localhost:3000/api/admin/agenda/day?date=2026-04-15"
```
Esperado: `200` + citas/bloqueos del día.

### 7) Estado de notificaciones admin
```bash
curl -s -b cookies.txt "http://localhost:3000/api/admin/notifications/status?windowDays=7&failedLimit=5"
```
Esperado: `200` + resumen de `pending/sent/failed`.

### 8) Procesar cola de notificaciones admin
```bash
curl -i -b cookies.txt -X POST "http://localhost:3000/api/admin/notifications/process?retryFailed=true"
```
Esperado: `200` + conteo de recordatorios, reintentos y envíos.

## Variables por ambiente
Variables activamente consumidas por backend/frontend:

| Variable | Local | Staging | Producción | Notas |
|---|---|---|---|---|
| `DATABASE_URL` | Requerida | Requerida | Requerida | Cadena PostgreSQL con SSL según proveedor |
| `NEXTAUTH_SECRET` | Requerida | Requerida | Requerida | Firma de cookie JWT (`med_token`) |
| `APP_BASE_URL` | Requerida | Requerida | Requerida | URL pública base del sistema |
| `QUESTIONNAIRE_TOKEN_SECRET` | Requerida | Requerida | Requerida | Firma tokens de cuestionario |
| `NOTIFICATION_CRON_SECRET` | Opcional | Requerida* | Requerida* | Requerida si usas `/api/internal/notifications/process` |
| `WHATSAPP_API_URL` | Opcional | Opcional | Opcional | Endpoint proveedor WhatsApp |
| `NOTIFICATION_REMINDER_LEAD_MINUTES` | Opcional | Opcional | Opcional | Default: 60 |
| `NOTIFICATION_MAX_RETRY_ATTEMPTS` | Opcional | Opcional | Opcional | Default: 3 |
| `NOTIFICATION_RETRY_WINDOW_HOURS` | Opcional | Opcional | Opcional | Default: 24 |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Opcional | Opcional | Opcional | Si usas carga de imagen de perfil |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Opcional | Opcional | Opcional | Si usas carga de imagen de perfil |

## Checklist de despliegue
Checklist detallado en [`docs/DEPLOY_CHECKLIST.md`](docs/DEPLOY_CHECKLIST.md).

Resumen rápido:
1. Configurar variables del ambiente.
2. Ejecutar migraciones (`npx prisma migrate deploy`).
3. Compilar (`npm run build`) y levantar (`npm run start`).
4. Ejecutar smoke tests de API (sección anterior).
5. Verificar envío/cola de notificaciones y cron interno.

## Cron interno de notificaciones (opcional)
Endpoint interno:
```http
POST /api/internal/notifications/process
Header: x-notification-secret: <NOTIFICATION_CRON_SECRET>
```
Ejemplo:
```bash
curl -X POST "http://localhost:3000/api/internal/notifications/process?retryFailed=true" \
  -H "x-notification-secret: REEMPLAZA_SECRET"
```
