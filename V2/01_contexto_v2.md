# 01 - Contexto de MiDoc V2

## Sistema actual

MiDoc es una plataforma SaaS para consultorios medicos. El sistema actual incluye registro de medicos, perfil publico, agenda, portal de paciente, cuestionarios previos, expediente clinico, subida de documentos clinicos, notas SOAP, receta, pagos operativos, caja, notificaciones por SMS y correo, seguridad, auditoria y modulos de IA clinica.

La version actual crecio de forma incremental. Muchas funcionalidades fueron agregadas conforme aparecian nuevas ideas, lo que produjo separaciones funcionales utiles para avanzar rapido, pero menos convenientes para una version mas ordenada.

## Problema principal detectado

El flujo clinico se percibe fragmentado porque la agenda, la cita, el expediente, la preconsulta, la nota clinica, la receta, el cobro y el seguimiento pueden sentirse como piezas separadas. Para V2 se busca que el usuario trabaje alrededor de una unidad central: la atencion clinica del paciente.

## Decision V2

Agenda y expediente dejan de documentarse como modulos separados. En V2 se definen como un paquete integrado de atencion clinica:

- La cita abre el contexto del paciente.
- El expediente se consulta y actualiza desde el flujo de atencion.
- La preconsulta alimenta la consulta.
- La nota SOAP, receta, estudios de laboratorio, documentos clinicos, IA y seguimiento quedan conectados a la misma atencion.
- El medico puede subir documentos clinicos directamente o generar un enlace temporal para que el paciente cargue estudios antes o despues de la consulta.
- El paciente puede agendar, completar informacion previa y consultar su historial sin sentir que navega por sistemas distintos.

## Decision de arquitectura: aplicacion instalable local-first (2026-06-09)

V2 deja de ser una aplicacion web pura. El expediente clinico ya no vive en una base de datos central: vive cifrado en el ordenador del medico. La motivacion es reducir la exposicion legal del producto frente a datos personales sensibles (LFPDPPP, NOM-004/NOM-024): el medico es el responsable de sus expedientes con sus propios medios, y MiDoc deja de custodiar datos clinicos de terceros.

### Componentes

| Componente | Tecnologia | Responsabilidad |
|---|---|---|
| App del medico (instalable) | Tauri 2 + React + TypeScript, SQLite cifrado (SQLCipher) | Todo lo clinico: expediente, encuentros, notas SOAP, recetas, odontograma, documentos, consentimientos, IA, caja. Fuente de verdad clinica. |
| Portal web (nube) | Next.js + TypeScript, PostgreSQL minimo | Lo publico y lo SaaS: perfil del medico, agenda publica con hold, cuenta del paciente, preconsulta, buzon temporal de documentos, notificaciones SMS/correo, suscripcion y pagos. |

### Reglas de residencia de datos

1. **La nube nunca almacena datos clinicos de forma permanente.** Preconsultas, cuestionarios y estudios subidos por el paciente viven en un buzon temporal cifrado; la app del medico los descarga al sincronizar y el buzon se purga.
2. **La nube solo conserva lo minimo operativo:** datos de contacto para citas y notificaciones (nombre, telefono, correo, fecha), disponibilidad publicada, cuenta y suscripcion del medico.
3. **La IA no contradice la promesa local.** La transcripcion corre en el dispositivo (Whisper local) como primera opcion; cualquier envio a IA en nube requiere consentimiento explicito y datos seudonimizados.
4. **El respaldo es parte del producto, no opcion del medico.** Respaldo automatico cifrado local y opcional a nube con cifrado del lado del cliente, con llave que solo el medico posee.
5. **Alcance inicial: un dispositivo principal por consultorio.** La sincronizacion multi-dispositivo se difiere; el respaldo cifrado cubre la continuidad.

### Lenguaje y reutilizacion

Todo el sistema se mantiene en TypeScript. Los servicios de dominio, esquemas de validacion (Zod) y modelo de datos de V1 son la referencia de reimplementacion; el codigo fuente V1 se conserva congelado en `V1/` como material de consulta. El inventario funcional completo de V1 y su decision de herencia esta en `12_inventario_funcional_v1.md`.

## Objetivo de V2

Rediseñar MiDoc como un sistema clinico integrado, claro y trazable, donde medico y paciente puedan completar sus flujos principales con menos friccion y mejor continuidad de informacion, y donde los datos clinicos residan en el equipo del medico y no en una base de datos central.

## Alcance clinico de V2 inicial

V2 se centrara en dos perfiles clinicos:

| Perfil | Alcance |
|---|---|
| Medicina familiar / general | Consulta general, antecedentes, factores de riesgo, revision por sistemas, plan preventivo, laboratorios, receta, seguimiento e indicaciones. |
| Odontologia | Consulta dental, odontograma, periodontograma, condiciones bucales, plan de tratamiento dental, higiene, estudios odontologicos y proxima revision. |

Quedan fuera por el momento pediatria, ginecologia, cardiologia, salud mental, oftalmologia, dermatologia y otras especialidades. No se eliminan como posibilidad futura, pero no gobiernan los requisitos V2 iniciales.

## Usuarios principales

| Usuario | Descripcion | Necesidad principal |
|---|---|---|
| Medico | Profesional que administra agenda, pacientes, consulta y seguimiento. | Atender pacientes con expediente, cita, nota, receta e IA en un mismo flujo. |
| Paciente | Persona que agenda, confirma, completa datos y consulta su historial. | Gestionar su atencion medica con claridad y acceso a su informacion. |

## Modulos funcionales base para V2

| Paquete | Descripcion |
|---|---|
| Atencion clinica integrada | Une agenda, cita, expediente, preconsulta, consulta, receta y seguimiento. |
| Portal del paciente | Permite agendar, confirmar, cancelar, reagendar, completar preconsulta, subir documentos autorizados y consultar historial. |
| Gestion del medico | Registro, configuracion, perfil publico, servicios, disponibilidad, especialidad base y seguridad. |
| Consulta familiar/general | Plantillas para factores de riesgo, tamizajes, revision por sistemas, exploracion y plan preventivo. |
| Consulta odontologica | Odontograma, periodontograma, condiciones bucales, plan dental, higiene y revision programada. |
| IA clinica asistida | Transcripcion, generacion SOAP, sugerencias, validaciones, creditos y gobernanza con consentimiento y trazabilidad. |
| Comunicacion y notificaciones | Confirmaciones, recordatorios y mensajes operativos por SMS y correo. Los SMS deben usar enlaces cortos para reducir friccion y riesgo de filtrado como spam. |
| Operacion y pagos | Recepcion, caja, contabilidad, recibos, depositos, suscripcion y control operativo. |
| Seguridad y cumplimiento | Roles, auditoria, 2FA, privacidad, ARCO, retencion, incidentes y consentimiento. |
| Recuperacion de cuenta | Recuperacion de contrasena por correo con token temporal, expiracion, auditoria y proteccion anti-abuso. |

## Criterios de exito

- El medico puede atender una consulta desde una vista integrada sin cambiar mentalmente entre agenda y expediente.
- El medico familiar/general puede documentar riesgo, prevencion, exploracion y plan clinico sin plantillas de otras especialidades.
- El dentista puede documentar odontograma, periodontograma, condiciones bucales y plan de tratamiento dental.
- El paciente puede iniciar y continuar su atencion desde agendado hasta historial.
- El medico y el paciente pueden adjuntar estudios clinicos de forma trazable y vinculada a la atencion correspondiente.
- Los SMS usan enlaces cortos controlados por el sistema para confirmaciones, preconsulta y carga de estudios.
- Los usuarios pueden recuperar el acceso a su cuenta mediante correo sin exponer si una cuenta existe o no.
- Los requisitos funcionales y no funcionales quedan clasificados, validados y listos para guiar implementacion.
- La documentacion sirve como base academica y tecnica antes de levantar el sistema V2.
