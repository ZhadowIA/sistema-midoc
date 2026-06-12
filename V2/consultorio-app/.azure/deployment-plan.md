# Deployment Plan — MiDoc V2 Portal (nube)

- **Status:** Ready for Validation
- **Decisiones confirmadas:** Cómputo = Azure Container Apps · Región = **Mexico Central** · Aprobado generar artefactos (sin desplegar).

## Verificación de la preparación (2026-06-12)

- ✅ Bicep compila sin errores: `az bicep build --file infra/main.bicep` (exit 0).
- ✅ Imagen Docker construye de extremo a extremo: `docker build` (exit 0) — `npm ci` + `prisma generate` + `next build` standalone.
- ✅ Contenedor arranca y sirve: Next.js 16.2.6 levanta y `GET /api/health` responde **HTTP 200**.
- 🔧 Corregido: `package-lock.json` estaba desincronizado (faltaban deps opcionales `@emnapi/*` resueltas en Linux). Regenerado dentro de contenedor Linux para que `npm ci` sea reproducible.
- ℹ️ Advertencias `SecretsUsedInArgOrEnv` en build: son placeholders desechables para que `next build` pase la validación de env; los valores reales se inyectan en runtime desde Key Vault.

## Artefactos generados

- `next.config.ts` → `output: "standalone"` + `outputFileTracingRoot`.
- `Dockerfile` (multi-stage: deps → build con placeholders → runner no-root, puerto 3000, Prisma engine + CLI).
- `.dockerignore`.
- `azure.yaml` (proyecto azd, host containerapp).
- `infra/main.bicep` (suscripción: RG + módulo) · `infra/resources.bicep` (ACA, ACR, PostgreSQL Flexible, Key Vault, Managed Identity, Log Analytics/App Insights, jobs de migración y cron) · `infra/main.parameters.json`.

## Próximos pasos para desplegar (requieren tu Azure)

1. Instalar **azd** (`winget install microsoft.azd`) y `az login` / `azd auth login`.
2. `azd env new` y definir secretos/proveedores: `NEXTAUTH_SECRET`, `QUESTIONNAIRE_TOKEN_SECRET`, `TWO_FACTOR_ENCRYPTION_KEY`, `NOTIFICATION_CRON_SECRET`, `PAYMENTS_WEBHOOK_SECRET`, `POSTGRES_ADMIN_PASSWORD`, `SMS_API_KEY`, `EMAIL_API_KEY` (estos dos cuando estén los proveedores reales).
3. `azd provision --preview` (what-if) → `azd up`.
4. Tras el primer despliegue: ejecutar el **job de migraciones** (`prisma migrate deploy`) una vez.
5. Verificar la URL pública y la salud; configurar dominio propio + TLS para el piloto.
- **Skill:** azure-prepare
- **Fecha:** 2026-06-12
- **Alcance:** Solo preparación de artefactos (Dockerfile, azure.yaml, infra/*.bicep, .dockerignore). NO desplegar todavía.

## 1. Workspace / modo

- **Modo:** MODIFY (app existente; se añade infraestructura Azure, no se reestructura el código).
- **Raíz del proyecto azd:** `V2/consultorio-app` (monorepo: `V1/` congelado, `V2/` activo). azd y los artefactos viven aquí; este `.azure/` también.
- **Componente único a desplegar:** el portal Next.js (`consultorio-app`). La app del médico (`V2/desktop-app`, Tauri) NO se despliega en la nube — se distribuye como instalador firmado (track aparte).

## 2. Requisitos / clasificación

- **Sensibilidad:** datos de salud → alta. **REGLA DE ORO:** ningún dato clínico se persiste en la nube. El portal solo guarda identidad, agenda pública, suscripción y buzón temporal cifrado (purgado tras ACK). El expediente clínico vive en la app local del médico.
- **Escala:** piloto pequeño (2–3 médicos). Min réplicas = 1 (evitar cold start en app clínica), max bajo.
- **Cumplimiento:** HTTPS obligatorio, secretos en Key Vault (purge protection ON), Managed Identity, sin credenciales hardcodeadas, auditoría/retención ya implementadas en la app.

## 3. Scan de la base de código

- **Stack:** Next.js 16.2.6 (App Router), TypeScript estricto, Prisma 6 + PostgreSQL, Zod en fronteras.
- **Build:** `npm run build` (`next build`). Sin script `start`; en prod se corre el **standalone output** (`node server.js`). → añadir `output: "standalone"` a `next.config.ts`.
- **Puerto:** Next escucha en `3000` (HTTP). Ingress y listening deben coincidir.
- **GOTCHA build:** `src/lib/env.ts` hace `envSchema.parse(process.env)` al importarse → `next build` falla sin todas las variables. Solución: placeholders válidos como `ARG/ENV` en la etapa de build del Dockerfile (APP_BASE_URL = url válida, EMAIL_FROM = email válido); valores reales en runtime vía App Settings/Key Vault. El standalone server re-lee `process.env` al arrancar.
- **Prisma:** `prisma generate` en build (no requiere DB). `prisma migrate deploy` se ejecuta como **job controlado** (no en el arranque de la app, para evitar carreras entre réplicas).
- **Variables de entorno requeridas:** DATABASE_URL, NEXTAUTH_SECRET, APP_BASE_URL, QUESTIONNAIRE_TOKEN_SECRET, TERMS_VERSION, PRIVACY_VERSION, SMS_PROVIDER, SMS_BASE_URL, SMS_API_KEY, EMAIL_PROVIDER, EMAIL_BASE_URL, EMAIL_API_KEY, EMAIL_FROM, NOTIFICATION_CRON_SECRET, PAYMENTS_PROVIDER, PAYMENTS_WEBHOOK_SECRET, TWO_FACTOR_ENCRYPTION_KEY.
  - **Secretos (Key Vault):** DATABASE_URL, NEXTAUTH_SECRET, QUESTIONNAIRE_TOKEN_SECRET, SMS_API_KEY, EMAIL_API_KEY, NOTIFICATION_CRON_SECRET, PAYMENTS_WEBHOOK_SECRET, TWO_FACTOR_ENCRYPTION_KEY.
  - **No secretos (App Settings):** APP_BASE_URL, TERMS_VERSION, PRIVACY_VERSION, SMS_PROVIDER, SMS_BASE_URL, EMAIL_PROVIDER, EMAIL_BASE_URL, EMAIL_FROM, PAYMENTS_PROVIDER.

## 4. Recipe

- **AZD + Bicep** (default). Bicep bajo `infra/`, `azure.yaml` en la raíz del proyecto. Desplegable con `azd up` (lo ejecuta la skill azure-deploy más tarde, no ahora).

## 5. Arquitectura propuesta

| Componente | Servicio Azure | Notas |
|---|---|---|
| Cómputo | **Azure Container Apps (ACA)** | Ingress HTTPS gestionado, puerto 3000, min 1 / max 3 réplicas. Alternativa: App Service for Containers (más simple). Recomiendo ACA por jobs cron nativos. |
| Registro de imágenes | **Azure Container Registry (ACR)** | Sin pull anónimo. Pull vía Managed Identity. |
| Base de datos | **Azure Database for PostgreSQL Flexible Server** | Solo datos mínimos del portal (no clínicos). Backups automáticos. Credencial en Key Vault. |
| Secretos | **Azure Key Vault** | Purge protection ON. Secretos referenciados por ACA con Managed Identity. |
| Identidad | **User-assigned Managed Identity** | AcrPull + Key Vault Secrets User. Sin credenciales en código. |
| Cron (cola de notificaciones + limpieza) | **ACA Job (scheduled)** | Invoca los endpoints internos con NOTIFICATION_CRON_SECRET. |
| Migraciones | **ACA Job (manual/release)** | `prisma migrate deploy` controlado, no en arranque de la app. |
| Observabilidad | **Log Analytics + Application Insights** | Logs estructurados (sin contenido clínico), alertas 5xx/DB. |

- **Región:** por confirmar con el usuario (sugerencia: Mexico Central por residencia, o East US 2 por disponibilidad/cuota).
- **Dominio:** dominio gestionado de ACA con TLS para el piloto; dominio propio después (requisito del doc 08).

## 6. Artefactos a generar (Fase 2, tras aprobación)

- `V2/consultorio-app/Dockerfile` — multi-stage (deps → build con placeholders → runner standalone, usuario no-root, puerto 3000).
- `V2/consultorio-app/.dockerignore`.
- `next.config.ts` — añadir `output: "standalone"`.
- `V2/consultorio-app/azure.yaml` — proyecto azd con el servicio del portal.
- `V2/consultorio-app/infra/` — Bicep: ACA env + app, ACR, PostgreSQL Flexible, Key Vault, Managed Identity, Log Analytics/App Insights, ACA Jobs (cron + migraciones), role assignments.

## 7. Fuera de alcance de esta preparación

- Despliegue real (`azd up`) → skill azure-deploy, después de azure-validate.
- Proveedores reales de SMS/correo y de IA (con BAA) → tracks aparte.
- Pasarela de pago real.
- Instalador firmado de la app del médico.
