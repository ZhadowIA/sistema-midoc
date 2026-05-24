# Sistema MiDoc Monorepo

Monorepo principal de MiDoc.

## Servicios
- `consultorio-app/`: aplicación principal clínica/comercial en Next.js + Prisma.
- `whatsapp-bot/`: bot de WhatsApp para notificaciones y automatizaciones.
- `frontend/`: referencia visual/UI desacoplada del backend.

## Documentación canónica
- Índice maestro: `consultorio-app/docs/INDICE_DOCUMENTACION.md`
- Estado actual del sistema: `consultorio-app/docs/SISTEMA_ACTUAL.md`
- Roadmap maestro: `consultorio-app/docs/ROADMAP_MAESTRO.md`
- Historial de fases completadas: `consultorio-app/docs/FASES_COMPLETADAS.md`
- Mapa documental: `consultorio-app/docs/MAPA_DOCUMENTAL.md`

## Desarrollo local
### Opción rápida
```powershell
.\setup.ps1
```

### Opción manual
1. Crear `.env` desde los `.env.example` de cada servicio.
2. Instalar dependencias por servicio.
3. Ejecutar los servicios necesarios.

## Regla documental
La puerta de entrada documental del producto es `consultorio-app/docs/INDICE_DOCUMENTACION.md`.
Los documentos legacy o reemplazados viven en `consultorio-app/docs/archive/`.
