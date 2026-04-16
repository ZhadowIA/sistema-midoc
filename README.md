# Sistema MiDoc Monorepo

Este repositorio contiene los dos servicios del sistema:

- `consultorio-app/`: aplicacion principal (Next.js + Prisma).
- `whatsapp-bot/`: bot de WhatsApp para mensajes y automatizaciones.

## Requisitos
- Node.js 22+
- npm 10+

## Estructura
```text
Sistema MiDoc/
├─ consultorio-app/
└─ whatsapp-bot/
```

## Desarrollo local
1. Configurar variables:
- `consultorio-app/.env` (a partir de `consultorio-app/.env.example`)
- `whatsapp-bot/.env` (a partir de `whatsapp-bot/.env.example`)

2. Instalar dependencias por servicio:
```bash
cd consultorio-app && npm install
cd ../whatsapp-bot && npm install
```

3. Ejecutar servicios:
```bash
cd consultorio-app && npm run dev
cd ../whatsapp-bot && npm run dev
```

## Documentacion
- Fuente de verdad: `consultorio-app/docs/SISTEMA_ACTUAL.md`
- Indice de documentacion: `consultorio-app/docs/INDICE_DOCUMENTACION.md`
