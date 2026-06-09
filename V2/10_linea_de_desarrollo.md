# 10 - Linea de desarrollo V2

## Por que usar linea de desarrollo y no roadmap

Un roadmap dice hacia donde va el producto. Para MiDoc V2 conviene una linea de desarrollo por pasos con compuertas, porque el riesgo principal no es perder vision, sino avanzar con funciones incompletas o volver a crecer el sistema sin control.

Esta linea responde cuatro preguntas por cada paso:

- Que se construye?
- Que debe existir antes?
- Como se valida?
- Que decision permite avanzar?

## Reglas de avance

- No se avanza si el flujo principal del paso actual no funciona de inicio a fin.
- No se agregan especialidades fuera de medicina familiar/general y odontologia.
- No se construye IA como dependencia del flujo clinico manual.
- No se publica informacion clinica sin permisos, auditoria y alcance autorizado.
- No se manda a piloto productivo sin respaldos, monitoreo, limpieza de jobs y expiracion de enlaces/tokens.
- Si una idea nueva no pertenece al paso actual, se registra en fases posteriores y no interrumpe el nucleo.
- Ningun dato clinico se persiste en la nube de forma permanente. La nube es portal publico y buzon temporal; la fuente de verdad clinica es la app local del medico.

## Premisa de arquitectura (actualizada 2026-06-09)

V2 se compone de dos aplicaciones (detalle en `01_contexto_v2.md`):

| Aplicacion | Stack | Que contiene |
|---|---|---|
| **Portal nube** | Next.js + PostgreSQL minimo | Identidad, legal, suscripcion, perfil publico, agenda publica con hold, cuenta paciente, preconsulta, buzon temporal de documentos, notificaciones SMS/correo. |
| **App del medico** | Tauri 2 + React + SQLite cifrado | Expediente, encuentros, notas SOAP, recetas, plantillas de especialidad, odontologia, documentos clinicos, consentimientos, IA, caja y operacion presencial. |

El avance ya realizado sobre `V2/consultorio-app` (auth, perfil, servicios, disponibilidad) corresponde al **portal nube** y se conserva. Cada paso de esta linea indica en que aplicacion se construye:

- Pasos 1, 2, 3, 7 y 12: principalmente portal nube.
- Pasos 4, 5, 8, 10 y 11: principalmente app del medico.
- Pasos 0, 6 y 9: ambas (incluyen el contrato de sincronizacion entre ellas).

La sincronizacion sigue un solo patron: la app del medico publica disponibilidad y estados de cita hacia la nube, y descarga citas nuevas, preconsultas y documentos del buzon temporal, que se purga tras la descarga confirmada.

## Vista general

| Paso | Nombre | Skill principal | Resultado |
|---|---|---|---|
| 0 | Preparacion V2 | `learn-codebase` | Base tecnica limpia para construir. |
| 1 | Identidad y legal | `codex-security:security-scan` | Usuarios seguros, sesiones, recuperacion y aceptacion legal. |
| 2 | Perfil y disponibilidad | `ui-ux-pro-max` | Medico publica servicios, horarios y perfil clinico. |
| 3 | Agenda publica | `superpowers:test-driven-development` | Paciente agenda con hold temporal y cita vinculada. |
| 4 | Atencion integrada | `superpowers:writing-plans` | Medico atiende desde cita con expediente, SOAP y receta. |
| 5 | Medicina general/familiar | `coding-standards` | Consulta general completa y usable sin IA. |
| 6 | Paciente y documentos | `codex-security:security-scan` | Precheckin, estudios, portal e historial autorizado. |
| 7 | Comunicaciones | `superpowers:test-driven-development` | SMS, correo, enlaces cortos, reintentos y bitacora. |
| 8 | Odontologia | `ui-ux-pro-max` | Consulta dental con odontograma, periodontograma y plan. |
| 9 | Piloto seguro | `playwright` | Version lista para piloto real controlado. |
| 10 | Operacion presencial | `impeccable` | Recepcion, caja, lista de espera y consulta sin cita. |
| 11 | IA gobernada | `codex-security:security-scan` | IA clinica con trazas, consentimiento, feedback y creditos. |
| 12 | SaaS/compliance | `analytics` | Planes, gating, ARCO, retencion, incidentes y 2FA. |

## Paso 0 - Preparacion V2

| Campo | Definicion |
|---|---|
| Objetivo | Crear una base tecnica limpia para desarrollar V2 sin arrastrar desorden de V1. |
| Requisitos relacionados | RNF07, RNF10, RNF11 |
| Entrada necesaria | Documentacion V2 aprobada y alcance limitado a medico, dentista y paciente. |
| Skills IA recomendadas | `learn-codebase`, `smart-explore`, `coding-standards`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion` |
| Se construye | Estructura de los dos proyectos (portal nube y app de escritorio Tauri), convenciones, configuracion local, ambientes, modelo conceptual, base SQLite cifrada inicial y semilla minima. |
| Se valida con | Levantar portal local, compilar y abrir la app de escritorio con base cifrada creada, correr pruebas base y crear migracion inicial en ambos lados. |
| Compuerta de avance | Ambos proyectos pueden instalarse, ejecutarse y probarse desde cero; la app de escritorio crea y abre su base local cifrada. |
| Push recomendado | Hacer push cuando la base V2 levante localmente y las pruebas/configuracion inicial pasen. |

Checklist de salida:

- Dos proyectos definidos: portal nube (Next.js, hereda el avance actual de `V2/consultorio-app`) y app del medico (Tauri 2 + React + SQLite cifrado).
- Modelo conceptual inicial con residencia definida: que entidad vive en nube, cual en local y cual transita por el buzon.
- Base local cifrada (SQLCipher) creandose y abriendose con llave derivada de la credencial del medico.
- Ambientes definidos: local, staging y produccion para el portal; canal de builds para la app.
- Lint, tipos, pruebas y migraciones funcionando en ambos proyectos.

## Paso 1 - Identidad, seguridad y legal

| Campo | Definicion |
|---|---|
| Objetivo | Permitir acceso seguro y trazable para medico y paciente. |
| Requisitos relacionados | RF01, RF02, RF06, RF18, RF33, RF35, RNF01, RNF06, RNF12, RNF14 |
| Entrada necesaria | Base tecnica funcionando. |
| Skills IA recomendadas | `smart-explore`, `coding-standards`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `codex-security:security-scan` |
| Se construye | Registro, login, logout, roles, sesiones, recuperacion de contrasena, terminos, privacidad, aceptacion legal, auditoria y rate limit. |
| Se valida con | Medico se registra, acepta terminos, inicia sesion, cierra sesion y recupera contrasena por correo. |
| Compuerta de avance | Ningun flujo clinico se construye hasta que auth, legal y auditoria minima funcionen. |
| Push recomendado | Hacer push al cerrar registro/login/legal/recuperacion con pruebas de seguridad basicas pasando. |

Checklist de salida:

- Registro medico con datos profesionales minimos.
- Login/logout con sesion segura.
- Recuperacion de cuenta por correo con token de un solo uso.
- Respuesta no enumerable en recuperacion de cuenta.
- Aceptacion legal con version registrada.
- Rate limit en registro, login y recuperacion.

## Paso 2 - Perfil publico, servicios y disponibilidad

| Campo | Definicion |
|---|---|
| Objetivo | Permitir que el medico publique su oferta y horarios. |
| Requisitos relacionados | RF03, RF04, RF22, RNF03, RNF04 |
| Entrada necesaria | Medico autenticado y legal aceptado. |
| Skills IA recomendadas | `smart-explore`, `impeccable`, `ui-ux-pro-max`, `coding-standards`, `superpowers:test-driven-development`, `superpowers:verification-before-completion` |
| Se construye | Perfil publico, servicios, precios, duracion, disponibilidad semanal, bloqueos y seleccion de perfil clinico. |
| Se valida con | Un paciente puede ver perfil, servicios y horarios disponibles desde movil. |
| Compuerta de avance | No hay agenda publica hasta que disponibilidad y servicios sean confiables. |
| Push recomendado | Hacer push cuando perfil, servicios y disponibilidad se puedan crear, editar y consultar publicamente. |

Checklist de salida:

- Perfil publico editable.
- Servicios activos/inactivos con precio y duracion.
- Disponibilidad semanal y excepciones.
- Perfil clinico seleccionado: medicina familiar/general u odontologia.
- Vista publica clara en desktop y movil.

## Paso 3 - Agenda publica integrada

| Campo | Definicion |
|---|---|
| Objetivo | Permitir que el paciente agende sin doble reserva y dejando lista la atencion clinica. |
| Requisitos relacionados | RF05, RF06, RF07, RF08, RF16, RF21, RF34, RNF04, RNF08, RNF14 |
| Entrada necesaria | Perfil publico, servicios y disponibilidad. |
| Skills IA recomendadas | `smart-explore`, `impeccable`, `ui-ux-pro-max`, `coding-standards`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion` |
| Se construye | Agenda publica, hold temporal, creacion/vinculacion de paciente, cita, confirmacion, cancelacion, reagenda, acceso a precheckin y primer contrato de sincronizacion: la app del medico descarga citas nuevas y publica disponibilidad/estados. |
| Se valida con | Paciente agenda, el horario queda bloqueado temporalmente, la cita se confirma y el medico la ve en su panel. |
| Compuerta de avance | No se inicia expediente clinico hasta que cita-paciente-horario sea consistente. |
| Push recomendado | Hacer push cuando agendado, hold temporal, confirmacion/cancelacion/reagenda y vinculacion de paciente funcionen. |

Checklist de salida:

- Hold temporal con expiracion.
- Liberacion automatica de horarios no confirmados.
- Prevencion de doble reserva.
- Creacion de paciente invitado o vinculado.
- Confirmar, cancelar y reagendar con sesion o token.
- Enlaces de accion preparados para SMS.

## Paso 4 - Atencion clinica integrada

| Campo | Definicion |
|---|---|
| Objetivo | Unir cita, paciente, expediente, nota, receta e indicaciones en una sola experiencia. |
| Requisitos relacionados | RF09, RF10, RF11, RF12, RF14, RF15, RF18, RF36, RNF02, RNF05, RNF07 |
| Entrada necesaria | Cita creada y paciente vinculado. |
| Skills IA recomendadas | `learn-codebase`, `smart-explore`, `impeccable`, `ui-ux-pro-max`, `coding-standards`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion` |
| Se construye | En la app del medico: pantalla de atencion, expediente desde cita, actualizacion clinica, SOAP manual, receta, indicaciones, cierre/firma/versionado y auditoria. Todo persiste en la base local cifrada; nada de este paso toca la nube. |
| Se valida con | Medico atiende una cita completa, firma nota y el historial queda actualizado. |
| Compuerta de avance | No se publican datos al paciente hasta que existan permisos y cierre de nota. |
| Push recomendado | Hacer push cuando una cita pueda convertirse en atencion clinica completa con nota cerrada y auditada. |

Checklist de salida:

- Atencion abierta desde agenda.
- Expediente consultable desde cita.
- Actualizacion de antecedentes, diagnostico, plan y seguimiento.
- Nota SOAP manual.
- Receta e indicaciones.
- Cierre, firma y versionado de nota.
- Auditoria de cambios criticos.

## Paso 5 - Medicina familiar/general

| Campo | Definicion |
|---|---|
| Objetivo | Hacer que el flujo base funcione para consulta general/familiar real. |
| Requisitos relacionados | RF22, RF23, RF39, RNF05, RNF10 |
| Entrada necesaria | Atencion clinica integrada funcionando. |
| Skills IA recomendadas | `learn-codebase`, `smart-explore`, `coding-standards`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion` |
| Se construye | Plantilla de medicina familiar/general con antecedentes, factores de riesgo, revision por sistemas, exploracion, laboratorios, tamizajes, plan preventivo y seguimiento. |
| Se valida con | Medico general/familiar documenta una consulta completa sin usar IA. |
| Compuerta de avance | El MVP medico no depende de odontologia ni de IA avanzada. |
| Push recomendado | Hacer push cuando la plantilla de medicina familiar/general permita documentar consulta completa sin IA. |

Checklist de salida:

- Payload clinico de medicina general/familiar.
- Secciones de antecedentes y factores de riesgo.
- Exploracion fisica y diagnosticos.
- Laboratorios, tamizajes y plan preventivo.
- Seguimiento e indicaciones.
- Espacio preparado para IA posterior, sin bloquear captura manual.

## Paso 6 - Paciente, precheckin y documentos clinicos

| Campo | Definicion |
|---|---|
| Objetivo | Permitir que el paciente aporte informacion antes de consulta y consulte lo autorizado despues. |
| Requisitos relacionados | RF08, RF15, RF19, RF20, RF37, RNF04, RNF09 |
| Entrada necesaria | Agenda y atencion clinica funcionando. |
| Skills IA recomendadas | `smart-explore`, `impeccable`, `ui-ux-pro-max`, `coding-standards`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `codex-security:security-scan` |
| Se construye | Portal paciente, precheckin, carga de documentos por medico, enlace temporal de carga por paciente (a buzon temporal en nube), descarga y purga del buzon desde la app del medico, historial y resumen autorizado publicado explicitamente por el medico con expiracion. |
| Se valida con | Paciente sube estudios por enlace temporal y descarga resumen autorizado despues del cierre clinico. |
| Compuerta de avance | Ningun archivo clinico queda publico; todo acceso debe tener permiso, expiracion o auditoria. |
| Push recomendado | Hacer push cuando portal, precheckin, carga de documentos y resumen autorizado pasen pruebas de permisos. |

Checklist de salida:

- Portal paciente con citas e historial permitido.
- Precheckin asociado a cita.
- Carga de documentos por medico.
- Enlace temporal de carga por paciente.
- Expiracion e invalidacion de enlaces.
- Resumen autorizado descargable.
- Auditoria de acceso a documentos.

## Paso 7 - Comunicaciones transaccionales

| Campo | Definicion |
|---|---|
| Objetivo | Enviar mensajes confiables por SMS y correo con trazabilidad. |
| Requisitos relacionados | RF16, RF21, RF32, RF33, RNF08, RNF12, RNF13 |
| Entrada necesaria | Agenda, recuperacion y enlaces de accion definidos. |
| Skills IA recomendadas | `smart-explore`, `coding-standards`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `codex-security:security-scan` |
| Se construye | Proveedor SMS, proveedor correo, plantillas, cola, enlaces cortos, estados, reintentos y bitacora. |
| Se valida con | Confirmacion, recordatorio, recuperacion y carga de estudios se envian y quedan auditados. |
| Compuerta de avance | No se usa comunicacion en piloto sin estados de envio y reintentos controlados. |
| Push recomendado | Hacer push cuando SMS, correo, enlaces cortos, estados y reintentos esten trazados y probados. |

Checklist de salida:

- Plantillas para confirmacion, recordatorio, precheckin, carga de estudios y recuperacion.
- Enlaces cortos con expiracion y contador de uso.
- Cola de notificaciones.
- Estados: pendiente, enviado, fallido y reintentado.
- Errores visibles para soporte.

## Paso 8 - Odontologia

| Campo | Definicion |
|---|---|
| Objetivo | Habilitar consulta dental completa sin mezclar otras especialidades. |
| Requisitos relacionados | RF22, RF24, RF36, RNF10 |
| Entrada necesaria | Atencion clinica integrada y documentos. |
| Skills IA recomendadas | `learn-codebase`, `smart-explore`, `impeccable`, `ui-ux-pro-max`, `coding-standards`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion` |
| Se construye | Odontograma, periodontograma, condiciones bucales, plan dental, higiene, proxima revision, receta/indicaciones y cierre de nota dental. |
| Se valida con | Dentista registra hallazgos por pieza, periodonto, plan y seguimiento desde cita. |
| Compuerta de avance | Odontologia entra cuando el nucleo clinico ya no se rompe por cambios de modelo. |
| Push recomendado | Hacer push cuando el flujo dental completo funcione desde cita hasta nota dental cerrada. |

Checklist de salida:

- Odontograma por pieza y superficie.
- Periodontograma.
- Condiciones bucales generales.
- Plan dental por pieza o general.
- Higiene, proxima revision e indicaciones.
- Cierre/versionado de nota dental.

## Paso 9 - Piloto seguro de produccion

| Campo | Definicion |
|---|---|
| Objetivo | Preparar la V2 para operar con datos reales de forma controlada. |
| Requisitos relacionados | RNF01, RNF02, RNF03, RNF06, RNF08, RNF09, RNF13, RNF14 |
| Entrada necesaria | Flujo medico general, paciente, documentos y comunicacion funcionando. |
| Skills IA recomendadas | `learn-codebase`, `smart-explore`, `coding-standards`, `playwright`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `codex-security:security-scan` |
| Se construye | Portal: healthchecks, readiness, logs, limpieza de jobs, expiracion de holds/tokens/enlaces y purga verificada del buzon. App del medico: instalador firmado (Windows primero), auto-actualizacion, respaldo automatico cifrado y prueba de restauracion. Pruebas E2E y checklist de despliegue para ambos. |
| Se valida con | Staging reproduce los flujos criticos y puede recuperarse de fallos comunes. |
| Compuerta de avance | No hay piloto real sin backups probados y monitoreo basico. |
| Push recomendado | Hacer push cuando staging tenga healthchecks, backups, limpieza de jobs y pruebas E2E criticas. |

Checklist de salida:

- Healthcheck y readiness check del portal.
- Logs estructurados (sin contenido clinico en el portal).
- Limpieza de holds, tokens, enlaces y notificaciones vencidas; purga del buzon auditada.
- Instalador firmado y canal de auto-actualizacion de la app del medico.
- Respaldo automatico cifrado de la base local y prueba de restauracion documentada.
- Pruebas E2E de registro, agenda, sincronizacion, consulta, documentos, notificaciones y recuperacion.

## Paso 10 - Operacion presencial

| Campo | Definicion |
|---|---|
| Objetivo | Agregar control operativo para consultorios presenciales. |
| Requisitos relacionados | RF17, RF25, RF26, RF27, RF30, RF38 |
| Entrada necesaria | Piloto clinico estable. |
| Skills IA recomendadas | `learn-codebase`, `smart-explore`, `impeccable`, `ui-ux-pro-max`, `coding-standards`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion` |
| Se construye | Consulta sin cita, lista de espera, recepcion, estados operativos, caja diaria, recursos fisicos, recibos, depositos y anticipos. |
| Se valida con | Consultorio puede manejar llegada, espera, cobro y cierre de caja. |
| Compuerta de avance | Operacion presencial no debe cambiar el nucleo cita-expediente; solo extenderlo. |
| Push recomendado | Hacer push cuando recepcion, caja, lista de espera y consulta sin cita funcionen sin romper agenda-expediente. |

## Paso 11 - IA clinica gobernada

| Campo | Definicion |
|---|---|
| Objetivo | Agregar IA como apoyo clinico auditable y controlado por costo. |
| Requisitos relacionados | RF13, RF29, RF39, RF40, RF41, RNF05, RNF15 |
| Entrada necesaria | Flujo manual estable, consentimiento y auditoria. |
| Skills IA recomendadas | `learn-codebase`, `smart-explore`, `coding-standards`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `codex-security:security-scan` |
| Se construye | Capa multi-proveedor IA, benchmark clinico, SOAP asistido, resumen longitudinal, brechas clinicas, instrucciones al paciente, transcripcion de consulta por audio/voz, trazas, feedback, creditos y control de costo. |
| Se valida con | Medico revisa y aprueba salidas IA; el sistema registra consentimiento, proveedor, entrada, salida, version, costo, latencia y resultado de benchmark. |
| Compuerta de avance | Ninguna salida IA se guarda como clinica sin revision humana. |
| Push recomendado | Hacer push cuando IA tenga capa multi-proveedor, benchmark documentado, consentimiento, revision humana, trazas, feedback y control de costo. |

## Paso 12 - SaaS y compliance avanzado

| Campo | Definicion |
|---|---|
| Objetivo | Preparar el producto para escalar comercialmente y cumplir operacion avanzada. |
| Requisitos relacionados | RF28, RF31 |
| Entrada necesaria | Piloto validado y modelo comercial definido. |
| Skills IA recomendadas | `learn-codebase`, `smart-explore`, `coding-standards`, `analytics`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `codex-security:security-scan` |
| Se construye | Suscripcion, planes, gating por capacidades, solicitudes ARCO, retencion, incidentes, 2FA, recovery codes y operacion comercial. |
| Se valida con | Un cliente puede operar bajo plan definido y el sistema soporta controles de privacidad/seguridad avanzada. |
| Compuerta de avance | Comercializacion amplia solo despues de seguridad, soporte y compliance minimo. |
| Push recomendado | Hacer push cuando planes, gating, controles de privacidad y seguridad avanzada esten validados. |

## MVP recomendado

El MVP debe cerrar los pasos 0 a 7 y dejar odontologia como paso 8 si el tiempo no permite incluirla desde el primer piloto. El MVP incluye necesariamente las piezas local-first: app de escritorio instalable con base cifrada, sincronizacion con purga de buzon y respaldo con restauracion probada — sin ellas la promesa de residencia de datos no se cumple. El MVP recomendado contiene:

- Registro/login medico, recuperacion de cuenta y legal basico.
- Perfil publico, servicios y disponibilidad.
- Agendado con hold temporal.
- Creacion/vinculacion de paciente.
- Paquete integrado de atencion clinica.
- SOAP manual, receta, indicaciones y cierre/versionado de nota.
- Medicina familiar/general.
- Precheckin, documentos clinicos y carga por enlace temporal.
- Portal paciente con historial y resumen autorizado.
- SMS/correo transaccional basico.
- Seguridad, auditoria y anti-abuso minimo.
- App de escritorio instalable con base local cifrada y expediente residente en el equipo del medico.
- Sincronizacion app ↔ portal con buzon temporal y purga verificada.
- Respaldo automatico cifrado con restauracion probada.

La transcripcion de consulta por IA no forma parte del MVP recomendado. Debe entrar en IA clinica gobernada, despues de tener consentimiento, auditoria, flujo manual estable y politica de retencion o descarte de audio.

La seleccion final de proveedores de IA tampoco debe cerrarse en el MVP. GPT/OpenAI y Deepgram pueden mantenerse como base inicial, pero la V2 debe preparar una capa multi-proveedor para comparar OpenAI, Google MedLM, AWS HealthScribe, Deepgram, AssemblyAI y Nabla con datos representativos antes de decidir.

## Orden tactico sugerido

1. Construir base tecnica.
2. Cerrar identidad, legal y seguridad.
3. Publicar perfil medico y disponibilidad.
4. Construir agenda con hold temporal.
5. Construir atencion clinica integrada.
6. Completar medicina familiar/general.
7. Completar paciente, precheckin y documentos.
8. Activar SMS, correo y enlaces cortos.
9. Preparar piloto seguro.
10. Agregar odontologia si no entro antes.
11. Agregar operacion presencial.
12. Agregar IA gobernada.
13. Agregar SaaS/compliance avanzado.

## Buenas practicas de Git y push remoto

Cada paso indica su momento recomendado de push. Esta seccion define como hacerlo de forma segura y trazable para evitar trabajo perdido, conflictos grandes y cambios sin validar.

Reglas recomendadas:

- Trabajar en ramas cortas por paso, modulo o correccion, no directamente sobre `main`.
- Actualizar la rama local desde el remoto antes de empezar cambios importantes.
- Hacer commits pequenos, descriptivos y relacionados con una sola intencion.
- Ejecutar pruebas, lint y build antes de hacer push.
- Revisar `git status` y `git diff` antes de confirmar cambios.
- No subir archivos de entorno, secretos, bases de datos locales, dumps ni archivos temporales.
- No hacer force push sobre ramas compartidas salvo que exista acuerdo explicito.
- Abrir pull request o revision antes de integrar cambios a la rama principal.
- Mantener mensajes de commit claros, por ejemplo: `feat: add appointment hold`, `fix: protect recovery token reuse`, `docs: update V2 development line`.
- Hacer push frecuente al remoto al cerrar una unidad funcional validada, no hasta el final de una fase grande.

Flujo recomendado por tarea:

1. Actualizar base local: `git pull --rebase origin main`.
2. Crear rama: `git switch -c codex/nombre-corto-del-cambio`.
3. Implementar una unidad pequena y verificable.
4. Ejecutar pruebas y revisar cambios.
5. Confirmar: `git add ...` y `git commit -m "tipo: descripcion breve"`.
6. Subir rama: `git push -u origin codex/nombre-corto-del-cambio`.
7. Solicitar revision o abrir pull request.
8. Integrar a `main` solo si pruebas y revision estan correctas.

Compuerta de push:

| Pregunta | Debe cumplirse antes de push |
|---|---|
| La app compila o levanta localmente? | Si. |
| Las pruebas criticas pasan? | Si. |
| El cambio pertenece a la rama correcta? | Si. |
| No se incluyen secretos ni archivos locales? | Si. |
| El diff corresponde solo a la tarea actual? | Si. |
| El commit explica claramente que cambio se hizo? | Si. |

## Como usar esta linea

Antes de iniciar una tarea nueva, ubicarla en un paso. Si pertenece a un paso futuro, se documenta pero no se implementa. Si pertenece al paso actual, debe tener criterio de validacion antes de desarrollarse.

La pregunta de control es: "Esto ayuda a completar la compuerta actual?". Si la respuesta es no, probablemente es una buena idea para despues, no para ahora.
