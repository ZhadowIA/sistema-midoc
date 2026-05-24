# Sistema MiDoc (Next.js + Prisma)

Sistema web para operación clínica y comercial de consultorios: agenda pública, panel médico, expediente clínico, IA clínica asistida, pagos, recepción y gobierno operativo.

## Documentación canónica
- Índice maestro: `docs/INDICE_DOCUMENTACION.md`
- Estado actual del sistema: `docs/SISTEMA_ACTUAL.md`
- Roadmap maestro: `docs/ROADMAP_MAESTRO.md`
- Historial de fases completadas: `docs/FASES_COMPLETADAS.md`
- Mapa documental: `docs/MAPA_DOCUMENTAL.md`
- Archivo histórico: `docs/archive/`

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
1. Crear variables desde `.env.example`.
2. Instalar dependencias con `npm install`.
3. Inicializar base con Prisma.
4. Ejecutar `npm run dev`.

## Scripts útiles
- `npm run dev`
- `npm run lint`
- `npm run test`
- `npm run test:unit`
- `npm run test:integration`

## Nota
La documentación legacy ya no es fuente de verdad. Si necesitas contexto histórico, revísalo en `docs/archive/`.
