# MiDoc - Cambios requeridos antes de produccion

Estado: Vigente  
Ultima actualizacion: 2026-04-15  
Referencia principal: `docs/SISTEMA_ACTUAL.md`

## Objetivo
Tener una lista unica y priorizada de cambios obligatorios para pasar de modo pruebas a produccion comercial.

## Estado base actual (modo pruebas)
- Registro medico + suscripcion + onboarding ya estan operativos.
- Existen modelos y endpoints de suscripcion, pagos, legal y setup.
- Hay webhook de pagos con validacion de firma e idempotencia.
- El sistema ya tiene trazabilidad de citas y mensajeria (audit logs / whatsapp logs).

## P0 - Bloqueadores de salida a produccion

### 1) Cobro real mensual
- [ ] Activar pasarela real (`STRIPE`, `CONEKTA` u `OPENPAY`) y credenciales productivas.
- [ ] Cambiar checkout simulado por checkout real.
- [ ] Confirmar ciclo completo: alta de suscripcion, renovacion, fallo de cobro, cancelacion.
- [ ] Definir politica de gracia por impago (dias y reglas de bloqueo).

### 2) Seguridad de plataforma
- [ ] Rotar todos los secretos de pruebas (`NEXTAUTH_SECRET`, webhooks, API keys).
- [ ] Forzar HTTPS y cookies seguras en produccion.
- [ ] Endurecer politica de password y recuperacion de cuenta.
- [ ] Revisar mensajes de error para no exponer detalles internos.

### 3) Base de datos y continuidad
- [ ] Ejecutar migraciones versionadas en staging y produccion (`migrate deploy`).
- [ ] Hacer simulacro real de backup/restauracion.
- [ ] Verificar indices para carga real (citas, notificaciones, pacientes, auditoria).

### 4) Cumplimiento legal
- [ ] Validacion legal final de `terminos` y `privacidad`.
- [ ] Definir politica de retencion/eliminacion de datos clinicos.
- [ ] Confirmar cumplimiento regulatorio local para expediente medico digital.

### 5) QA go-live
- [ ] E2E minimo: registro -> suscripcion -> onboarding -> login -> operacion basica.
- [ ] Regresion: agenda, pacientes, cuestionario, nota SOAP, receta, notificaciones.
- [ ] Smoke tests en ambiente productivo post-deploy.

## P1 - Recomendado en primera iteracion post-go-live
- [ ] Alertas operativas (errores 5xx, fallo webhooks, cola de notificaciones).
- [ ] Dashboard de negocio (altas, conversion, renovacion, churn).
- [ ] Gestion de metodo de pago e historial de cobros desde "Mi Suscripcion".
- [ ] Mejoras de onboarding guiado para medico no tecnico.

## P2 - Optimizacion y escala
- [ ] Automatizar canary release/rollback.
- [ ] Definir SLOs de API y monitoreo de latencia por modulo.
- [ ] Reglas de costo y observabilidad para modulos de IA.

## Criterio de salida
Solo liberar a produccion comercial cuando todos los puntos P0 esten cerrados y validados en staging.
