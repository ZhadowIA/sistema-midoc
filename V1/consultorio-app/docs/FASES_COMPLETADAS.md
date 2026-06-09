# MiDoc - Fases completadas

Última actualización: 2026-05-19

## Criterio
Aquí vive el HISTORIAL de fases cerradas. El roadmap futuro ya no debe mezclar backlog con entregas históricas.

---

## Fase 0 — Fundaciones
- **Estado final:** Completada
- **Cierre documental:** 2026-05-19
- **Evidencia en código:**
  - `consultorio-app/prisma/schema.prisma` incluye `clinicId`, contactos estructurados y features por suscripción.
  - `consultorio-app/src/lib/featureFlags.ts`
  - `consultorio-app/src/lib/subscriptionFeatures.ts`
- **Documentos absorbidos:**
  - `docs/archive/roadmap_fases_midoc.md`
- **Observaciones:** la fundación multi-tenant soft ya existe; la deuda pendiente es de explotación comercial, no de schema base.

## Fase 1 — Reserva pública estructurada
- **Estado final:** Completada
- **Cierre documental:** 2026-05-19
- **Evidencia en código:**
  - contratos públicos estructurados y booking en `consultorio-app/src/app/api/public/*`
  - recaptcha y normalización de nombres en librerías de booking
- **Documentos absorbidos:**
  - `docs/archive/roadmap_fases_midoc.md`
- **Observaciones:** el sistema ya opera con captura estructurada y ripple funcional al resto del flujo.

## Fase 2 — Diferencial IA base
- **Estado final:** Completada
- **Cierre documental:** 2026-05-19
- **Evidencia en código:**
  - trazabilidad y jobs IA reflejados en `consultorio-app/prisma/schema.prisma`
  - paneles y rutas IA clínicas activos en `consultorio-app/src/app/api/admin/ai/*` y `consultorio-app/src/app/medico/ia-gobernanza/page.tsx`
- **Documentos absorbidos:**
  - `docs/archive/roadmap_fases_midoc.md`
  - `docs/archive/roadmap_priorizado_midoc.md`
- **Observaciones:** la base IA ya existe; lo pendiente es endurecimiento comercial/regulatorio y gating total.

## Fase 3 — Workspace clínico y continuidad de atención
- **Estado final:** Completada
- **Cierre documental:** 2026-05-19
- **Evidencia en código:**
  - `consultorio-app/src/app/medico/citas/[id]/consulta/page.tsx`
  - `consultorio-app/prisma/schema.prisma` con `ClinicalEncounter`, `ClinicalNote`, versionado e historial clínico
  - descarga y continuidad de paciente implementadas en rutas/pantallas clínicas
- **Documentos absorbidos:**
  - `docs/archive/roadmap_fases_midoc.md`
  - `plan_implementacion_historia_clinica_midoc.md` como anexo de alcance
- **Observaciones:** la historia clínica completa ya NO debe seguir tratándose como idea futura genérica.

## Fase 4 — Multi-doctor / clínica
- **Estado final:** Completada
- **Cierre documental:** 2026-05-19
- **Evidencia en código:**
  - `consultorio-app/prisma/schema.prisma` con `Clinic` y roles ampliados
  - agenda, dashboard y control de suscripción con alcance de clínica
- **Documentos absorbidos:**
  - `docs/archive/roadmap_fases_midoc.md`
  - `docs/archive/ROADMAP_FASES_BLOQUES.md`
- **Observaciones:** la capa base multi-doctor ya está hecha; lo pendiente es madurez operativa y permisos más finos en algunos frentes.

## Fase 5 — Monetización base y no-show
- **Estado final:** Parcial avanzada
- **Cierre documental:** 2026-05-19
- **Evidencia en código:**
  - `consultorio-app/src/app/api/payments/webhook/route.ts`
  - `consultorio-app/src/app/medico/suscripcion/page.tsx`
  - `consultorio-app/src/app/medico/configuracion/page.tsx`
- **Documentos absorbidos:**
  - `docs/archive/roadmap_priorizado_midoc.md`
  - `docs/archive/ops/go-live-roadmap-4-6-semanas.md`
- **Observaciones:** Stripe, política de anticipo y autoservicio existen; queda pendiente evidencia productiva live y cierre de gaps operativos.

## Fase 6 — Waitlist y recuperación de huecos
- **Estado final:** Completada
- **Cierre documental:** 2026-05-19
- **Evidencia en código:**
  - `consultorio-app/prisma/schema.prisma` con `WaitlistEntry` y `WaitlistOffer`
  - `consultorio-app/src/app/api/admin/waitlist/route.ts`
- **Documentos absorbidos:**
  - `docs/archive/roadmap_fases_midoc.md`
- **Observaciones:** la infraestructura existe y ya forma parte del producto real.

## Fase 10 — Seguridad, cumplimiento y evidencia operativa base
- **Estado final:** Parcial avanzada
- **Cierre documental:** 2026-05-19
- **Evidencia en código/documentación:**
  - `consultorio-app/prisma/schema.prisma` con `TwoFactorCredential`, `SecurityIncident`, `PatientDocument`
  - `consultorio-app/src/app/api/admin/security/incidents/route.ts`
  - `consultorio-app/docs/security/incident-response.md`
  - `consultorio-app/docs/compliance/nom-matrix.md`
- **Documentos absorbidos:**
  - `docs/archive/compliance-roadmap.md`
  - `docs/archive/ops/go-live-roadmap-4-6-semanas.md`
- **Observaciones:** ya hay bastante base implementada; NO es correcto tratar seguridad/compliance como “no iniciado”. Lo pendiente es evidencia live, no ausencia de trabajo.

## Fase 11 — IA gobernada y especialidad-first
- **Estado final:** Completada en base funcional
- **Cierre documental:** 2026-05-19
- **Evidencia en código:**
  - `consultorio-app/prisma/schema.prisma` con `AIUsageEvent`
  - `consultorio-app/src/app/medico/ia-gobernanza/page.tsx`
  - playbooks clínicos y cuestionario IA presentes en módulos clínicos
- **Documentos absorbidos:**
  - `docs/archive/roadmap_fases_midoc.md`
  - `docs/archive/roadmap_priorizado_midoc.md`
- **Observaciones:** la gobernanza y el enfoque por especialidad ya tienen materialización real; el siguiente problema es comercializar y controlar capacidades, no inventar la fase.

## Fase 12 — Operación clínica avanzada
- **Estado final:** Parcial avanzada
- **Cierre documental:** 2026-05-19
- **Evidencia en código:**
  - `consultorio-app/src/app/medico/recepcion/page.tsx`
  - `consultorio-app/src/app/medico/recursos/page.tsx`
  - `consultorio-app/src/app/medico/caja/page.tsx`
  - `consultorio-app/src/app/api/admin/resources/occupancy/route.ts`
- **Documentos absorbidos:**
  - `docs/archive/roadmap_fases_midoc.md`
- **Observaciones:** recepción, caja y recursos están implementados; lo pendiente es profundizar permisos y reporting operativo.
