# Playbook — Migraciones versionadas staging / producción

Todas las migraciones viven en `prisma/migrations/` y se aplican con Prisma Migrate. No se permite `prisma db push` contra staging ni producción.

## Reglas generales

1. Una migración por cambio lógico. Nombre con prefijo timestamp y contexto: `YYYYMMDDHHMMSS_fase<id>_<descripcion>`.
2. El flujo de adopción es **dev → staging → producción**. Nunca saltar staging.
3. `prisma migrate deploy` es el ÚNICO comando válido en staging y prod. `migrate dev` solo en local.
4. Migraciones destructivas (drop column, drop table, rename) requieren:
   - Dump previo (ver `backup-restore.md`).
   - Ventana de mantenimiento anunciada.
   - Plan de rollback escrito ANTES de ejecutar.

## Flujo estándar

### Local (dev)
```bash
npm run db:migrate:dev      # crea la migración y la aplica localmente
npm run db:generate:no-engine
npm run test
```

Revisar el SQL generado. Si es destructivo o no evidente, pedir review antes de commit.

### Staging
```bash
npm run db:migrate:status   # confirma que staging está al día salvo por la nueva
npm run db:migrate:deploy   # aplica la migración pendiente
npm run db:migrate:status   # verifica que quedó "No pending migrations"
```

Ejecutar smoke tests contra staging. Si algo falla, NO promover a prod.

### Producción
Idéntico a staging pero con ventana anunciada si la migración es bloqueante.

```bash
# 1. Snapshot previo
pg_dump --format=custom --file=pre-migracion-$(date +%Y%m%d-%H%M%S).dump "$DATABASE_URL_DIRECT"

# 2. Aplicar
npm run db:migrate:deploy

# 3. Validar
npm run db:migrate:status
```

## Rollback

Prisma Migrate **no hace rollback automático**. Estrategias:

| Tipo de cambio | Estrategia de rollback |
|---|---|
| Aditivo (nueva tabla/columna/índice) | Escribir migración inversa (DROP) y aplicar como nueva migración. No revertir la original. |
| Destructivo (DROP column/table) | Solo recuperable vía restore del dump previo. Por eso es obligatorio dump antes. |
| Rename | Migración compensatoria que renombra de vuelta + redeploy de app coherente. |

Nunca borrar archivos de `prisma/migrations/` ya aplicados en prod — eso rompe el historial y causa `drift` la próxima vez.

## Expansión + contracción para cambios riesgosos

Para renombrar, eliminar o cambiar tipo de columna en tablas grandes:

1. **Expand**: migración que agrega la nueva estructura manteniendo la vieja.
2. **Dual-write** en el código: escribir en ambas, leer de la vieja.
3. **Backfill** con script idempotente (ver patrón `prisma/backfill-patient-names.ts`).
4. **Switch reads** a la nueva estructura.
5. **Contract**: migración destructiva que elimina la vieja, después de al menos un deploy estable.

## Checklist pre-deploy de migración

- [ ] `migrate:status` en staging limpio antes de promover
- [ ] Dump previo guardado con timestamp y ubicación conocida
- [ ] SQL revisado manualmente si el cambio es destructivo
- [ ] Ventana anunciada si la migración bloquea (locks largos, reescritura de tabla)
- [ ] Smoke tests post-deploy ejecutados: login, agenda del día, crear cita, ver historia clínica
