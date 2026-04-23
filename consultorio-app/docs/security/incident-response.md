# Playbook — Respuesta a incidentes de seguridad y privacidad

Aplica a cualquier incidente que impacte integridad, confidencialidad o disponibilidad del dato clínico, de la plataforma o de los datos del médico/paciente.

## Severidad

| Nivel | Criterio | Tiempo objetivo de contención |
|---|---|---|
| **P0** | Fuga de datos de salud, acceso no autorizado confirmado, caída total o compromiso de credenciales productivas | ≤ 1 h |
| **P1** | Degradación mayor (pagos, agenda crítica), fallo de integración P0 (WhatsApp/DB/Stripe), acceso no autorizado sospechado sin confirmar | ≤ 4 h |
| **P2** | Degradación parcial (IA, reCAPTCHA, reportes), fallo de webhook secundario | ≤ 24 h |
| **P3** | Observaciones, falsos positivos, anomalías por confirmar | ≤ 72 h |

## Categorías (`IncidentCategory`)

- `SECURITY_BREACH` — intrusión confirmada
- `DATA_LEAK` — exposición de datos (interna o externa)
- `UNAUTHORIZED_ACCESS` — acceso sin permiso (intento o consumado)
- `SERVICE_OUTAGE` — caída total o parcial
- `DATA_INTEGRITY` — corrupción, pérdida, inconsistencia
- `VENDOR_INCIDENT` — incidente reportado por subencargado (OpenAI / Deepgram / DB / etc.)
- `OTHER` — cualquier otro

## Estados (`IncidentStatus`)

`OPEN → INVESTIGATING → CONTAINED → RESOLVED → POST_MORTEM → CLOSED`

## Flujo mínimo

1. **Detección**: cualquier señal (alerta de `queue-health`, reporte manual, aviso del proveedor).
2. **Registro**: `POST /api/admin/security/incidents` con severidad, categoría, título, resumen y `detectedAt`. El sistema emite `security.incident.opened` (warn).
3. **Contención**: aplicar runbook relevante (`secret-rotation.md`, `backup-restore.md`, degradación graceful de `continuity-plan.md`). Actualizar a `CONTAINED` con `containedAt`.
4. **Evidencia forense**: ejecutar export de auditoría de la ventana afectada: `GET /api/admin/audit/export?from=...&to=...`. Guardar archivo cifrado fuera de la plataforma y anotar la referencia en `evidenceExportRef`.
5. **Resolución**: `PATCH /api/admin/security/incidents/[id]` con `status=RESOLVED`, `resolvedAt`, `rootCause`, `correctiveActions`.
6. **Notificación** si `notificationRequired=true`: titulares afectados + autoridad cuando aplique. Registrar `notifiedAt`.
7. **Post-mortem** para P0/P1: fijar `status=POST_MORTEM`, documentar lecciones, acciones preventivas y dueño de cada una. Cerrar con `status=CLOSED`.

## Qué capturar siempre

- **Alcance afectado** (`affectedScope` JSON): ids de pacientes, médicos, citas, datos expuestos.
- **Timeline**: `detectedAt` (cuándo se supo), `containedAt` (cuándo se detuvo el sangrado), `resolvedAt` (cuándo quedó cerrado operativamente).
- **Referencia de evidencia**: `evidenceExportRef` apuntando al archivo / ubicación del export forense.
- **Acciones correctivas**: lista concreta con dueño y fecha.

## Criterios de notificación obligatoria

Activar `notificationRequired=true` cuando:
- Se confirma acceso no autorizado a datos personales sensibles (salud).
- Fuga hacia un tercero no autorizado.
- Pérdida de datos sin posibilidad de restauración completa.
- Requerimiento regulatorio aplicable (p.ej. obligación de notificar a titulares según LFPDPPP).

## Métricas sugeridas

- MTTD (mean time to detect)
- MTTC (mean time to contain) por severidad
- Incidentes abiertos por severidad al cierre de mes
- % P0/P1 con post-mortem publicado

## API de soporte

| Endpoint | Método | Propósito |
|---|---|---|
| `/api/admin/security/incidents` | GET | Listar incidentes donde el usuario es reporter o asignado (filtros `status`, `severity`) |
| `/api/admin/security/incidents` | POST | Registrar incidente (emite `security.incident.opened`) |
| `/api/admin/security/incidents/[id]` | GET / PATCH | Detalle y actualización controlada de estado, contención, resolución, evidencia |
| `/api/admin/audit/export` | GET | Export forense de auditoría + consentimientos (ver `docs/privacy/retention-policy.md`) |
