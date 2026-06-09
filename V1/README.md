# V1 — Sistema anterior (congelado)

Este directorio contiene el codigo fuente completo de MiDoc V1, movido aqui el 2026-06-09 al iniciar el desarrollo local-first de V2.

**Estado: congelado.** V1 no se mantiene, no se modifica y no se despliega. Se conserva unicamente como referencia de reglas de negocio (servicios de dominio, esquema Prisma, validaciones) para la reimplementacion en `../V2/`.

## Contenido

- `consultorio-app/` — App SaaS Next.js 16 (frontend + API + Prisma/PostgreSQL).
- `whatsapp-bot/` — Servicio Express con whatsapp-web.js (V2 lo sustituye por SMS/correo).
- `frontend/` — Referencia visual/UI desacoplada.
- `openspec/` — Propuesta de despliegue Azure (historica).
- `docker-compose.yml`, `setup.ps1`, `deepgram-healthcheck.ps1` — Operacion local de V1; las rutas que referencian la raiz del repo pueden estar rotas tras el movimiento.

## Documentacion

Indice maestro: `consultorio-app/docs/INDICE_DOCUMENTACION.md`. Spec canonica: `consultorio-app/docs/SISTEMA_ACTUAL.md` (nota: desactualizada respecto al codigo final; el inventario real esta en `../V2/12_inventario_funcional_v1.md`).
