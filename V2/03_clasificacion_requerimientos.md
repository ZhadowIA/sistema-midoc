# 03 - Clasificacion de requerimientos

## Criterio de clasificacion

- Requerimiento funcional: describe una accion, servicio o comportamiento que el sistema debe realizar.
- Requerimiento no funcional: describe una cualidad, restriccion o condicion bajo la cual el sistema debe operar.

## Tabla de clasificacion

| Pregunta o hallazgo | Tipo de requerimiento |
|---|---|
| Existen niveles de usuarios en el sistema web? | Requerimiento funcional |
| El medico necesita iniciar sesion para administrar su operacion? | Requerimiento funcional |
| El paciente puede agendar como invitado o con cuenta? | Requerimiento funcional |
| El paciente debe poder confirmar, cancelar o reagendar una cita? | Requerimiento funcional |
| La cita debe mostrar informacion del expediente clinico relacionado? | Requerimiento funcional |
| El medico debe poder crear o vincular un expediente desde una cita? | Requerimiento funcional |
| El sistema debe permitir cuestionarios previos a la consulta? | Requerimiento funcional |
| El medico debe poder generar una nota SOAP con apoyo de IA? | Requerimiento funcional |
| El medico debe poder transcribir la consulta por audio/voz con apoyo de IA? | Requerimiento funcional |
| La IA debe registrar consentimiento, eventos y resultados trazables? | Requerimiento funcional |
| El sistema debe permitir cambiar o comparar proveedores de IA sin reescribir los flujos clinicos? | Requerimiento funcional |
| El sistema debe permitir emitir receta e indicaciones al paciente? | Requerimiento funcional |
| El paciente debe poder consultar su historial clinico disponible? | Requerimiento funcional |
| El medico debe poder subir estudios de laboratorio u otros documentos clinicos? | Requerimiento funcional |
| El medico debe poder generar un enlace temporal para que el paciente suba estudios? | Requerimiento funcional |
| El sistema debe apartar temporalmente un horario para evitar doble reserva mientras se agenda? | Requerimiento funcional |
| El sistema debe enviar recordatorios y confirmaciones por SMS? | Requerimiento funcional |
| El sistema debe enviar notificaciones transaccionales por correo? | Requerimiento funcional |
| El sistema debe permitir recuperar cuenta por correo si se olvida la contrasena? | Requerimiento funcional |
| El sistema debe acortar links enviados por SMS? | Requerimiento funcional |
| El medico debe poder configurar disponibilidad, servicios y perfil publico? | Requerimiento funcional |
| El sistema debe mostrar paginas legales y registrar aceptacion de terminos/privacidad? | Requerimiento funcional |
| El medico debe poder cerrar, firmar y versionar la nota clinica? | Requerimiento funcional |
| El paciente debe poder descargar o consultar un resumen autorizado de su atencion? | Requerimiento funcional |
| El medico debe poder registrar una consulta sin cita previa cuando llegue un paciente espontaneo? | Requerimiento funcional |
| La IA debe poder apoyar con resumen longitudinal, brechas clinicas e instrucciones al paciente? | Requerimiento funcional |
| El sistema debe registrar pagos, caja y recibos basicos? | Requerimiento funcional |
| El sistema debe soportar consulta de medicina familiar/general? | Requerimiento funcional |
| El sistema debe soportar consulta odontologica con odontograma y periodontograma? | Requerimiento funcional |
| El sistema debe conservar lista de espera para espacios liberados? | Requerimiento funcional |
| El sistema debe conservar recepcion y caja como operacion de consulta? | Requerimiento funcional |
| El sistema debe conservar recursos fisicos como consultorios, equipos o unidades? | Requerimiento funcional |
| El sistema debe gestionar suscripcion, planes y capacidades activas? | Requerimiento funcional |
| El sistema debe gestionar creditos y gobernanza de IA? | Requerimiento funcional |
| El sistema debe ejecutar benchmarks clinicos antes de elegir proveedor definitivo de IA/transcripcion? | Requerimiento no funcional |
| La informacion clinica debe protegerse con autenticacion y roles? | Requerimiento no funcional |
| El sistema debe mantener auditoria de cambios criticos? | Requerimiento no funcional |
| La interfaz debe ser clara para uso clinico bajo presion? | Requerimiento no funcional |
| El sistema debe funcionar en dispositivos moviles para pacientes? | Requerimiento no funcional |
| Las fallas de IA no deben bloquear la consulta manual? | Requerimiento no funcional |
| El sistema debe cumplir politicas de privacidad, retencion y consentimiento? | Requerimiento no funcional |
| Los enlaces de carga y SMS deben expirar o poder invalidarse? | Requerimiento no funcional |
| Los tokens de recuperacion deben ser de un solo uso, expirar y auditarse? | Requerimiento no funcional |
| El sistema debe contar con healthchecks, trazas y limpieza de colas/enlaces temporales? | Requerimiento no funcional |
| El sistema debe proteger agendado, login y recuperacion contra abuso automatizado? | Requerimiento no funcional |
| Las especialidades fuera de medicina familiar/general y odontologia deben omitirse por ahora? | Requerimiento no funcional |

## Requerimientos funcionales identificados

| ID | Requerimiento |
|---|---|
| RF01 | Registrar medico. |
| RF02 | Iniciar sesion de medico. |
| RF03 | Configurar perfil publico del medico. |
| RF04 | Configurar servicios, horarios y disponibilidad. |
| RF05 | Agendar cita como paciente. |
| RF06 | Crear o vincular cuenta de paciente. |
| RF07 | Confirmar, cancelar o reagendar cita. |
| RF08 | Completar cuestionario previo o precheckin. |
| RF09 | Abrir paquete integrado de atencion clinica. |
| RF10 | Consultar expediente desde la cita. |
| RF11 | Crear o actualizar expediente durante la atencion. |
| RF12 | Capturar nota clinica SOAP. |
| RF13 | Generar apoyo de IA para nota o insights. |
| RF14 | Emitir receta e indicaciones. |
| RF15 | Consultar historial del paciente. |
| RF16 | Enviar notificaciones por SMS. |
| RF17 | Registrar cobro y recibo operativo. |
| RF18 | Administrar seguridad, auditoria y consentimientos. |
| RF19 | Subir documentos clinicos al expediente o cita. |
| RF20 | Generar enlace temporal para carga de estudios por paciente. |
| RF21 | Generar enlaces cortos para SMS. |
| RF22 | Configurar el perfil clinico como medicina familiar/general u odontologia. |
| RF23 | Documentar consulta familiar/general. |
| RF24 | Documentar consulta odontologica con odontograma, periodontograma y plan dental. |
| RF25 | Gestionar lista de espera y ofertas de espacios disponibles. |
| RF26 | Gestionar recepcion, estados operativos de cita y caja diaria. |
| RF27 | Gestionar recursos fisicos asignables a citas. |
| RF28 | Gestionar suscripcion, planes, capacidades y acceso por paquete. |
| RF29 | Gestionar creditos, uso, trazas y feedback de IA. |
| RF30 | Gestionar recibos, depositos, anticipos y facturacion operativa. |
| RF31 | Gestionar solicitudes ARCO, retencion de datos e incidentes de seguridad. |
| RF32 | Enviar notificaciones transaccionales por correo. |
| RF33 | Recuperar cuenta por correo con token seguro. |
| RF34 | Apartar horario temporalmente durante agendado para prevenir doble reserva. |
| RF35 | Gestionar paginas legales y aceptacion de terminos/privacidad. |
| RF36 | Cerrar, firmar y versionar nota clinica. |
| RF37 | Generar resumen autorizado descargable para el paciente. |
| RF38 | Registrar consulta sin cita previa o encuentro clinico independiente. |
| RF39 | Generar resumen longitudinal, brechas clinicas e instrucciones al paciente con apoyo de IA. |
| RF40 | Transcribir consulta clinica por audio/voz con consentimiento, revision medica y trazabilidad. |
| RF41 | Gestionar capa multi-proveedor de IA para LLM, transcripcion, benchmark y fallback. |

## Requerimientos no funcionales identificados

| ID | Requerimiento |
|---|---|
| RNF01 | Proteger datos clinicos con autenticacion, roles y sesiones seguras. |
| RNF02 | Registrar trazabilidad de cambios clinicos y operativos. |
| RNF03 | Mantener interfaz clara, sobria y accesible. |
| RNF04 | Soportar uso movil para agendado y portal del paciente. |
| RNF05 | Permitir continuidad de consulta aunque falle la IA. |
| RNF06 | Mantener privacidad, retencion y consentimiento documentados. |
| RNF07 | Evitar duplicidad innecesaria entre agenda y expediente. |
| RNF08 | Presentar estados de error, carga y exito de forma comprensible. |
| RNF09 | Proteger archivos clinicos con permisos, expiracion de enlaces y auditoria. |
| RNF10 | Mantener el alcance V2 inicial limitado a medicina familiar/general y odontologia. |
| RNF11 | Conservar capacidades heredadas sin obligar a implementarlas todas en el primer incremento. |
| RNF12 | Proteger recuperacion de cuenta con expiracion, un solo uso, rate limit y respuesta no enumerable. |
| RNF13 | Mantener observabilidad, healthchecks, trazas operativas y limpieza de trabajos programados. |
| RNF14 | Proteger flujos publicos y de autenticacion con rate limit, bloqueo progresivo y verificacion anti-abuso. |
| RNF15 | Evaluar proveedores de IA con benchmark clinico, consentimiento, seguridad, costo, latencia, precision y cumplimiento. |
