# Roadmap 4–6 semanas para afilar MiDoc antes de producción

Estado: Vigente  
Última actualización: 2026-04-29  
Referencias base: `docs/PRE_PRODUCCION_CAMBIOS_REQUERIDOS.md`, `docs/roadmap_priorizado_midoc.md`, `docs/security-hardening.md`, `docs/DEPLOY_CHECKLIST.md`

## Objetivo

Convertir el backlog disperso de seguridad, pagos, continuidad, observabilidad y UX operativa en una ruta **ejecutable por una sola persona** durante 4–6 semanas.

Este roadmap NO significa “hacer todo”. Significa cerrar primero lo que puede romper:

1. cobro,
2. acceso seguro,
3. continuidad del dato,
4. operación post-deploy.

## Principios

1. **P0 antes que sofisticación**  
   Todo lo que no bloquee producción comercial segura pasa a la siguiente ola.

2. **Una decisión, una fuente de verdad**  
   El estado comercial, las capacidades del plan, la política de gracia y las alertas mínimas deben vivir en documentos canónicos y no en supuestos repartidos.

3. **Control antes que velocidad**  
   No liberar por “ya casi”. Cada ola exige evidencia verificable.

4. **Una sola persona no puede abrir cinco frentes a la vez**  
   La secuencia prioriza dependencias y reduce contexto concurrente.

---

## Ola 1 — Producción segura y cobrable

### Objetivo

Cerrar bloqueadores reales de go-live: pagos, seguridad operativa, continuidad y mínimos de cumplimiento.

### Entregables obligatorios

1. **Proveedor de pagos productivo definido y probado**
   - proveedor real elegido
   - credenciales productivas separadas por ambiente
   - smoke end-to-end:
     - alta
     - renovación
     - fallo de cobro
     - cancelación
     - reactivación
     - webhook repetido / idempotente

2. **Estado comercial canónico**
   - documento de estados y degradación funcional
   - política de gracia y transición por estado
   - criterio explícito de bloqueo progresivo

3. **Seguridad operativa mínima**
   - rate limit y lockout en backend compartido
   - secretos rotados y separados por staging/prod
   - 2FA para `ADMIN` como mínimo

4. **Continuidad**
   - staging validado con migraciones
   - backup + restore ensayado

5. **Cumplimiento mínimo**
   - revisión final de textos legales
   - claims de IA alineados con política interna
   - política operativa de retención validada para go-live

### Criterio de salida de la ola

No se pasa a despliegue comercial hasta que cada entregable tenga evidencia enlazable.

---

## Ola 2 — Operación observable y controlable

### Objetivo

Evitar enterarse de los incidentes por el cliente.

### Entregables obligatorios

1. **Alertas mínimas**
   - 5xx
   - webhook de pagos fallido
   - notificaciones fallidas
   - latencia alta en endpoints críticos
   - fallos de jobs IA
   - crecimiento anómalo de costo IA

2. **Auditoría reforzada**
   - cambios de suscripción
   - cambios de features comerciales
   - cambios sensibles de configuración
   - acciones del panel interno `/admin/clientes`

3. **UX comercial visible**
   - estados `ACTIVE`, `PAST_DUE`, `PENDING`, `CANCELED`
   - período de gracia
   - cancelación programada
   - impacto funcional y siguiente acción visibles

4. **Staging utilizable**
   - cookies
   - HTTPS
   - orígenes
   - webhooks
   - cron
   - smoke tests post-deploy

### Criterio de salida de la ola

La operación puede detectar degradación, aislar causa probable y ejecutar primera respuesta sin inspección improvisada.

---

## Ola 3 — Madurez mínima post-go-live

### Objetivo

Reducir dependencia de memoria tribal después del lanzamiento.

### Entregables recomendados

1. **Onboarding guiado mínimo**
   - checklist de activación
   - primer paciente
   - primera cita
   - primer cobro
   - primera interacción IA

2. **Siguiente iteración del panel interno**
   - paginación/filtros server-side
   - layout interno reutilizable
   - señales más claras de churn/upgrade

3. **Gobierno visible de IA**
   - límites por plan
   - fallback visible
   - lectura más clara de costo/uso

4. **Runbooks operativos**
   - impago
   - rollback
   - caída de proveedor IA
   - fallo de webhook
   - incidente de seguridad

### Criterio de salida de la ola

La operación cotidiana ya no depende de recordar “cómo se resuelve” cada incidente o estado comercial.

---

## Secuencia recomendada por semana

### Semana 1
- definir política comercial de impago y degradación
- cerrar separación de secretos y ambientes
- elegir backend compartido para rate limit/lockout

### Semana 2
- validar pagos productivos y webhook
- formalizar estados comerciales y criterios funcionales

### Semana 3
- migrar rate limit/lockout
- activar 2FA admin
- completar auditoría reforzada

### Semana 4
- staging real
- smoke tests reales
- backup/restore
- alertas mínimas

### Semana 5
- onboarding guiado mínimo
- mejoras de UX comercial

### Semana 6
- runbooks
- endurecimiento final
- evaluación go/no-go

---

## Dependencias críticas

| Tema | Depende de | No avanzar sin esto |
|---|---|---|
| Go-live comercial | pagos productivos | proveedor y webhook probados |
| Política de gracia | estado comercial canónico | transición documentada |
| 2FA admin | secretos/entornos | separación real por ambiente |
| Alertas mínimas | observabilidad base | eventos estructurados útiles |
| Runbooks | política canónica + alertas | rutas de respuesta definidas |

---

## Evidencia mínima esperada

Cada frente debe cerrar con evidencia verificable:

- documento actualizado
- comando o smoke ejecutado
- endpoint validado
- captura de alerta o simulación
- checklist firmada o marcada con fecha

Si una tarea no tiene evidencia, NO está cerrada.
