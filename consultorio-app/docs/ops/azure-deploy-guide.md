# Guía de Deploy en Azure — MiDoc

Flujo completo paso a paso para subir el sistema a Azure desde cero.
Este guía ya asume el modelo modular actual de MiDoc:

- **Plan Agenda**
- **Plan Clínico**
- **Plan Integral**
- **Add-on IA**

La verdad operativa del producto vive en `DoctorSubscription.features`.
`planName` sigue existiendo solo como compatibilidad o etiqueta comercial derivada.
Tiempo estimado: 2-3 horas la primera vez.

---

## Requisitos previos

- [ ] Cuenta de Azure activa con suscripción (no Free Tier — necesitas B1 mínimo)
- [ ] Azure CLI instalado: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli
- [ ] Docker Desktop instalado y corriendo
- [ ] Git configurado y código en GitHub (repo privado recomendado)
- [ ] Node.js 20+ instalado localmente
- [ ] Tener a mano todas las API keys: OpenAI, proveedor de pagos, Stripe webhook

---

## Fase 0 — Preparar el código (ANTES de tocar Azure)

### 0.1 Ejecutar el agente de adaptación

Dale al agente IA el archivo `docs/ops/azure-agent-instructions.md`.
El agente creará/modificará estos archivos:

```
consultorio-app/Dockerfile
consultorio-app/.dockerignore
consultorio-app/next.config.ts        ← agrega output: 'standalone'
consultorio-app/scripts/start.sh
whatsapp-bot/Dockerfile
whatsapp-bot/.dockerignore
docker-compose.yml                     ← en raíz del monorepo
```

### 0.2 Verificar el build local con Docker

```bash
# Desde la raíz del monorepo
docker compose up --build

# Esperar a que ambos servicios estén corriendo
# Abrir http://localhost:3000 y verificar que funciona
# Si hay errores, resolverlos ANTES de continuar
docker compose down
```

### 0.3 Commit y push de todos los cambios

```bash
git add .
git commit -m "chore: add Docker and Azure deployment config"
git push origin main
```

---

## Fase 1 — Crear recursos en Azure

Todos los comandos se corren en la terminal. Primero loguearse:

```bash
az login
# Abre el navegador para autenticación
```

### 1.1 Definir variables (copiar y pegar, editar los valores)

```bash
# Editar estos valores antes de correr
RESOURCE_GROUP="midoc-rg"
LOCATION="eastus"                          # o "mexicocentral" si está disponible
ACR_NAME="midocregistry"                   # debe ser único globalmente, solo letras y números
PLAN_NAME="midoc-plan"
APP_CONSULTORIO="midoc-consultorio"        # debe ser único globalmente (es la URL)
APP_WHATSAPP="midoc-whatsapp"             # debe ser único globalmente
DB_SERVER_NAME="midoc-db-server"          # debe ser único globalmente
DB_NAME="consultorio"
DB_ADMIN_USER="midocadmin"
DB_ADMIN_PASSWORD="CambiaMeAhora123!"     # mínimo 8 chars, mayús, minús, número, símbolo
```

### 1.2 Crear Resource Group

```bash
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION
```

### 1.3 Crear Azure Container Registry

```bash
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true
```

Obtener credenciales del registry (guardarlas):

```bash
az acr credential show --name $ACR_NAME
# Guarda: username y password (los necesitas en el paso 1.7)
```

### 1.4 Crear PostgreSQL Flexible Server

```bash
az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER_NAME \
  --location $LOCATION \
  --admin-user $DB_ADMIN_USER \
  --admin-password $DB_ADMIN_PASSWORD \
  --tier Burstable \
  --sku-name Standard_B1ms \
  --storage-size 32 \
  --version 16
```

Crear la base de datos:

```bash
az postgres flexible-server db create \
  --resource-group $RESOURCE_GROUP \
  --server-name $DB_SERVER_NAME \
  --database-name $DB_NAME
```

Guardar el connection string (reemplazar valores):

```
postgresql://midocadmin:CambiaMeAhora123!@midoc-db-server.postgres.database.azure.com/consultorio?sslmode=require
```

### 1.5 Crear App Service Plan (Linux)

```bash
az appservice plan create \
  --name $PLAN_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku B2 \
  --is-linux
```

> **Nota**: B1 puede ser insuficiente para Next.js 16 con Prisma. Usar B2 ($~70/mes).
> Puedes bajar a B1 después de verificar que funciona bien.

### 1.6 Crear App Services

```bash
# Consultorio app
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $PLAN_NAME \
  --name $APP_CONSULTORIO \
  --deployment-container-image-name $ACR_NAME.azurecr.io/consultorio-app:latest

# WhatsApp bot
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $PLAN_NAME \
  --name $APP_WHATSAPP \
  --deployment-container-image-name $ACR_NAME.azurecr.io/whatsapp-bot:latest
```

### 1.7 Conectar App Services al Container Registry

```bash
# Obtener credenciales del ACR (si no las tienes)
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query passwords[0].value -o tsv)

# Configurar en consultorio app
az webapp config container set \
  --name $APP_CONSULTORIO \
  --resource-group $RESOURCE_GROUP \
  --docker-custom-image-name $ACR_NAME.azurecr.io/consultorio-app:latest \
  --docker-registry-server-url https://$ACR_NAME.azurecr.io \
  --docker-registry-server-user $ACR_USERNAME \
  --docker-registry-server-password $ACR_PASSWORD

# Configurar en whatsapp bot
az webapp config container set \
  --name $APP_WHATSAPP \
  --resource-group $RESOURCE_GROUP \
  --docker-custom-image-name $ACR_NAME.azurecr.io/whatsapp-bot:latest \
  --docker-registry-server-url https://$ACR_NAME.azurecr.io \
  --docker-registry-server-user $ACR_USERNAME \
  --docker-registry-server-password $ACR_PASSWORD
```

---

## Fase 2 — Configurar variables de entorno

### 2.1 Variables de consultorio-app

Ejecutar una sola vez (reemplazar TODOS los valores entre < >):

```bash
az webapp config appsettings set \
  --name $APP_CONSULTORIO \
  --resource-group $RESOURCE_GROUP \
  --settings \
    DATABASE_URL="postgresql://midocadmin:<PASSWORD>@midoc-db-server.postgres.database.azure.com/consultorio?sslmode=require" \
    NEXTAUTH_SECRET="<genera-con: openssl rand -hex 32>" \
    APP_BASE_URL="https://midoc-consultorio.azurewebsites.net" \
    APP_TIMEZONE="America/Chihuahua" \
    WHATSAPP_API_URL="https://midoc-whatsapp.azurewebsites.net" \
    WHATSAPP_WEBHOOK_SECRET="<genera-con: openssl rand -hex 16>" \
    NOTIFICATION_CRON_SECRET="<genera-con: openssl rand -hex 16>" \
    QUESTIONNAIRE_TOKEN_SECRET="<genera-con: openssl rand -hex 16>" \
    TERMS_VERSION="1.0" \
    PRIVACY_VERSION="1.0" \
    CLINICAL_HISTORY_ENABLED="true" \
    OPENAI_API_KEY="<tu-openai-key>" \
    DEEPGRAM_API_KEY="<tu-deepgram-api-key>" \
    DEEPGRAM_PROJECT_ID="<tu-deepgram-project-id>" \
    RECAPTCHA_V3_SECRET="<tu-recaptcha-secret-opcional>" \
    NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY="<tu-recaptcha-site-key-opcional>" \
    PAYMENTS_PROVIDER="MOCK" \
    PAYMENTS_WEBHOOK_SECRET="<genera-con: openssl rand -hex 16>" \
    STRIPE_SECRET_KEY="<sk_test_o_sk_live>" \
    STRIPE_WEBHOOK_SECRET="<whsec_...>" \
    STRIPE_PRICE_ID="<price_id_legacy_opcional>" \
    NODE_ENV="production" \
    WEBSITES_PORT="3000"
```

> **Nota comercial**
>
> Si vas a vender el catálogo modular completo en Stripe, conviene provisionar price IDs separados para:
>
> - `PLAN_AGENDA`
> - `PLAN_CLINICAL`
> - `PLAN_INTEGRAL`
> - `ADDON_AI`
>
> Si todavía no tienes todos los productos creados, puedes arrancar con un solo `STRIPE_PRICE_ID` para el plan activo principal y luego ampliar el catálogo.

### 2.1.1 Matriz de variables por feature (importante)

Usa esta matriz para evitar estados “a medias” en producción:

| Feature | Variables requeridas |
|---|---|
| Núcleo app (siempre) | `DATABASE_URL`, `NEXTAUTH_SECRET`, `APP_BASE_URL`, `APP_TIMEZONE`, `QUESTIONNAIRE_TOKEN_SECRET`, `TERMS_VERSION`, `PRIVACY_VERSION` |
| Clínico unificado | `CLINICAL_HISTORY_ENABLED=true` |
| IA clínica (dictado + insights) | `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `DEEPGRAM_PROJECT_ID` |
| Captcha público (opcional) | `RECAPTCHA_V3_SECRET` + `NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, y price IDs de catálogo (recomendado por plan/add-on) |

> Si defines `OPENAI_API_KEY` sin Deepgram, el sistema puede mostrar capacidades IA parciales/no disponibles según contexto.
> Si defines `RECAPTCHA_V3_SECRET` sin `NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY`, el frontend no podrá completar el flujo de captcha.

### 2.2 Variables de whatsapp-bot

```bash
az webapp config appsettings set \
  --name $APP_WHATSAPP \
  --resource-group $RESOURCE_GROUP \
  --settings \
    PORT="3001" \
    APP_WEBHOOK_URL="https://midoc-consultorio.azurewebsites.net/api/internal/whatsapp/incoming" \
    APP_WEBHOOK_SECRET="<mismo valor que WHATSAPP_WEBHOOK_SECRET arriba>" \
    WEBSITES_PORT="3001"
```

> **Generar secrets seguros** (correr localmente en terminal):
> ```bash
> openssl rand -hex 32   # para NEXTAUTH_SECRET
> openssl rand -hex 16   # para los demás secrets
> ```

---

## Fase 3 — Build y push de imágenes Docker

### 3.1 Loguearse al Container Registry

```bash
az acr login --name $ACR_NAME
```

### 3.2 Build y push de consultorio-app

```bash
cd consultorio-app

docker build \
  --build-arg DATABASE_URL="postgresql://midocadmin:<PASSWORD>@midoc-db-server.postgres.database.azure.com/consultorio?sslmode=require" \
  -t $ACR_NAME.azurecr.io/consultorio-app:latest \
  -t $ACR_NAME.azurecr.io/consultorio-app:v1.0.0 \
  .

docker push $ACR_NAME.azurecr.io/consultorio-app:latest
docker push $ACR_NAME.azurecr.io/consultorio-app:v1.0.0

cd ..
```

### 3.3 Build y push de whatsapp-bot

```bash
cd whatsapp-bot

docker build \
  -t $ACR_NAME.azurecr.io/whatsapp-bot:latest \
  -t $ACR_NAME.azurecr.io/whatsapp-bot:v1.0.0 \
  .

docker push $ACR_NAME.azurecr.io/whatsapp-bot:latest
docker push $ACR_NAME.azurecr.io/whatsapp-bot:v1.0.0

cd ..
```

---

## Fase 4 — Primera migración de base de datos

La migración corre automáticamente al iniciar el contenedor (via `start.sh`),
pero la PRIMERA vez conviene correrla manualmente para verificar que funciona:

```bash
# Conectar al App Service via SSH y correr migración
az webapp ssh --name $APP_CONSULTORIO --resource-group $RESOURCE_GROUP

# Dentro del contenedor:
npx prisma migrate deploy
exit
```

Si el SSH no está disponible aún (el contenedor está arrancando), esperar 2-3 minutos y reintentar.

---

## Fase 5 — Verificar que funciona

### 5.1 Ver logs en tiempo real

```bash
# Logs de consultorio-app
az webapp log tail \
  --name $APP_CONSULTORIO \
  --resource-group $RESOURCE_GROUP

# En otra terminal: logs de whatsapp-bot
az webapp log tail \
  --name $APP_WHATSAPP \
  --resource-group $RESOURCE_GROUP
```

### 5.2 Reiniciar servicios si es necesario

```bash
az webapp restart --name $APP_CONSULTORIO --resource-group $RESOURCE_GROUP
az webapp restart --name $APP_WHATSAPP --resource-group $RESOURCE_GROUP
```

### 5.3 Checklist de verificación

Abrir en el navegador: `https://midoc-consultorio.azurewebsites.net`

- [ ] La app carga sin errores 500
- [ ] `/api/auth/login` responde (aunque sea 401)
- [ ] Se puede registrar un usuario nuevo
- [ ] Se puede iniciar sesión
- [ ] El panel del doctor carga
- [ ] La suscripción muestra el catálogo modular correcto:
  - Plan Agenda
  - Plan Clínico
  - Plan Integral
  - Add-on IA
- [ ] Los logs no muestran errores de DATABASE_URL o conexión

---

## Fase 6 — Configurar dominio personalizado (opcional)

Si tienes un dominio propio (ej: `app.midoc.mx`):

```bash
# Verificar ownership del dominio primero en tu DNS provider
# Luego asignar dominio en App Service:
az webapp custom-hostname add \
  --webapp-name $APP_CONSULTORIO \
  --resource-group $RESOURCE_GROUP \
  --hostname app.midoc.mx

# SSL gratuito con App Service Managed Certificate:
az webapp config ssl create \
  --resource-group $RESOURCE_GROUP \
  --name $APP_CONSULTORIO \
  --hostname app.midoc.mx

# Bindear SSL:
az webapp config ssl bind \
  --certificate-thumbprint <thumbprint-del-paso-anterior> \
  --ssl-type SNI \
  --name $APP_CONSULTORIO \
  --resource-group $RESOURCE_GROUP
```

Actualizar `APP_BASE_URL` con el dominio real:

```bash
az webapp config appsettings set \
  --name $APP_CONSULTORIO \
  --resource-group $RESOURCE_GROUP \
  --settings APP_BASE_URL="https://app.midoc.mx"
```

---

## Fase 7 — CI/CD automático con GitHub Actions (opcional pero recomendado)

Crear `.github/workflows/deploy.yml` en el repositorio:

```yaml
name: Deploy to Azure

on:
  push:
    branches: [main]

env:
  ACR_NAME: midocregistry
  RESOURCE_GROUP: midoc-rg

jobs:
  deploy-consultorio:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Login to Azure
        uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Login to ACR
        run: az acr login --name $ACR_NAME

      - name: Build and push consultorio-app
        run: |
          docker build \
            --build-arg DATABASE_URL="${{ secrets.DATABASE_URL }}" \
            -t $ACR_NAME.azurecr.io/consultorio-app:${{ github.sha }} \
            -t $ACR_NAME.azurecr.io/consultorio-app:latest \
            ./consultorio-app
          docker push $ACR_NAME.azurecr.io/consultorio-app:latest
          docker push $ACR_NAME.azurecr.io/consultorio-app:${{ github.sha }}

      - name: Deploy to App Service
        run: |
          az webapp config container set \
            --name midoc-consultorio \
            --resource-group $RESOURCE_GROUP \
            --docker-custom-image-name $ACR_NAME.azurecr.io/consultorio-app:${{ github.sha }}

  deploy-whatsapp:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Login to Azure
        uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Login to ACR
        run: az acr login --name $ACR_NAME

      - name: Build and push whatsapp-bot
        run: |
          docker build \
            -t $ACR_NAME.azurecr.io/whatsapp-bot:${{ github.sha }} \
            -t $ACR_NAME.azurecr.io/whatsapp-bot:latest \
            ./whatsapp-bot
          docker push $ACR_NAME.azurecr.io/whatsapp-bot:latest

      - name: Deploy to App Service
        run: |
          az webapp config container set \
            --name midoc-whatsapp \
            --resource-group $RESOURCE_GROUP \
            --docker-custom-image-name $ACR_NAME.azurecr.io/whatsapp-bot:${{ github.sha }}
```

Agregar estos secrets en GitHub → Settings → Secrets:

| Secret | Cómo obtener el valor |
|---|---|
| `AZURE_CREDENTIALS` | `az ad sp create-for-rbac --name midoc-deploy --role contributor --scopes /subscriptions/<id>/resourceGroups/midoc-rg --sdk-auth` |
| `DATABASE_URL` | El connection string de PostgreSQL |

---

## Costos estimados (USD/mes)

| Recurso | Tier | Costo aprox |
|---|---|---|
| App Service Plan B2 (ambas apps comparten el plan) | B2 Linux | ~$70 |
| PostgreSQL Flexible Server | Burstable B1ms | ~$15 |
| Container Registry | Basic | ~$5 |
| **Total** | | **~$90/mes** |

> Para reducir costos en etapa de pruebas, usar B1 (~$35) y escalar cuando sea necesario.

---

## Troubleshooting frecuente

| Síntoma | Causa probable | Solución |
|---|---|---|
| App devuelve 503 | Contenedor no arrancó | Ver logs con `az webapp log tail` |
| Error de conexión a DB | `DATABASE_URL` mal formado o sin `?sslmode=require` | Verificar variable en App Settings |
| Prisma error "missing engine" | No se usó `--no-engine` en el generate | Rebuild imagen |
| WhatsApp bot no conecta | Puppeteer/Chromium no instalado en imagen | Verificar Dockerfile tiene deps de sistema |
| Variables de entorno no cargaron | Se guardaron en slot de staging en vez de production | Verificar en Portal: App Service → Configuration |
| `next start` falla | No se configuró `output: 'standalone'` en next.config.ts | Agregar la config y rebuild |

---

## Apéndice — Modelo comercial y Stripe

### A.1 Cómo queda el modelo en producción

- `DoctorSubscription.features` es la fuente de verdad
- `basePlan` y `addOns` son el empaquetado comercial
- `planName` queda como etiqueta legada o descriptiva

### A.2 Qué debes cargar en Stripe

Idealmente:

- un **producto** por bundle base:
  - Plan Agenda
  - Plan Clínico
  - Plan Integral
- un **producto** adicional para el add-on IA
- `price_id` mensual por cada uno

### A.3 Variables Stripe que el proyecto espera

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID` (compatibilidad legacy)
- **Recomendado actual:** price IDs separados por catálogo modular:
  - `PLAN_AGENDA`
  - `PLAN_CLINICAL`
  - `PLAN_INTEGRAL`
  - `ADDON_AI`

### A.4 Si haces el despliegue por fases

1. Primero publica el plan principal que venderás
2. Después agrega el resto de bundles
3. Luego conecta upgrades / add-ons si hace falta

### A.5 Regla importante

No uses nombres de plan como fuente de permisos.  
El despliegue debe respetar capacidades, no etiquetas comerciales.
