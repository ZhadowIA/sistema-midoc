# MiDoc - Roadmap maestro

Última actualización: 2026-05-19

## Propósito
Este es el ÚNICO roadmap canónico del proyecto. Consolida los roadmaps históricos, los contrasta contra el código real y separa lo ya hecho de lo que todavía falta.

## Fuentes consolidadas
- `docs/archive/roadmap_fases_midoc.md`
- `docs/archive/ROADMAP_FASES_BLOQUES.md`
- `docs/archive/roadmap_priorizado_midoc.md`
- `docs/archive/compliance-roadmap.md`
- `docs/archive/ops/go-live-roadmap-4-6-semanas.md`
- `plan_implementacion_historia_clinica_midoc.md`

## Resumen ejecutivo real
- MiDoc YA tiene base clínica, multi-doctor, IA asistida, pagos, waitlist, caja, recepción, seguridad inicial y gobierno documental/compliance parcial.
- El problema principal ya NO es “construir el MVP”.
- El backlog real se concentra en **go-live productivo**, **evidencia operativa**, **gating uniforme por capacidades** y **madurez comercial/regulatoria**.

## Clasificación de fases
- **Completada:** implementada y evidenciable en código.
- **Parcial:** existe base funcional real, pero faltan cierres productivos, validación live o endurecimiento.
- **Pendiente:** no hay cierre suficiente para llamarla capacidad real.
- **Absorbida:** el frente ya no debe vivir como roadmap separado.

---

## Fases ya completadas o absorbidas

### F0–F4 — Fundaciones, booking estructurado, IA base, workspace clínico y clínica multi-doctor
- **Estado:** Completadas
- **Evidencia base:** schema Prisma, rutas clínicas/públicas, `consulta` canónica, `Clinic`, suscripción y agenda compartida.
- **Historial:** ver `docs/FASES_COMPLETADAS.md`.

### F6 — Waitlist
- **Estado:** Completada
- **Evidencia base:** modelos `WaitlistEntry` / `WaitlistOffer` y endpoints admin.

### F11 — IA gobernada y playbooks por especialidad (base funcional)
- **Estado:** Completada en base funcional
- **Evidencia base:** `AIUsageEvent`, dashboard de gobernanza, cuestionario IA, módulos por especialidad.

### F12 — Operación clínica avanzada (base)
- **Estado:** Parcial avanzada
- **Evidencia base:** recepción, caja y recursos ya existen.
- **Gap restante:** permisos finos y reporting operativo más profundo.

---

## Backlog canónico vigente

### Fase A — Go-live comercial productivo
**Estado:** Parcial
**Prioridad:** P0

#### Objetivo
Cerrar lo que falta para operar en producción comercial con evidencia y control, no solo en local.

#### Alcance pendiente
- Validación E2E con cuenta Stripe live de:
  - alta
  - renovación
  - fallo de cobro
  - cancelación
  - reactivación
- Resolver gaps de flujo financiero productivo:
  - persistencia del identificador necesario para reembolsos reales
  - separación clara de credenciales por ambiente
- Cerrar evidencia de staging/prod para:
  - backups + restore
  - smoke tests post-deploy
  - webhooks repetidos / idempotencia

#### Evidencia actual
- `consultorio-app/src/app/api/payments/webhook/route.ts`
- `consultorio-app/src/app/medico/suscripcion/page.tsx`
- `consultorio-app/src/app/medico/configuracion/page.tsx`
- `docs/ops/commercial-state-policy.md`
- `docs/ops/go-live-p0-evidence-checklist.md`

#### Dependencias
- Política de estado comercial canónica
- Secretos por ambiente
- Entorno staging utilizable

---

### Fase B — Seguridad operativa y cumplimiento verificable
**Estado:** Parcial
**Prioridad:** P0

#### Objetivo
Pasar de “tenemos piezas de seguridad/compliance” a “tenemos evidencia verificable de operación segura”.

#### Alcance pendiente
- Completar separación real de secretos y rotación por ambiente.
- Confirmar 2FA operativo en el flujo objetivo de producción.
- Verificar backend compartido para rate limit/lockout si aún hay partes con base transitoria.
- Cerrar evidencia operativa de:
  - incident response
  - retención/purga
  - ARCO
  - claims de IA alineados con postura comercial
- Mantener `nom-matrix` como matriz viva de brechas con responsable humano explícito.

#### Evidencia actual
- `consultorio-app/prisma/schema.prisma` contiene `TwoFactorCredential`, `SecurityIncident`, `PatientDocument`.
- `consultorio-app/src/app/api/admin/security/incidents/route.ts`
- `docs/security/incident-response.md`
- `docs/compliance/ai-claims-policy.md`
- `docs/compliance/nom-matrix.md`

#### Dependencias
- Ambiente real/staging con secretos rotados
- Validación legal/operativa humana

---

### Fase C — Gating canónico por capacidades y cierre de transición comercial
**Estado:** Parcial
**Prioridad:** P0

#### Objetivo
Hacer que `DoctorSubscription.features` sea la fuente de verdad completa en UI, sesión, proxy y API. Sin esto, el producto modular queda frágil.

#### Alcance pendiente
- Migrar completamente login/session/layout/proxy a `features` como fuente primaria.
- Dejar `productPlan` y `enabledModules` solo como compatibilidad temporal o retirarlos.
- Revisar endpoints restantes para garantizar enforcement uniforme por módulo y feature.
- Consolidar contratos de error y bloqueo por capacidad.

#### Evidencia actual
- `consultorio-app/src/lib/subscriptionFeatures.ts`
- `consultorio-app/src/lib/featureFlags.ts`
- `consultorio-app/src/lib/permissions.ts`
- rutas ya protegidas en agenda/clinical/AI y features puntuales

#### Dependencias
- Catálogo comercial estable
- Revisión de transición sin romper compatibilidad de sesión

---

### Fase D — Observabilidad y operación controlable
**Estado:** Parcial
**Prioridad:** P1

#### Objetivo
Evitar operación tribal: incidentes, degradación y fallas deben detectarse con evidencia antes de que lo haga el cliente.

#### Alcance pendiente
- Confirmar alertas mínimas activas en entorno operativo:
  - 5xx
  - pagos/webhooks
  - notificaciones
  - latencia crítica
  - jobs IA
  - crecimiento de costo IA
- Asegurar staging utilizable con cookies, HTTPS, orígenes, cron y webhooks.
- Mantener runbooks conectados a señales operativas reales.

#### Evidencia actual
- `docs/ops/minimum-alerts-matrix.md`
- `docs/ops/observability.md`
- `docs/ops/runbook-*.md`
- instrumentación documental y funcional ya existente en varios endpoints

#### Dependencias
- Alerting real del entorno
- Eventos estructurados consistentes

---

### Fase E — Operación de clínica avanzada
**Estado:** Parcial
**Prioridad:** P1/P2

#### Objetivo
Profundizar operación multi-actor para clínicas más exigentes.

#### Alcance pendiente
- Permisos finos por rol y contexto en más superficies operativas.
- Productividad por médico/secretaria.
- Tablero operativo más fuerte para recepción/caja/recursos.
- Enterprise-light readiness documental/comercial.

#### Evidencia actual
- `consultorio-app/src/app/medico/recepcion/page.tsx`
- `consultorio-app/src/app/medico/caja/page.tsx`
- `consultorio-app/src/app/medico/recursos/page.tsx`
- `consultorio-app/src/lib/permissions.ts`

---

### Fase F — Crecimiento, funnel y atribución comercial
**Estado:** Pendiente
**Prioridad:** P2

#### Objetivo
Medir y optimizar captación, conversión y recuperación de reservas.

#### Alcance
- tracking de funnel de booking
- atribución por canal/campaña
- recuperación de agendado abandonado con base válida

#### Nota
Este frente NO debe adelantarse a go-live seguro, gating canónico y control operativo.

---

### Fase G — Teleconsulta y seguimiento
**Estado:** Pendiente
**Prioridad:** P3

#### Objetivo
Abrir modalidad virtual solo después de cerrar cobro, consentimiento y trazabilidad con suficiente madurez.

#### Alcance
- cita virtual
- consentimiento específico
- seguimiento postconsulta
- red flags y escalamiento

#### Nota
Construir esto antes de cerrar monetización y cumplimiento sería arquitectura impulsiva.

---

## Decisiones de consolidación
1. El roadmap por fases histórico queda archivado; ya no es fuente de verdad.
2. El resumen ejecutivo de bloques queda absorbido por este documento.
3. El roadmap priorizado comercial queda absorbido por este documento.
4. El roadmap de compliance y el roadmap de go-live quedan absorbidos como frentes transversales de las fases A y B.
5. El plan de historia clínica queda como anexo de alcance, no como roadmap competidor.

## Regla de mantenimiento
Actualizar este documento cuando ocurra una de estas condiciones:
- cierre real de una fase parcial,
- cambio de proveedor crítico,
- cambio de modelo comercial,
- nueva capacidad transversal que altere prioridades,
- evidencia operativa que reclasifique una fase.
