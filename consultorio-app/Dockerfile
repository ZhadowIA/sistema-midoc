# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ---- Stage 2: Builder ----
FROM node:20-alpine AS builder
WORKDIR /app

ARG DATABASE_URL
ARG NEXTAUTH_SECRET
ARG APP_BASE_URL
ARG QUESTIONNAIRE_TOKEN_SECRET

ENV DATABASE_URL=${DATABASE_URL}
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ENV APP_BASE_URL=${APP_BASE_URL}
ENV QUESTIONNAIRE_TOKEN_SECRET=${QUESTIONNAIRE_TOKEN_SECRET}

COPY package*.json ./
RUN npm ci --include=dev

COPY . .

RUN npx prisma generate
RUN npm run build

# ---- Stage 3: Runner ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=America/Chihuahua

RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

COPY scripts/start.sh ./start.sh
RUN chmod +x start.sh
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["./start.sh"]
