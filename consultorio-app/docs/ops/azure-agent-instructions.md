# Azure Deployment — Instrucciones para Agente IA

Este documento describe las adaptaciones de código necesarias para que el sistema MiDoc
pueda desplegarse en Azure. Léelo completo antes de escribir cualquier código.

---

## Contexto del sistema

Monorepo con dos servicios independientes:

| Servicio | Tecnología | Puerto |
|---|---|---|
| `consultorio-app` | Next.js 16 + Prisma + PostgreSQL | 3000 |
| `whatsapp-bot` | Express (whatsapp-web.js) | 3001 |

Los servicios se comunican por webhook:
- El bot hace `POST /api/internal/whatsapp/incoming` en consultorio-app (header `x-whatsapp-secret`)
- consultorio-app llama al bot via `WHATSAPP_API_URL`

Base de datos: PostgreSQL via Prisma ORM. Las migraciones están en `prisma/migrations/`.

---

## Tarea: Crear Dockerfiles y preparar el sistema para Azure App Service

### 1. Dockerfile para `consultorio-app`

Crea `consultorio-app/Dockerfile` con las siguientes reglas:

- Imagen base: `node:20-alpine`
- Usar **multi-stage build**: stage `deps`, stage `builder`, stage `runner`
- En el stage `deps`: copiar `package*.json` y correr `npm ci --omit=dev`
- En el stage `builder`: copiar todo, instalar devDeps y correr `npm run build`
  - **IMPORTANTE**: `next build` requiere `DATABASE_URL` como variable en tiempo de build
    para que Prisma genere el cliente correctamente. Pasar como ARG: `ARG DATABASE_URL`
  - Correr `npx prisma generate --no-engine` ANTES del build de Next.js
- En el stage `runner`:
  - Copiar `.next/standalone` (requiere `output: 'standalone'` en next.config.ts — ver punto 3)
  - Copiar `.next/static` a `.next/standalone/.next/static`
  - Copiar `public/` si existe
  - Copiar `prisma/` (schema + migrations) para poder correr migraciones en runtime
  - `EXPOSE 3000`
  - `CMD ["node", "server.js"]`

### 2. Dockerfile para `whatsapp-bot`

Crea `whatsapp-bot/Dockerfile` con las siguientes reglas:

- Imagen base: `node:20-alpine`
- Single-stage (no hay build)
- Instalar dependencias de sistema requeridas por `whatsapp-web.js`:
  ```
  chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont
  ```
- Variables de entorno en Dockerfile:
  ```
  ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
  ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
  ```
- Copiar `package*.json`, correr `npm ci --omit=dev`, copiar `index.js`
- `EXPOSE 3001`
- `CMD ["node", "index.js"]`

### 3. Modificar `consultorio-app/next.config.ts`

Agregar `output: 'standalone'` para que Next.js produzca un servidor Node.js autocontenido:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

**Por qué**: Sin esto, el build de Next.js requiere que toda la carpeta `node_modules` esté
presente en producción. `standalone` produce un `server.js` que solo incluye las dependencias
reales usadas — imagen Docker ~3x más pequeña.

### 4. Crear `.dockerignore` en cada servicio

`consultorio-app/.dockerignore`:
```
node_modules
.next
.env
.env.local
.env*.local
npm-debug.log*
```

`whatsapp-bot/.dockerignore`:
```
node_modules
.env
.env.local
npm-debug.log*
```

### 5. Crear `docker-compose.yml` en la raíz del monorepo (solo para testing local)

Este archivo no se usa en Azure, pero permite probar localmente antes de subir:

```yaml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: consultorio
      POSTGRES_USER: dbuser
      POSTGRES_PASSWORD: dbpassword
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  consultorio:
    build:
      context: ./consultorio-app
      args:
        DATABASE_URL: postgresql://dbuser:dbpassword@db:5432/consultorio
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://dbuser:dbpassword@db:5432/consultorio
      NEXTAUTH_SECRET: local-secret-change-in-prod
      APP_BASE_URL: http://localhost:3000
      WHATSAPP_API_URL: http://whatsapp-bot:3001
      WHATSAPP_WEBHOOK_SECRET: local-webhook-secret
      NOTIFICATION_CRON_SECRET: local-cron-secret
      QUESTIONNAIRE_TOKEN_SECRET: local-questionnaire-secret
      TERMS_VERSION: "1.0"
      PRIVACY_VERSION: "1.0"
      PAYMENTS_PROVIDER: MOCK
      PAYMENTS_WEBHOOK_SECRET: local-payments-secret
      NODE_ENV: production
    depends_on:
      - db
    command: sh -c "npx prisma migrate deploy && node server.js"

  whatsapp-bot:
    build:
      context: ./whatsapp-bot
    ports:
      - "3001:3001"
    environment:
      PORT: 3001
      APP_WEBHOOK_URL: http://consultorio:3000/api/internal/whatsapp/incoming
      APP_WEBHOOK_SECRET: local-webhook-secret

volumes:
  postgres_data:
```

### 6. Script de startup para migraciones en App Service

Crea `consultorio-app/scripts/start.sh`:

```bash
#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting Next.js server..."
exec node server.js
```

Actualizar el CMD del Dockerfile del runner stage para usar este script:
```dockerfile
COPY scripts/start.sh ./start.sh
RUN chmod +x start.sh
CMD ["./start.sh"]
```

---

## Variables de entorno esperadas en Azure App Service

El agente NO debe hardcodear estos valores. Son configurados manualmente en Azure Portal
bajo App Service → Configuration → Application settings.

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Connection string de Azure PostgreSQL Flexible Server |
| `NEXTAUTH_SECRET` | String aleatorio seguro (mínimo 32 caracteres) |
| `APP_BASE_URL` | URL pública del App Service (ej: `https://midoc.azurewebsites.net`) |
| `WHATSAPP_API_URL` | URL del whatsapp-bot App Service |
| `WHATSAPP_WEBHOOK_SECRET` | Mismo valor en ambos servicios |
| `NOTIFICATION_CRON_SECRET` | Secret para autenticar el cron interno |
| `QUESTIONNAIRE_TOKEN_SECRET` | Secret para tokens de cuestionarios |
| `TERMS_VERSION` | Versión de términos aceptados (ej: `"1.0"`) |
| `PRIVACY_VERSION` | Versión de política de privacidad (ej: `"1.0"`) |
| `OPENAI_API_KEY` | API key de OpenAI (requerida para SOAP AI) |
| `PAYMENTS_PROVIDER` | `MOCK` \| `STRIPE` \| `CONEKTA` \| `OPENPAY` |
| `PAYMENTS_WEBHOOK_SECRET` | Secret del proveedor de pagos |
| `NODE_ENV` | `production` |

---

## Restricciones y advertencias críticas

1. **No modificar** la lógica de negocio ni el schema de Prisma. Solo infraestructura.
2. **No usar** `npm run build` en el CMD del contenedor — el build va en el stage `builder`.
3. **whatsapp-web.js** requiere Puppeteer + Chromium. Azure App Service Linux soporta esto,
   pero el contenedor DEBE tener las dependencias de sistema instaladas (ver paso 2).
4. **Prisma genera** el cliente en build time. Si cambia `DATABASE_URL` en runtime, el cliente
   ya compilado sigue funcionando — pero si hay cambios de schema, se necesita rebuild.
5. **`output: 'standalone'`** cambia la estructura del output. El servidor ya no corre con
   `next start` sino con `node .next/standalone/server.js` (o `node server.js` si el CWD
   es `.next/standalone/`).
6. **No crear** archivos `.env` en la imagen Docker — las variables vienen del App Service.

---

## Archivos a crear/modificar (resumen)

| Acción | Archivo |
|---|---|
| CREAR | `consultorio-app/Dockerfile` |
| CREAR | `whatsapp-bot/Dockerfile` |
| CREAR | `consultorio-app/.dockerignore` |
| CREAR | `whatsapp-bot/.dockerignore` |
| CREAR | `docker-compose.yml` (raíz) |
| CREAR | `consultorio-app/scripts/start.sh` |
| MODIFICAR | `consultorio-app/next.config.ts` — agregar `output: 'standalone'` |

No crear ni modificar ningún otro archivo.
