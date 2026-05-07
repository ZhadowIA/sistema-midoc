# Evidencia — Simulacro de continuidad (backup/restore)

Fecha: 2026-04-30  
Entorno: STAGING  
Responsable: _pendiente_

## 1) Migraciones en staging

Comandos a ejecutar:

```bash
npm run db:migrate:status
npm run db:migrate:deploy
npm run db:migrate:status
```

Evidencia (pegar salida):

- `db:migrate:status` antes:
- `db:migrate:deploy`:
- `db:migrate:status` después:

Resultado: `PENDIENTE`

## 2) Simulacro backup

Comando:

```bash
pg_dump --format=custom --no-owner --no-privileges --file=midoc-YYYYMMDD-HHMMSS.dump "$DATABASE_URL_DIRECT"
```

Evidencia:

- nombre del dump:
- tamaño:
- `pg_restore --list` exitoso: `SI/NO`

Resultado: `PENDIENTE`

## 3) Simulacro restore en sandbox

Comandos:

```bash
createdb midoc_restore_test
pg_restore --dbname=midoc_restore_test --no-owner --no-privileges --jobs=4 midoc-YYYYMMDD-HHMMSS.dump
```

Evidencia:

- duración restore (RTO):
- errores:

Resultado: `PENDIENTE`

## 4) Smoke post-restore

Comando:

```bash
SMOKE_BASE_URL=https://staging.midoc.example.com \
SMOKE_EMAIL=smoke@midoc.example.com \
SMOKE_PASSWORD=*** \
npm run smoke
```

Evidencia:

- salida smoke:
- checks fallidos:

Resultado: `PENDIENTE`

## 5) Conclusión go/no-go de continuidad

- RTO objetivo (< 60 min): `PENDIENTE`
- RPO objetivo (< 24 h): `PENDIENTE`
- Continuidad aprobada: `PENDIENTE`
