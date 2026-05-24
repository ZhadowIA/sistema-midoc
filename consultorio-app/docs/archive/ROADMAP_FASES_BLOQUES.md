# MiDoc - Roadmap de fases y bloques

Estado: Vigente (resumen ejecutivo)  
Última actualización: 2026-04-20  
Referencia canónica: `docs/roadmap_fases_midoc.md`

## Objetivo
Dar una vista ejecutiva de alto nivel de lo ya completado y de los próximos bloques recomendados.

## Estado global actual

- El roadmap operativo por fases (`roadmap_fases_midoc.md`) está cerrado en su alcance actual (fases 0–4 en ✅).
- Ya se completó la capa multi-doctor base de clínica:
  - agenda compartida con permisos,
  - suscripción por clínica + seats,
  - reportes agregados por clínica.
- La expansión siguiente pasa de “fase funcional base” a “escala y comercialización”.

## Capacidades consolidadas (resumen)

### Operación clínica base
- Agenda pública y agenda médica día/semana.
- Reserva pública y creación manual con validación de solapes/bloqueos.
- Estados de cita, reagenda y auditoría de cambios.

### Expediente y continuidad de atención
- Historia clínica ampliada y versionada.
- Workspace clínico unificado (`consulta` canónica).
- Portal paciente con historial y descargas.

### Automatización y mensajería
- Recordatorios WhatsApp y flujo bidireccional (confirmar/reagendar).
- Trazabilidad de mensajes entrantes/salientes.

### IA clínica asistida
- Narración/transcripción con generación SOAP.
- Insights accionables y farmacovigilancia determinística.

### Multi-doctor / clínica
- Modelo `Clinic` + `CLINIC_ADMIN`.
- Gestión cross-doctor de agenda con auditoría de actor.
- Seats por clínica y reportes agregados por doctor.

## Backlog recomendado (siguiente ciclo)

### Bloque A - Producción comercial (P0)
- Endurecimiento final de seguridad y cumplimiento pre go-live.
- Cierre operativo de despliegue y observabilidad de producción.
- Definir playbook de soporte y manejo de incidentes.

### Bloque B - Escala operativa (P1)
- KPIs operativos por clínica y alertas de degradación.
- Mejoras de onboarding y activación de equipos clínicos (adopción).
- Herramientas de administración de clínica (permisos/seats avanzados).

### Bloque C - IA y eficiencia clínica (P2)
- Gobernanza de costos IA por clínica y por flujo.
- Versionado de prompts con trazabilidad clínica/auditoría.
- Flujos de seguimiento inteligente post-consulta.
