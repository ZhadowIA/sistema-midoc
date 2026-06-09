# 07 - Capacidades heredadas y alcance V2

## Objetivo

Evitar que V2 pierda funciones utiles del sistema anterior, sin volver a crecer sin control. Esta tabla separa lo que se conserva para V2 inicial, lo que se difiere y lo que se omite por ahora.

## Alcance clinico confirmado

| Area | Decision V2 |
|---|---|
| Medicina familiar / general | Entra en V2 inicial. Es el perfil clinico base para consulta general, prevencion, factores de riesgo, exploracion, receta y seguimiento. |
| Odontologia | Entra en V2 inicial. Debe conservar odontograma, periodontograma, condiciones bucales, plan dental, higiene y proxima revision. |
| Otras especialidades | Se omiten por ahora. No deben dirigir requisitos, pantallas ni casos de uso de V2 inicial. |

## Capacidades heredadas

| Capacidad V1 | Decision V2 | Motivo |
|---|---|---|
| Agenda + expediente integrado | Conservar en V2 inicial | Es la decision rectora de la nueva version. |
| Perfil publico y servicios del medico | Conservar en V2 inicial | Permite agendado claro y precios/duracion por servicio. |
| Retencion temporal de horario | Conservar en V2 inicial | Evita doble reserva mientras el paciente completa el agendado. |
| Paginas legales y aceptacion de terminos/privacidad | Conservar en V2 inicial | Es parte del alta, portal y uso de datos sensibles. |
| Portal paciente e historial | Conservar en V2 inicial | Da continuidad al paciente antes y despues de la consulta. |
| Resumen autorizado descargable | Conservar en V2 inicial | Permite entregar indicaciones y evidencia de atencion al paciente sin exponer todo el expediente. |
| Subida de estudios/documentos | Conservar en V2 inicial | Alimenta consulta familiar/general y odontologica. |
| Enlaces cortos para SMS | Conservar en V2 inicial | Reduce friccion y riesgo de spam en confirmaciones, preconsulta y carga de estudios. |
| Notificaciones por correo | Conservar en V2 inicial | Necesarias para recuperacion de cuenta, confirmaciones y respaldo transaccional a SMS. |
| Recuperacion de cuenta | Conservar en V2 inicial | Reduce carga de soporte y evita bloqueos por olvido de contrasena. |
| Medicina familiar/general | Conservar en V2 inicial | Es el perfil clinico base. |
| Odontologia | Conservar en V2 inicial | Es el segundo perfil clinico confirmado. |
| Odontograma | Conservar en V2 inicial | Es indispensable para consulta dental. |
| Periodontograma | Conservar en V2 inicial | Es necesario para evaluacion periodontal. |
| Condiciones bucales | Conservar en V2 inicial | Permite registrar hallazgos no ligados a una pieza especifica. |
| Plan dental | Conservar en V2 inicial | Permite seguimiento por pieza, prioridad y estado. |
| Firma/cierre/versionado de nota | Conservar en V2 inicial | Da trazabilidad clinica y evita ediciones sin control. |
| Consentimientos clinicos | Conservar en V2 inicial | Necesario para datos sensibles, IA y portal. |
| Auditoria de acciones criticas | Conservar en V2 inicial | Necesario por seguridad y cumplimiento. |
| Rate limit, bloqueo y verificacion anti-abuso | Conservar en V2 inicial | Protege agendado publico, login, recuperacion y enlaces de accion. |
| Lista de espera | Diferir a V2 operativa | Es valiosa, pero no bloquea la primera experiencia clinica integrada. |
| Recepcion | Diferir a V2 operativa | Relevante para consultorios con flujo presencial. |
| Caja diaria | Diferir a V2 operativa | Importante para operacion, pero puede seguir despues del flujo clinico. |
| Recibos, depositos y anticipos | Diferir a V2 operativa | Mantener en mapa para no perder monetizacion y control de no-show. |
| Recursos fisicos | Diferir a V2 operativa | Util para consultorios con salas/equipos, no obligatorio para V2 inicial. |
| Suscripcion, planes y gating por capacidades | Diferir a V2 comercial | Debe conservarse para SaaS, pero no gobierna el levantamiento clinico inicial. |
| Creditos IA | Diferir a V2 IA/comercial | Necesario si la IA tiene costo controlado por uso. |
| Gobernanza IA | Diferir a V2 IA/compliance | Debe existir antes de produccion, pero no bloquea la documentacion clinica base. |
| Capa multi-proveedor IA | Diferir a V2 IA clinica | Permite mantener GPT/OpenAI y Deepgram como base inicial, comparando alternativas sin reescribir el sistema. |
| Benchmark clinico de IA | Diferir a V2 IA clinica | Debe comparar precision, costo, latencia, seguridad y cumplimiento con consultas representativas. |
| Resumen longitudinal, brechas clinicas e instrucciones con IA | Diferir a V2 IA clinica | Es util para medicina familiar/general, pero debe salir despues de consentimiento, auditoria y revision medica. |
| Dictado o transcripcion clinica | Diferir a V2 IA clinica | Puede acelerar captura, pero requiere consentimiento, revision medica, manejo seguro de audio y trazabilidad. |
| Consulta sin cita previa | Diferir a V2 operativa | Es util para pacientes espontaneos, pero puede implementarse despues del paquete cita-expediente inicial. |
| ARCO, retencion e incidentes | Diferir a V2 compliance | Relevante para produccion y cumplimiento. |
| 2FA y recovery codes | Diferir a V2 seguridad | Necesario para endurecimiento, no para flujo clinico inicial. |
| Healthchecks, observabilidad y limpieza de jobs | Diferir a V2 produccion | Necesario antes de operar en produccion real, especialmente para colas, enlaces y recordatorios. |
| Funnel y atribucion comercial | Omitir por ahora | Pertenece a crecimiento; no debe distraer del rediseño clinico. |
| Multi-clinica avanzada y secretarias | Omitir por ahora | El usuario pidio omitir otros actores y enfocarse en medico/paciente. |
| Admin interno de clientes | Omitir por ahora | Es operacion interna del SaaS, no parte del levantamiento clinico V2. |
| Teleconsulta | Omitir por ahora | No entra en el foco de medicina general/odontologia presencial inicial. |
| Bot conversacional del canal anterior | Omitir por ahora | La V2 usa SMS y correo como canales transaccionales definidos. |

## Regla de alcance

Si una funcion no ayuda directamente a medicina familiar/general, odontologia, agenda-expediente integrado, portal paciente, documentos clinicos, SMS/correo o seguridad basica, no debe entrar al primer incremento de V2.
