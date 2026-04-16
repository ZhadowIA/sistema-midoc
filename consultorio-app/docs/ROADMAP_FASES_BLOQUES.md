# MiDoc - Roadmap de fases y bloques

Estado: Vigente  
Ultima actualizacion: 2026-04-15  
Referencia principal: `docs/SISTEMA_ACTUAL.md`

## Objetivo
Dar una vista ejecutiva de lo ya implementado y del backlog recomendado para las siguientes iteraciones.

## Fases implementadas (historico consolidado)

### Fase 1 - Base operativa
- Agenda publica funcional (dia/mes).
- Reserva de cita publica con validaciones de slot.
- Base de auth medico y panel admin.

### Fase 2 - Operacion clinica diaria
- Agenda medico dia/semana.
- Creacion manual de citas y bloqueos.
- Acciones rapidas de cita (reagendar/cancelar/cambiar estado).

### Fase 3 - Cuenta de paciente opcional
- Registro/login paciente.
- Flujo dual para agendar (cuenta o invitado).
- Historial para paciente autenticado.

### Fase 4 - Calendario publico avanzado
- Calendario mensual de 7 dias.
- Dias no agendables deshabilitados.
- Navegacion mensual extendida.

### Fase 5 - Directorio y expediente por medico
- Directorio de pacientes por medico.
- Vinculacion de cita a paciente existente.
- Creacion de expediente desde cita y vinculacion con cuenta paciente.
- Fusion legacy disponible para depuracion historica.

### Fase 6 - Notificaciones y WhatsApp
- Confirmacion de cita + invitacion a cuestionario.
- Recordatorios configurables por medico (horas y templates).
- Bot entrante para confirmar/cancelar por mensaje.
- Historial y trazabilidad de mensajes.

### Fase 7 - Calidad, seguridad y trazabilidad
- Validaciones y rate limiting en rutas criticas.
- Auditoria de cambios de cita (`AppointmentAuditLog`).
- Robustez de colas y reintentos de notificaciones.

### Fase 8 - Suscripcion y operacion SaaS
- Registro medico orientado a suscripcion.
- Setup por etapas: suscripcion -> onboarding -> dashboard.
- Webhook de pagos con idempotencia y estructura productiva.

### Fase 9 - IA clinica asistida
- Generacion de SOAP desde audio.
- Insights clinicos (diagnosticos/tratamientos/plan alimenticio).
- Validacion automatica de receta con reglas deterministicas.

## Backlog recomendado (siguiente ciclo)

### Bloque A - Produccion comercial (P0)
- Activar pasarela real de cobro mensual.
- Cerrar P0 de seguridad, migraciones y QA de go-live.
- Formalizar cumplimiento legal final.

### Bloque B - Escala operativa (P1)
- Alertas operativas y metricas de negocio por medico.
- Dashboard de citas vencidas pendiente de cierre automatico.
- Mejoras de onboarding guiado para medico.

### Bloque C - IA y eficiencia clinica (P2)
- Control de costos por uso de IA.
- Versionado de prompts y auditoria de recomendaciones.
- Copiloto de seguimiento para citas de control.
