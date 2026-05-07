# ---- Stage 1: Dependencies (all — dev + prod) ----
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

# ---- Stage 2: Builder ----
FROM node:20-alpine AS builder
WORKDIR /app

# Build-time placeholders only.
# Real secrets/URLs MUST be provided at runtime via App Settings / environment.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    NEXTAUTH_SECRET="build-only-nextauth-secret-1234567890" \
    APP_BASE_URL="http://localhost:3000" \
    QUESTIONNAIRE_TOKEN_SECRET="build-only-questionnaire-secret-1234567890" \
    APP_TIMEZONE="America/Chihuahua" \
    TERMS_VERSION="v1" \
    PRIVACY_VERSION="v1" \
    NODE_ENV="production"

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY . .

RUN npx prisma generate
RUN npm run build

# Strip devDeps in-place so the runner stage only copies prod deps
RUN npm prune --omit=dev

# ---- Stage 3: Runner ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=America/Chihuahua

RUN apk add --no-cache openssl curl

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

COPY scripts/start.sh ./start.sh
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["./start.sh"]
