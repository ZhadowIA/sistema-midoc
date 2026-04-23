# Runbook — Backup y restore de base de datos

Aplica a la base PostgreSQL detrás de `DATABASE_URL`. En producción MiDoc usa Prisma Accelerate (`prisma://...`), pero el origen es Postgres — los comandos siguientes asumen acceso directo a la instancia origen.

## Política de respaldo

| Tipo | Frecuencia | Retención | Ubicación |
|---|---|---|---|
| Snapshot gestionado por el proveedor | Diario | 30 días | Proveedor de DB |
| Dump lógico `pg_dump` | Diario | 90 días | Almacenamiento cifrado fuera del proveedor |
| Dump previo a migración mayor | Ad-hoc antes de `db:migrate:deploy` | 30 días | Igual que diario |

Cifrado en reposo obligatorio para los dumps off-site.

## Backup — `pg_dump`

```bash
# Dump completo en formato custom (comprimido y restaurable selectivamente)
pg_dump \
  --format=custom \
  --no-owner --no-privileges \
  --file="midoc-$(date +%Y%m%d-%H%M%S).dump" \
  "$DATABASE_URL_DIRECT"
```

Notas:
- `DATABASE_URL_DIRECT` debe ser la URL **directa a Postgres**, NO la URL `prisma://` de Accelerate.
- Verificar integridad listando el archivo: `pg_restore --list archivo.dump | head`.

## Restore — `pg_restore`

```bash
# Restore en base vacía. Nunca sobre la base productiva.
createdb midoc_restore_test
pg_restore \
  --dbname=midoc_restore_test \
  --no-owner --no-privileges \
  --jobs=4 \
  midoc-YYYYMMDD-HHMMSS.dump
```

## Simulacro mensual (obligatorio)

1. Tomar el último dump productivo.
2. Restaurar en una DB sandbox con el procedimiento de arriba.
3. Validar:
   - Conteo de registros clave: `User`, `Patient`, `Appointment`, `ClinicalNote`, `BillingReceipt`.
   - Login con credenciales conocidas (ejecutar `consultorio-app` apuntando a la sandbox).
   - Abrir una cita con historia clínica y verificar que se renderiza.
4. Anotar en el registro de simulacros:
   - Fecha, duración del restore (RTO medido), tamaño del dump, responsable.
5. Destruir la sandbox al terminar.

RTO objetivo: **< 60 min** para restore + smoke tests.
RPO objetivo: **< 24 h** (frecuencia mínima del dump lógico diario).

## Incidente de pérdida de datos

1. Detener escrituras (modo mantenimiento o bajar la app).
2. Tomar dump forense del estado actual antes de tocar nada.
3. Restaurar en instancia nueva (no pisar la original).
4. Validar integridad con los conteos clave.
5. Redirigir `DATABASE_URL` de la app a la instancia restaurada.
6. Documentar ventana de datos perdidos y notificar según Fase 10.7 (registro de incidentes).
