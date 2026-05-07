# Estado comercial canónico y política de degradación

Estado: Vigente  
Última actualización: 2026-04-29  
Referencia: `DoctorSubscription.status`, `DoctorSubscription.cancelAtPeriodEnd`

## Objetivo

Definir qué significa operativamente cada estado comercial y cómo debe reaccionar el sistema.

Sin esta política, backend, UI, soporte y operación pueden tomar decisiones distintas para el mismo cliente.

---

## Estados comerciales canónicos

### `PENDING`

**Significado**  
La suscripción fue creada, pero aún no existe confirmación comercial suficiente para tratarla como activa.

**Comportamiento recomendado**
- permitir acceso limitado de setup
- permitir onboarding
- NO asumir acceso pleno a capacidades premium
- mostrar que el alta no está finalizada

### `ACTIVE`

**Significado**  
La suscripción está al corriente o dentro de un estado operativo válido.

**Comportamiento recomendado**
- acceso normal a capacidades contratadas
- renovación automática activa, salvo cancelación programada

### `PAST_DUE`

**Significado**  
El cobro falló o quedó pendiente de regularización.

**Comportamiento recomendado**
- entrar en período de gracia
- mostrar mensaje visible y accionable
- permitir regularizar método de pago

### `CANCELED`

**Significado**  
La suscripción fue cancelada y terminó su vigencia operativa.

**Comportamiento recomendado**
- retirar acceso a capacidades comerciales
- conservar acceso solo a lo que la política legal/operativa permita
- preparar experiencia de reactivación clara

---

## Cancelación programada

`cancelAtPeriodEnd=true` NO equivale a `CANCELED`.

**Lectura correcta**
- el cliente sigue activo
- no renovará al cierre del período
- la UI debe mostrar fecha de corte y consecuencias

---

## Política recomendada de gracia

### Duración por default

- **0–3 días:** gracia blanda
- **4–7 días:** gracia con degradación
- **8+ días:** suspensión comercial

> Esta es una recomendación operativa inicial. Negocio/legal puede ajustarla, pero NO debe quedar implícita.

---

## Regla recomendada: bloqueo progresivo

### Fase 1 — Gracia blanda

- mantener acceso a módulos activos
- mostrar banners persistentes
- forzar visibilidad del estado comercial

### Fase 2 — Degradación

- bloquear primero capacidades premium:
  - IA clínica
  - add-ons premium
  - automatizaciones no esenciales
- permitir consulta operativa mínima

### Fase 3 — Suspensión comercial

- bloquear creación de nuevas acciones premium o nuevas operaciones comerciales
- conservar acceso mínimo de consulta según criterio legal y soporte

---

## Matriz funcional sugerida

| Estado | Agenda | Expediente | IA | Suscripción | Acción principal |
|---|---|---|---|---|---|
| `PENDING` | Limitada | Limitado según plan | No asumir activo | Visible | Completar alta |
| `ACTIVE` | Sí | Sí | Según add-on/features | Visible | Operación normal |
| `PAST_DUE` (gracia blanda) | Sí | Sí | Sí | Visible | Regularizar pago |
| `PAST_DUE` (degradado) | Sí | Sí | No | Visible | Actualizar pago |
| `CANCELED` | No nuevas acciones premium | Consulta mínima según política | No | Visible | Reactivar |

> La tabla anterior es el default operativo recomendado. Si negocio decide otra política, debe actualizarse aquí y en la UI.

---

## Requisitos de UX

La UI debe comunicar:

- estado actual
- fecha de corte o próxima renovación
- impacto funcional
- acción siguiente recomendada

No basta con badges. Debe existir texto claro y accionable.

---

## Requisitos de backend

- El backend debe ser la fuente final de enforcement.
- La UI solo refleja el estado; no debe ser el control principal.
- Los guards por capacidad deben poder degradar IA y premium antes de apagar todo el producto.

---

## Decisiones pendientes que NO deben quedar implícitas

- acceso de consulta después de cancelación
- tratamiento de clínica vs consultorio individual
- diferencia entre impago técnico temporal y cancelación definitiva
- si onboarding completo exige `ACTIVE` o basta `PENDING`
