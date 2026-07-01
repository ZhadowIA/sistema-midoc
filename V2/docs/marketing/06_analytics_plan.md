# 06 - Plan de analítica y medición

**Skill utilizada:** `analytics`

## Objetivo

Medir decisiones reales de marketing y activación sin capturar PHI ni contenido clínico. La analítica debe responder: ¿qué mensaje trae demos?, ¿qué canal trae médicos correctos?, ¿dónde abandonan?, ¿qué tan rápido llegan a primera atención?

## Principios

1. Trackear para decidir, no para acumular datos.
2. No enviar PHI.
3. No enviar nombres de pacientes.
4. No enviar texto clínico, SOAP, receta, diagnóstico, transcripción ni documentos.
5. Usar IDs técnicos pseudónimos cuando sea necesario.

## Eventos mínimos

| Evento | Cuándo ocurre | Propiedades permitidas | Prohibido |
|---|---|---|---|
| `landing_viewed` | Visita página pública | path, referrer, utm, device_type | nombre, correo, datos clínicos |
| `demo_cta_clicked` | Click en CTA demo | page, cta_location, utm | texto libre sensible |
| `demo_requested` | Envío formulario demo | specialty, clinic_size_range, source | nombres de pacientes, motivo clínico |
| `signup_started` | Inicio registro médico | source, specialty | password, datos de paciente |
| `signup_completed` | Registro completado | account_id, specialty | datos clínicos |
| `doctor_profile_configured` | Perfil público listo | specialty, services_count | notas clínicas |
| `first_service_created` | Primer servicio | service_category, price_range opcional | descripciones con PHI |
| `first_availability_created` | Primera disponibilidad | slots_count, days_configured | nombres de pacientes |
| `first_appointment_created` | Primera cita operativa | source=portal/manual, specialty | nombre/motivo del paciente |
| `first_encounter_opened` | Primera atención abierta | elapsed_days_from_signup | contenido clínico |

## KPIs iniciales

| Etapa | KPI | Uso |
|---|---|---|
| Acquisition | demo request rate | Medir claridad del sitio |
| Activation | signup → profile configured | Medir onboarding |
| Activation | signup → first appointment | Medir valor operativo |
| Activation | signup → first encounter opened | Medir adopción clínica inicial |
| Revenue | demo → paid conversion | Validar disposición de pago |

## Embudo recomendado

1. Landing view.
2. Demo CTA click.
3. Demo request.
4. Signup started.
5. Signup completed.
6. Profile configured.
7. Availability published.
8. First appointment.
9. First encounter opened.

## Reglas de implementación futura

- Revisar cada evento contra la regla: “¿podría identificar o revelar algo del paciente?” Si sí, no se envía.
- Mantener analítica separada de logs clínicos.
- No usar herramientas de session replay en áreas clínicas.
- No grabar campos de formularios con texto libre salvo que estén explícitamente sanitizados.
