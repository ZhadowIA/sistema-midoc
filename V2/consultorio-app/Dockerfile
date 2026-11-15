# syntax=docker/dockerfile:1

# Imagen del portal MiDoc (Next.js 16 standalone + Prisma).
# Contexto de build: V2/consultorio-app. Base Debian slim en todas las etapas
# para que el engine nativo de Prisma (debian-openssl-3.0.x) coincida en build y runtime.

# ---------- deps: instalar dependencias ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# openssl es requerido por el engine de Prisma.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build: generar cliente Prisma y compilar Next ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# `next build` importa src/lib/env.ts, que valida process.env al cargar. Estos
# placeholders son VALIDOS solo para que el build pase; los valores reales se
# inyectan en runtime desde Key Vault / App Settings (el server standalone
# re-lee process.env al arrancar). No son secretos.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public" \
    SESSION_SECRET="build-time-placeholder" \
    APP_BASE_URL="https://example.com" \
    QUESTIONNAIRE_TOKEN_SECRET="build-time-placeholder" \
    TERMS_VERSION="2026-05" \
    PRIVACY_VERSION="2026-05" \
    SMS_PROVIDER="mock" \
    SMS_BASE_URL="https://sms.example.com" \
    SMS_API_KEY="build-time-placeholder" \
    EMAIL_PROVIDER="mock" \
    EMAIL_BASE_URL="https://email.example.com" \
    EMAIL_API_KEY="build-time-placeholder" \
    EMAIL_FROM="no-reply@example.com" \
    NOTIFICATION_CRON_SECRET="build-time-placeholder" \
    PAYMENTS_PROVIDER="MOCK" \
    PAYMENTS_WEBHOOK_SECRET="build-time-placeholder" \
    TWO_FACTOR_ENCRYPTION_KEY="build-time-placeholder-key-0123456789" \
    NEXT_TELEMETRY_DISABLED=1
# Asegura que public/ exista para el COPY del runner aunque el repo no lo tenga.
RUN mkdir -p public && npm run build

# ---------- runner: imagen final mínima ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Usuario no-root.
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs
# Servidor standalone + estáticos.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
# Prisma: schema, engine generado y CLI (para `prisma migrate deploy` desde el job de migraciones).
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
