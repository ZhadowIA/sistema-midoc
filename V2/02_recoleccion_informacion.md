# 02 - Tecnica de recopilacion de informacion

## Tecnica seleccionada

Se usara una tecnica mixta compuesta por:

- Entrevista semiestructurada.
- Cuestionario dirigido.
- Observacion del sistema actual.

Esta combinacion permite recuperar necesidades declaradas por los usuarios, validar prioridades y detectar problemas reales del flujo existente.

## Objetivo de la recopilacion

Identificar requerimientos para MiDoc V2 con enfasis en integrar agenda y expediente en un paquete unico de atencion clinica.

## Participantes propuestos

| Participante | Rol | Motivo |
|---|---|---|
| Medico | Usuario operativo principal | Usa agenda, expediente, consulta, receta, IA y seguimiento. |
| Paciente | Usuario externo principal | Agenda citas, completa cuestionarios y consulta historial. |
| Administrador del proyecto | Responsable de producto | Define alcance, prioridades y restricciones de V2. |

## Entrevista semiestructurada

| Pregunta | Proposito | Tipo de requerimiento esperado |
|---|---|---|
| Que parte del sistema actual se siente mas separada o repetitiva? | Detectar friccion de flujo. | Funcional / usabilidad |
| Que informacion necesita ver el medico al abrir una cita? | Definir vista integrada de atencion. | Funcional |
| Que datos deberia completar el paciente antes de la consulta? | Definir preconsulta y expediente inicial. | Funcional |
| Que estudios o archivos clinicos debe poder subir el medico o solicitar al paciente? | Definir carga documental clinica. | Funcional |
| En que casos debe generarse un enlace temporal para subir estudios? | Definir carga externa controlada. | Funcional / seguridad |
| Que campos necesita el medico familiar/general durante una consulta comun? | Definir plantilla familiar/general. | Funcional |
| Que elementos necesita el dentista durante una consulta dental? | Definir odontograma, periodontograma y plan dental. | Funcional |
| Que acciones debe poder realizar el paciente despues de agendar? | Definir portal del paciente. | Funcional |
| Los enlaces enviados por SMS deben ser cortos y controlados por el sistema? | Definir acortador de links para SMS. | Funcional / no funcional |
| Que notificaciones deben enviarse por correo ademas de SMS? | Definir canal email transaccional. | Funcional |
| Como debe recuperar su cuenta un medico o paciente que olvido su contrasena? | Definir recuperacion segura de cuenta. | Funcional / seguridad |
| Que funciones del sistema anterior se deben conservar aunque no sean el foco de la consulta? | Evitar perdida de capacidades utiles. | Funcional / alcance |
| Que riesgos existen si la informacion clinica queda dispersa? | Identificar seguridad, trazabilidad y cumplimiento. | No funcional |
| Que tareas deben seguir funcionando si falla la IA? | Definir continuidad operativa. | No funcional |

## Cuestionario dirigido

| Pregunta | Opciones | Uso esperado |
|---|---|---|
| Cual flujo debe ser prioritario en V2? | Agendar, atender consulta, historial, pagos, notificaciones | Priorizacion funcional |
| El expediente debe abrirse desde la cita? | Si, No, Solo en consulta | Validar paquete agenda-expediente |
| Que tan importante es el acceso movil? | Alto, Medio, Bajo | Requisito no funcional de usabilidad |
| La IA debe ser obligatoria para usar la consulta? | No, Opcional, Si | Definir dependencia de IA |
| El paciente debe tener cuenta para agendar? | Obligatoria, Opcional, Invitado permitido | Regla de acceso |
| Quien puede subir estudios clinicos? | Medico, Paciente con cuenta, Paciente con enlace temporal, Todos los anteriores | Definir permisos de carga |
| Que tipo de enlace debe enviarse por SMS? | Enlace corto del sistema, URL completa, Sin enlaces | Definir comunicacion segura y usable |
| Que proveedor de correo conviene para V2? | Resend, SendGrid, Amazon SES, Otro | Definir integracion transaccional |
| Como debe comportarse password reset? | Token de un solo uso, Codigo SMS, Soporte manual | Definir seguridad y UX |
| Que especialidades entran en V2 inicial? | Medicina familiar/general, Odontologia, Todas, Otra combinacion | Definir alcance clinico |
| Que capacidades heredadas se conservan? | Recepcion/caja/recursos/waitlist, Todo V1, Solo consulta, Ninguna | Definir alcance operativo |

## Observacion del sistema actual

La observacion se realiza sobre las rutas y documentos actuales del sistema:

| Area observada | Hallazgo | Implicacion V2 |
|---|---|---|
| Agenda publica | El paciente puede elegir medico, fecha, horario y datos. | Mantener agendado como entrada principal del flujo. |
| Portal paciente | Existe historial, cuenta, consultas y precheckin. | Consolidar continuidad despues de agendar. |
| Panel medico | Existen agenda, pacientes, consulta, caja, configuracion e IA. | Integrar el trabajo alrededor de la atencion clinica. |
| Expediente clinico | Hay historia clinica, encuentros, notas, receta y documentos. | Vincularlo directamente a la cita y consulta. |
| Carga de estudios | Hay soporte para documentos de paciente y carga externa mediante enlace de cita. | Documentar carga clinica por medico, paciente y enlace temporal. |
| Medicina familiar/general | Hay plantilla para factores de riesgo, tamizajes y revision por sistemas. | Convertirla en perfil clinico base de V2. |
| Odontologia | Hay odontograma, periodontograma, condiciones bucales y plan de tratamiento. | Incluirla como perfil clinico base de V2. |
| Operacion heredada | Hay waitlist, recepcion, caja, recursos, suscripcion, creditos IA, gobernanza, ARCO e incidentes. | Clasificar que se conserva, que se difiere y que se omite. |
| SMS y correo | Hay base de SMS y proveedor de email en codigo, pero recuperacion de cuenta estaba pendiente por decision de proveedor. | Mantener comunicacion automatizada por SMS/correo y documentar recuperacion segura. |
| Seguridad | Hay roles, auditoria, 2FA parcial y politicas de datos. | Documentar seguridad como requisito no funcional transversal. |

## Resultado esperado

La recopilacion debe producir un conjunto de requerimientos clasificados, validados y priorizados para iniciar MiDoc V2 sin depender de ideas sueltas o decisiones implicitas.
