# 10 - Linea de desarrollo V2

## Estado actual (actualizado 2026-06-12)

**Pasos 0-12 completados.** Toda la implementación del MVP + piloto seguro + operación presencial + IA gobernada + SaaS/compliance está lista:
- Portal nube (Next.js + PostgreSQL) con identidad, perfil, agenda, documentos, notificaciones
- App del médico (Tauri 2 + React + SQLite cifrado) con expediente, SOAP, receta, sincronización E2E
- Cifrado de extremo a extremo en buzón temporal y resúmenes autorizados
- Pruebas E2E y validación del flujo completo desde registro hasta consulta
- Operación presencial: recepción, lista de espera, consulta sin cita, recursos, caja diaria, cobros y recibos (todo local, clase OPERATIVO)
- IA gobernada: capa multi-proveedor, consentimiento, seudonimización, trazas, revisión humana, costo/créditos, benchmark, transcripción de voz y reporte de uso al portal por referencia
- SaaS/compliance: suscripción con gating por capacidad, 2FA con códigos de recuperación, incidentes, exportación de auditoría, retención y derechos ARCO (residencia local)

**Paso 13 completado** (post-MVP, app del médico): directorio clínico de pacientes y expediente longitudinal con línea del tiempo editable. Rebanadas 1 (directorio), 2 (línea del tiempo), 3 (independencia agenda/directorio + anti-duplicados) y 4 (agenda semanal por bloques + "Atender" abre expediente) entregadas el 2026-06-12/13.

**Decisiones de proveedores (2026-06-13):** SMS = **Twilio**, correo = **Resend** (doc 08). IA: base **Gemini 3 Flash** por costo con fallback (Gemini 3.1 Pro / GPT-5.5); transcripción **Whisper local** primero y nube (AssemblyAI/Deepgram) como respaldo con consentimiento; MedLM/HealthScribe descartados para MVP porque los generalistas los superan en benchmark (doc 11). La seguridad de medicación se resuelve con herramientas **deterministas** (DDInter, openFDA, RxNorm/RxClass), no con IA.

**Extensión de la línea (pasos 14-17, planeados 2026-06-13):** estos pasos llevan a producción los pendientes acordados, en orden de dependencia:

- **Paso 14 — Seguridad de medicación determinista (sin IA).** Interacciones, alergias cruzadas y duplicidad terapéutica con fuentes públicas auditables. No depende de contratos externos; puede arrancar de inmediato.
- **Paso 15 — Transcripción local real (Whisper) y descarga de modelo.** Sustituye el proveedor fake por whisper.cpp real, con descarga gestionada del modelo recomendado y respaldo en nube. Construye sobre la recomendación de modelo ya entregada (paso 11 rebanada 7).
- **Paso 16 — Cableado de proveedores de IA reales en staging (BAA).** Adaptadores reales de LLM (Gemini base + fallback) y transcripción en nube, bajo BAA/contrato, con la gobernanza local intacta.
- **Paso 17 — Endurecimiento de producción: notificaciones y pago reales.** Twilio y Resend reales con dominios propios, y pasarela de pago real para la suscripción.

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

| Paso | Nombre | Skill principal | Resultado | Estado |
|---|---|---|---|---|
| 0 | Preparacion V2 | `learn-codebase` | Base tecnica limpia para construir. | ✅ DONE |
| 1 | Identidad y legal | `codex-security:security-scan` | Usuarios seguros, sesiones, recuperacion y aceptacion legal. | ✅ DONE |
| 2 | Perfil y disponibilidad | `ui-ux-pro-max` | Medico publica servicios, horarios y perfil clinico. | ✅ DONE |
| 3 | Agenda publica | `superpowers:test-driven-development` | Paciente agenda con hold temporal y cita vinculada. | ✅ DONE |
| 4 | Atencion integrada | `superpowers:writing-plans` | Medico atiende desde cita con expediente, SOAP y receta. | ✅ DONE |
| 5 | Medicina general/familiar | `coding-standards` | Consulta general completa y usable sin IA. | ✅ DONE |
| 6 | Paciente y documentos | `codex-security:security-scan` | Precheckin, estudios, portal e historial autorizado. | ✅ DONE |
| 7 | Comunicaciones | `superpowers:test-driven-development` | SMS, correo, enlaces cortos, reintentos y bitacora. | ✅ DONE |
| 8 | Odontologia | `ui-ux-pro-max` | Consulta dental con odontograma, periodontograma y plan. | ✅ DONE |
| 9 | Piloto seguro | `playwright` | Version lista para piloto real controlado. | ✅ DONE |
| 10 | Operacion presencial | `impeccable` | Recepcion, caja, lista de espera y consulta sin cita. | ✅ DONE |
| 11 | IA gobernada | `codex-security:security-scan` | IA clinica con trazas, consentimiento, feedback y creditos. | 🚧 IN PROGRESS (fundacion + SOAP asistido) |
| 12 | SaaS/compliance | `analytics` | Planes, gating, ARCO, retencion, incidentes y 2FA. | ✅ DONE |
| 13 | Directorio y expediente longitudinal | `impeccable` | Directorio de pacientes y linea del tiempo clinica editable. | ✅ DONE |
| 14 | Seguridad de medicacion determinista | `codex-security:security-scan` | Interacciones, alergias cruzadas y duplicidad sin IA, con fuente citada. | ✅ DONE |
| 15 | Transcripcion local real (Whisper) | `superpowers:writing-plans` | whisper.cpp real, descarga de modelo y respaldo en nube gobernado. | 🔜 PLANEADO |
| 16 | Proveedores de IA reales en staging (BAA) | `codex-security:security-scan` | Adaptadores reales de LLM/transcripcion con gobernanza intacta. | 🔜 PLANEADO |
| 17 | Produccion: notificaciones y pago reales | `superpowers:test-driven-development` | Twilio, Resend y pasarela de pago con dominios propios. | 🔜 PLANEADO |
| 18 | Agendado con responsable/tutor | `superpowers:test-driven-development` | El sistema distingue paciente con tutor de paciente sin tutor. | ✅ DONE |
| 19 | Pulido del flujo publico, preconsulta y sincronizacion | `impeccable` | Perfil/agenda fieles, preconsulta diferida (antecedentes o guiada por IA), recordatorio con cancelacion y sync con aviso. | 🔜 PLANEADO |

## Modelo y esfuerzo recomendado por tipo de tarea

Esta guia ayuda a administrar el costo en tokens: no toda tarea necesita el modelo mas caro ni el maximo razonamiento. Elegir el nivel adecuado por anticipado evita gastar de mas en trabajo mecanico y evita quedarse corto en trabajo critico.

Modelos disponibles (de mayor a menor capacidad/costo): **Opus 4.8** > **Sonnet 4.6** > **Haiku 4.5**. Fable 5 es alternativa de alta capacidad para iteracion rapida. El **esfuerzo de razonamiento** (bajo / medio / alto) se ajusta aparte del modelo.

Esfuerzo recomendado por modelo:

| Modelo Anthropic | Esfuerzo recomendado | Equivalente OpenAI | Esfuerzo recomendado |
|---|---|---|---|
| Opus 4.8 | Alto | `gpt-5.5` | Alto |
| Sonnet 4.6 | Medio | `gpt-5.4` | Medio |
| Haiku 4.5 | Bajo | `gpt-5-mini` | Bajo |

Referencias equivalentes de OpenAI para usar al lado de la columna Anthropic:

| Patron de uso | OpenAI recomendado |
|---|---|
| Trabajo de maximo razonamiento, arquitectura, seguridad, concurrencia y decisiones criticas | `gpt-5.5` |
| Implementacion cuidadosa, revision tecnica y asistencia de alto nivel en codigo o docs complejos | `gpt-5.4` |
| Tareas mecanicas, exploracion amplia, borradores y soporte de bajo costo/latencia | `gpt-5-mini` |

| Tipo de tarea | Modelo Anthropic | Modelo OpenAI | Esfuerzo | Por que |
|---|---|---|---|---|
| Diseño de arquitectura, contrato de sincronizacion, decisiones de residencia de datos | Opus 4.8 | `gpt-5.5` | Alto | Un error de diseño cuesta semanas; aqui el razonamiento profundo se paga solo. |
| Logica clinica, seguridad, concurrencia (holds, doble reserva, firma, cifrado) | Opus 4.8 | `gpt-5.5` | Alto | Correccion no negociable; casos borde sutiles y consecuencias legales. |
| Implementacion de feature con reglas claras ya definidas | Sonnet 4.6 | `gpt-5.4` | Medio | El diseño ya existe; es ejecucion cuidadosa, no exploracion. |
| UI sobre un sistema de diseño existente | Sonnet 4.6 | `gpt-5.4` | Medio | DESIGN.md ya fija las decisiones; es ensamblar con criterio. |
| Auditoria de un paso contra su checklist | Opus 4.8 | `gpt-5.5` | Medio-Alto | Encontrar lo que falta exige criterio; el costo de pasar algo por alto es alto. |
| Pruebas, refactors mecanicos, ajustes de tipos/lint | Sonnet 4.6 | `gpt-5.4` / `gpt-5-mini` | Bajo-Medio | Trabajo acotado y verificable de inmediato. |
| Documentacion, redaccion de docs, indices, READMEs | Haiku 4.5 / Sonnet 4.6 | `gpt-5-mini` / `gpt-5.4` | Bajo | Bajo riesgo, alta tolerancia a iteracion. |
| Exploracion amplia del codigo, busquedas, "donde esta X" | Haiku 4.5 | `gpt-5-mini` | Bajo | Fan-out de lectura; delegar a subagente cuando aplique. |
| Scaffolding, instalacion de dependencias, comandos de entorno | Haiku 4.5 | `gpt-5-mini` | Bajo | Mecanico; el valor esta en hacerlo, no en pensarlo. |

Recomendacion por paso de esta linea (combinando lo anterior con la naturaleza dominante de cada paso):

| Paso | Modelo Anthropic | Modelo OpenAI | Esfuerzo | Nota |
|---|---|---|---|---|
| 0 Preparacion | Sonnet 4.6 | `gpt-5.4` | Medio | Scaffolding; subir a Opus solo para el spike de cifrado. |
| 1 Identidad y legal | Opus 4.8 | `gpt-5.5` | Alto | Seguridad de cuenta, tokens, anti-enumeracion. |
| 2 Perfil y disponibilidad | Sonnet 4.6 | `gpt-5.4` | Medio | Subir a Opus para reglas de solapamiento/concurrencia. |
| 3 Agenda publica | Opus 4.8 | `gpt-5.5` | Alto | Holds, doble reserva, contrato de sincronizacion. |
| 4 Atencion integrada | Opus 4.8 | `gpt-5.5` | Alto | Nucleo clinico: versionado, firma, integridad. |
| 5 Medicina general/familiar | Sonnet 4.6 | `gpt-5.4` | Medio | Plantilla estructurada sobre la nota existente. |
| 6 Paciente y documentos | Opus 4.8 | `gpt-5.5` | Medio-Alto | Permisos, expiracion, cifrado del buzon. |
| 7 Comunicaciones | Sonnet 4.6 | `gpt-5.4` / `gpt-5-mini` | Medio | Cola, reintentos, plantillas; bien acotado. |
| 8 Odontologia | Sonnet 4.6 | `gpt-5.4` | Medio | Plantilla rica pero con patron del paso 5 ya probado. |
| 9 Piloto seguro | Opus 4.8 | `gpt-5.5` | Alto | Backups, restauracion, E2E, firma de instalador. |
| 10 Operacion presencial | Sonnet 4.6 | `gpt-5.4` | Medio | Extiende el nucleo sin tocar su consistencia. |
| 11 IA gobernada | Opus 4.8 | `gpt-5.5` | Alto | Gobernanza, consentimiento, multi-proveedor, costo. |
| 12 SaaS/compliance | Opus 4.8 | `gpt-5.5` | Medio-Alto | ARCO, retencion, 2FA, gating. |

Regla practica: empezar cada tarea en el nivel sugerido, y **subir** un escalon si aparece complejidad inesperada (un caso borde de concurrencia, una decision de diseño no anticipada) o **bajar** si resulta mas mecanico de lo previsto. La verificacion (pruebas, lint, build) se corre siempre, sin importar el modelo.

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

Entregado adicionalmente (2026-06-12):

- Rediseno editorial del perfil publico (tipografia serif, iconos SVG, sin emojis).
- Opiniones de pacientes con valoracion promedio y distribucion (modelo `DoctorReview`).
- Galeria del consultorio: modelo `DoctorGalleryImage`, render en perfil publico y panel de gestion por URL en configuracion del medico (`/api/admin/gallery`).

Pendientes registrados (no implementados; entran en paso futuro):

- **Subida de archivos binarios para la galeria y fotos de perfil/portada.** Hoy se gestionan por URL (consistente con `profilePhoto`/`coverPhoto`). La carga real de imagenes requiere almacenamiento blob (S3/Azure Blob) y endpoint de subida con validacion de tipo/tamano. Pertenece a la infraestructura del **Paso 9 (piloto seguro)**; no se implementa antes de tener storage definido.
- **Reordenar imagenes de galeria por arrastre.** El modelo ya tiene `displayOrder`; falta endpoint `PATCH` y UI de orden. Mejora de bajo riesgo del Paso 2; se difiere por prioridad, no por dependencia.

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

Extension (2026-06-14) — WhatsApp como canal opt-in via Twilio:

- **Decision.** Se reincorpora WhatsApp (descartado en V1 por usar el bot no oficial `whatsapp-web.js`) pero por la **API oficial de WhatsApp Business a traves de Twilio** — mismo proveedor y credenciales que el SMS. Es un canal mas sobre la capa de notificaciones existente, no una pieza aparte.
- **Modelo.** `NotificationChannel` agrega `WHATSAPP` (migracion `add_whatsapp_channel`). WhatsApp comparte el comportamiento de un canal telefonico (enlace corto, sin asunto) y se entrega por su propio proveedor (`WHATSAPP_PROVIDER`). `phoneNotificationChannel()` decide SMS (default) o WHATSAPP segun `PHONE_NOTIFICATION_CHANNEL`; los llamadores (agenda, documentos) lo usan en vez de fijar SMS.
- **Infra.** `WHATSAPP_PROVIDER`, `WHATSAPP_FROM` y `PHONE_NOTIFICATION_CHANNEL` cableados como config no secreta en Bicep (el remitente de WhatsApp es publico). `WHATSAPP_FROM` solo se emite si tiene valor.
- **Pendiente para paso 17.** El **envio real** exige cuenta de WhatsApp Business (WABA) aprobada por Meta y **plantillas pre-aprobadas** para mensajes iniciados por el negocio; eso se cablea con el Twilio real. Hasta entonces corre por el proveedor mock. Residencia intacta: solo nombre, contacto y datos de cita salen al proveedor; nunca contenido clinico.
- **Verificacion.** 74 pruebas del portal en verde (+2: el canal WhatsApp encola con enlace corto y sin asunto, y se entrega por su proveedor; el canal telefonico default es SMS), `eslint`/`tsc` limpios, `next build` ok y `az bicep build` sin errores.

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

Entregado (2026-06-11):

- **App del medico (`desktop-app`).** Migracion v6, clase OPERATIVO (solo local; nada viaja a la nube). Modulo de dominio `operations.rs` con pruebas unitarias y comandos Tauri en `lib.rs`. Pantalla `Recepcion.tsx` con pestañas Agenda / Recepcion y caja.
- **Lista de espera / recepcion / estados operativos.** Tabla `visits` que unifica llegada de cita agendada y consulta sin cita. Estados WAITING → IN_PROGRESS → DONE (CANCELLED terminal), con sellos de tiempo. `check_in_appointment` es idempotente por cita.
- **Consulta sin cita (RF17).** `register_walk_in` crea paciente local minimo + visita; `start_visit_encounter` abre el expediente (helper nuevo `open_encounter_for_patient` con `appointment_id` nulo) y enlaza la visita — extiende el nucleo clinico sin modificarlo.
- **Recursos fisicos.** Tabla `resources` (consultorios/equipos), alta/activacion y asignacion validada a la visita.
- **Caja diaria, cobros, recibos y anticipos (RF38).** Una sesion de caja abierta a la vez (indice unico parcial). `payments` con dinero en centavos, metodos CASH/CARD/TRANSFER y tipos PAYMENT/DEPOSIT/REFUND. Folio de recibo monotono (`R-NNNNNN`). Cierre de caja con totales netos por metodo y efectivo esperado. Sin caja abierta no se cobra.

Verificacion: 35 pruebas de Rust en verde (incluye carrera de caja unica, idempotencia de check-in, neto de reembolsos y congelado del dia), `cargo clippy` limpio, `tsc + vite build` ok y prueba manual del flujo recepcion→caja en el navegador (walk-in en sala, cobro con folio, efectivo esperado correcto).

Pendiente registrado (no implementado; mejora futura del paso):

- **Lista de espera por cancelacion (RF de agenda).** El RF "Gestionar lista de espera" con preferencias de horario, oferta de espacio y expiracion (pacientes que esperan que se libere un hueco) es distinto de la sala de espera del dia que aqui se implemento. Pertenece a la agenda publica del portal; se documenta para un paso futuro, no se implementa ahora.

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

Estado: 🚧 EN PROGRESO — rebanadas 1 (fundacion + SOAP), 2 (resumen/instrucciones/brechas), 3 (control de costo), 4 (benchmark clinico), 5 (reporte de uso al portal por referencia) y 6 (transcripcion de voz gobernada con fake local) entregadas (2026-06-11/12). La compuerta de push del paso esta cubierta; resta adaptador real en staging (rebanada futura). Construido sobre el paso 10.

Entregado (rebanada 1 — fundacion + SOAP asistido):

- **Arquitectura de residencia.** El procesamiento de contenido clinico con IA ocurre en la **app del medico** (local). El portal solo guarda gobernanza/creditos por referencia (`AiUsageLog` con `inputReference`/`outputReference`, nunca contenido). En esta rebanada todo es local; el reporte de uso al portal queda para una rebanada posterior.
- **Capa multi-proveedor con fallback (`ai.rs`).** Trait `AiProvider`, `ProviderRegistry` que intenta proveedores en orden y registra el ganador. `FakeProvider` determinista para fundacion/pruebas. El proveedor real (OpenAI, MedLM, …) se cablea en staging con BAA; no se cablea aqui para no enviar PHI sin acuerdo (regla 4 y politicas de IA).
- **Consentimiento (migracion v7, `ai_consents`).** Consentimiento por paciente y alcance (`SOAP_ASSIST`), con revocacion. Sin consentimiento vigente no se ejecuta IA.
- **Seudonimizacion.** El contexto clinico se redacta (sin nombre del paciente) antes de enviarse al proveedor; se guarda redactado en la traza.
- **Trazas completas (`ai_runs`).** Proveedor, modelo, version de prompt, costo estimado, latencia, consentimiento, estado de revision y feedback por cada ejecucion.
- **Compuerta de revision humana.** La salida IA es BORRADOR: `assist_soap` genera y registra el borrador pero **no** guarda nota. La UI lo muestra para revision; "Usar borrador" precarga el editor SOAP (el medico edita y guarda con el flujo manual existente) y "Descartar" cierra la traza. `review_run` registra APPROVED/DISCARDED. Ninguna salida se persiste como clinica sin revision.

Verificacion (rebanada 1): 42 pruebas de Rust en verde (consentimiento requerido, revocacion bloquea, fallback de proveedor, traza completa y sin autoguardado, revision idempotente), `cargo clippy` limpio, `tsc + vite build` ok y prueba manual en navegador.

Entregado (rebanada 2 — mas casos de texto, 2026-06-11):

- **Resumen longitudinal, instrucciones al paciente y brechas clinicas.** Tres tipos de uso nuevos (`LONGITUDINAL_SUMMARY`, `PATIENT_INSTRUCTIONS`, `CLINICAL_GAPS`) bajo la misma gobernanza: consentimiento, seudonimizacion, fallback, traza completa y revision humana. El `FakeProvider` adapta su salida a cada uso, con su propia version de prompt.
- **Consentimiento unificado de texto (`TEXT_ASSIST`).** Un solo alcance cubre los cuatro asistentes de texto (SOAP, resumen, instrucciones, brechas). La transcripcion por audio tendra su propio consentimiento explicito en una rebanada futura.
- **Nucleo compartido `run_assist`.** Centraliza validacion de encuentro abierto, consentimiento, seudonimizacion, orquestacion y registro de traza; `assist_soap` y `assist_text` lo reusan.
- **UI.** El panel de Atencion ofrece los cuatro asistentes. Las instrucciones se aplican al campo de indicaciones del editor (revision humana, sin guardar); resumen y brechas se muestran como referencia. Cada resultado cierra su traza con APPROVED/DISCARDED.

Verificacion (rebanada 2): 43 pruebas de Rust en verde (incluye los tres asistentes de texto bajo gobernanza, versiones de prompt por uso y sin autoguardado), `cargo clippy` limpio, `tsc + vite build` ok y prueba manual en navegador (generar instrucciones → aplicar al editor; generar resumen → referencia).

Entregado (rebanada 3 — control de costo y creditos, RF29, 2026-06-11):

- **Presupuesto mensual de IA.** Limite configurable en centavos (en `app_meta`, sin migracion nueva; 0 = sin limite). `set_budget_cents`/`get_budget_cents`.
- **Gasto agregado y bloqueo.** `usage_summary` reporta gasto del mes (UTC) y desglose por tipo de uso a partir de las trazas. `run_assist` verifica el presupuesto antes de ejecutar y bloquea con `BudgetExceeded` cuando el mes alcanza el limite. Generar consume, se apruebe o se descarte el borrador.
- **UI.** El panel de Atencion muestra "Uso de IA en YYYY-MM: $gastado de $presupuesto · N ejecuciones" y permite fijar el presupuesto mensual. El bloqueo se surface como error claro.

Verificacion (rebanada 3): 46 pruebas de Rust en verde (incluye bloqueo al alcanzar el limite, reapertura al subir el presupuesto, agregacion de uso y rechazo de presupuesto negativo), `cargo clippy` limpio, `tsc + vite build` ok y prueba manual en navegador (presupuesto $0.01 → primera ejecucion pasa y deja el mes en el limite → segunda bloqueada).

Entregado (rebanada 4 — benchmark clinico, RF41, 2026-06-11):

- **Benchmark con datos simulados.** Migracion v8 (`ai_benchmark_runs`, `ai_benchmark_results`, clase OPERATIVO; casos simulados, sin PHI). Set representativo minimo (medicina general y odontologia) sobre el que se evalua cada proveedor.
- **Comparacion multi-proveedor y decision documentada.** `run_benchmark` evalua cada proveedor por exito, completitud (secciones SOAP no vacias / texto no vacio), costo y latencia, y recomienda con una regla explicita (mayor exito → mayor completitud → menor costo → menor latencia), guardando la justificacion. `run_default_benchmark` compara dos proveedores fake de distinto costo; el real entra en staging con BAA.
- **UI.** Pestaña "Benchmark IA" en el espacio de trabajo: ejecuta la corrida y muestra el proveedor recomendado, la justificacion y la tabla comparativa por proveedor. Historial de corridas persistido.

Verificacion (rebanada 4): 48 pruebas de Rust en verde (incluye comparacion de proveedores con recomendacion del mas barato a igual calidad, persistencia/relectura y rechazo de benchmark sin proveedores), `cargo clippy` limpio, `tsc + vite build` ok y prueba manual en navegador (ejecutar benchmark → recomendado openai-fake $0.06 vs medlm-fake $0.18).

Entregado (rebanada 5 — reporte de metadatos de uso IA al portal, 2026-06-12):

- **Portal nube por referencia.** Nuevo endpoint `POST /api/sync/ai-usage` autenticado por device token. Registra `AiUsageLog` con `doctorId`, `externalRunId`, proveedor, modelo, version de prompt, costo, latencia, estado y `inputReference`/`outputReference`. Las referencias son IDs locales; el portal no recibe `input_redacted`, prompts, salidas, diagnosticos ni texto clinico.
- **Idempotencia y propiedad SaaS.** Migracion Prisma agrega `doctorId`, `externalRunId`, `reportedAt`, indice por doctor/fecha y unico `(doctorId, externalRunId)`, para que repetir el reporte actualice la misma corrida y soporte creditos/gobernanza por medico.
- **App del medico.** Migracion SQLite v9 agrega `usage_reported_at` a `ai_runs`. `sync_now` baja el buzon como antes y despues reporta lotes pendientes de uso IA; marca una corrida como enviada solo tras respuesta exitosa del portal. El mock de navegador simula el mismo comportamiento.
- **Pruebas.** Cobertura en portal para rechazo de referencias con campos extra, ausencia de contenido clinico e idempotencia; cobertura Rust para reportes por referencia y marca local de enviado.

Con esto la compuerta de push del paso 11 queda cubierta: capa multi-proveedor, consentimiento, revision humana, trazas, feedback, control de costo, benchmark documentado y reporte SaaS de uso por referencia.

Entregado (rebanada 6 — transcripcion de consulta por audio/voz, RF40, 2026-06-12):

- **Consentimiento separado de voz.** La transcripcion usa alcance propio `VOICE_TRANSCRIPTION`, independiente de `TEXT_ASSIST`. Autorizar asistencia de texto no habilita grabar/transcribir audio.
- **Proveedor fake local de transcripcion.** `FakeTranscriptionProvider` prueba el contrato sin red ni PHI externa. Los adaptadores reales (Deepgram, AssemblyAI, Nabla, AWS HealthScribe, etc.) quedan para staging con BAA/contrato y controles documentados.
- **Politica de retencion/descarte.** El audio entra como bytes transitorios y no se persiste. La traza local guarda solo metadatos operativos del audio (`mediaType`, `byteLength`, duracion, archivo y `discarded_after_transcription`) y la transcripcion queda como borrador clinico en la base local cifrada.
- **Revision humana obligatoria.** La transcripcion se muestra como BORRADOR y solo precarga el campo subjetivo del editor cuando el medico la usa; no guarda nota ni firma consulta automaticamente. Puede descartarse y queda trazada.
- **Costos y reporte SaaS.** La corrida cuenta en `usage_summary`; `pending_usage_reports` la reporta como `TRANSCRIPTION` con referencias `LOCAL_AI_AUDIO_INPUT`/`LOCAL_AI_TRANSCRIPT_OUTPUT`, nunca con audio ni texto transcrito.
- **UI y mock.** La pantalla de Atencion expone consentimiento de voz, selector de audio y acciones "Usar en subjetivo"/"Descartar"; el mock de navegador simula el mismo comportamiento para verificacion sin Tauri nativo.

Entregado (rebanada 7 — recomendacion de modelo Whisper local segun hardware, 2026-06-13):

- **Seleccion automatica de modelo (`transcription.rs`).** La app detecta RAM, nucleos de CPU y si hay GPU dedicada acelerable, y sugiere el tamano de Whisper local (small/medium/large-v3) para que el medico no tenga que entender de tamanos de modelo. Politica de seleccion pura y testeable; deteccion de GPU por SO (Windows CIM, Linux lspci, macOS system_profiler), conservadora ante fallo. Cuando el equipo queda por debajo del minimo comodo, sugiere la nube con consentimiento sin bloquear el modo offline.
- **Comando y UI.** `transcription_recommendation` (no toca datos clinicos) y pantalla "Transcripcion" que muestra el modelo sugerido, specs del equipo, aceleracion (GPU/CPU) y velocidad (casi en vivo / por lotes).
- **Frontera de alcance.** Esta rebanada solo recomienda; la integracion real de whisper.cpp, la descarga del modelo y el cableado del audio real son el paso 15.

Verificacion (rebanada 7): 81 pruebas de Rust en verde (+12: politica de seleccion por RAM/CPU/GPU y sus fronteras, clasificador de GPU dedicada vs integrada/virtual, agregador conservador), `cargo clippy` sin advertencias nuevas, `tsc + vite build` ok y prueba en navegador (pantalla "Transcripcion" con modelo sugerido y specs).

Pendiente (no requerido por la compuerta, ver pasos 15 y 16): integracion real de whisper.cpp con descarga de modelo (paso 15) y adaptadores de proveedor real (LLM y transcripcion en nube) en staging con BAA/contrato (paso 16), con pruebas contra fakes del contrato real y benchmark de casos representativos autorizados o simulados.

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

Estado: 🚧 EN PROGRESO — rebanada 1 (suscripcion gestionable + gating de capacidades) entregada (2026-06-12). Construido sobre el paso 11.

Entregado (rebanada 1 — suscripcion gestionable + gating de capacidades, portal):

- **Catalogo de capacidades (`subscription-service.ts`).** Clave por capacidad (`agenda`, `documents`, `notifications`, `ai`, `presential`); el plan las habilita via JSON y el parche de la suscripcion las ajusta. Tolera claves heredadas (`scheduling`→`agenda`, `sms`/`email`→`notifications`).
- **Resolucion de capacidades efectivas.** `resolveDoctorCapabilities` toma la ultima suscripcion del medico (refleja CANCELLED para la UI), y solo da derecho a las capacidades del plan cuando el estado es TRIAL o ACTIVE; PAST_DUE/PAUSED/CANCELLED gatean todo.
- **Ciclo de vida comercial.** `cancelSubscription`, `pauseSubscription`, `reactivateSubscription` y `changePlan`, cada uno con traza de auditoria. El plan por defecto (ESSENTIAL) se provisiona con todas las capacidades del MVP.
- **Gating por capacidad (`require-capability.ts`).** Helper `requireCapability(request, capability)` para route handlers: bloquea con 402 cuando el plan no incluye la capacidad o la suscripcion no esta activa. Aplicado al log de comunicaciones (`GET /api/admin/notifications`, capacidad `notifications`) como demostracion real.
- **Endpoints.** `GET /api/admin/subscription` (estado + capacidades efectivas), `POST /api/admin/subscription` (cancelar/pausar/reactivar/cambiar plan), `GET /api/admin/plans` (planes activos).

Clasificacion de datos: todo OPERATIVO (gobernanza comercial); sin contenido clinico en nube, logs ni trazas.

Verificacion (rebanada 1): 49 pruebas del portal en verde (+4: ciclo de vida y derecho por estado, estrechamiento de capacidades al cambiar de plan, rechazo de plan inexistente, gating 200/402/401), `eslint` limpio, `tsc` limpio y `next build` ok.

Entregado (rebanada 2 — 2FA + codigos de recuperacion, portal):

- **TOTP propio y auditable (`lib/security/totp.ts`).** HOTP/TOTP (RFC 4226/6238) sobre el `crypto` nativo de Node (SHA-1, 6 digitos, paso de 30s), sin dependencia nueva (regla 9). Validado contra los vectores de prueba publicados de ambos RFC.
- **Secreto cifrado en reposo (`lib/security/secret-box.ts`).** AES-256-GCM con llave derivada de `TWO_FACTOR_ENCRYPTION_KEY` (env nuevo). El secreto TOTP nunca se guarda en claro.
- **Modelos (migracion `two_factor_auth`).** `TwoFactorCredential` (uno por usuario, `enabled`/`confirmedAt`) y `TwoFactorRecoveryCode` (solo hash, un solo uso). Clase OPERATIVO; sin contenido clinico.
- **Servicio (`two-factor-service.ts`).** Enrolar (genera secreto + URI otpauth para QR), confirmar (verifica TOTP y emite 10 codigos de recuperacion una sola vez), verificar (TOTP o codigo de recuperacion que se consume), desactivar y regenerar codigos. Todo auditado.
- **Login en dos pasos.** Si el 2FA esta activo, `signInDoctor` no crea sesion: devuelve un desafio firmado (HMAC, 5 min). `completeTwoFactorLogin` valida el desafio y el segundo factor y crea la sesion. Endpoints `POST /api/auth/login/2fa`, `GET /api/auth/2fa`, `POST /api/auth/2fa/{setup,confirm,disable,recovery-codes}`.

Verificacion (rebanada 2): 60 pruebas del portal en verde (+11: vectores RFC de TOTP, roundtrip y deteccion de manipulacion del cifrado, enrolamiento/confirmacion, login que exige 2FA, codigo erroneo y desafio expirado/manipulado, recovery de un solo uso, desactivacion), `eslint`/`tsc` limpios, `env:check` valido y `next build` ok.

Entregado (rebanada 3 — compliance del portal: incidentes, exportacion de auditoria, retencion):

- **Registro de incidentes (migracion `security_incidents`).** `SecurityIncident` con categoria, severidad (`IncidentSeverity`), estado (`IncidentStatus`: OPEN/INVESTIGATING/RESOLVED), deteccion y resolucion. Clase OPERATIVO; prohibido contenido clinico (titulo/descripcion describen el evento y referencian IDs). Servicio con alta, listado y cambio de estado, aislado por medico, todo auditado.
- **Exportacion de auditoria.** `exportAuditLog` entrega las entradas del medico (como actor o sujeto) en un rango de fechas; el endpoint `GET /api/admin/audit/export` las descarga como JSON. Las entradas referencian IDs, nunca contenido clinico (regla 4), asi que la exportacion es segura. La propia exportacion queda auditada.
- **Resumen de retencion.** `getRetentionSummary` reporta las ventanas de retencion del portal (alineadas con la limpieza del piloto del paso 9) y los elementos purgables pendientes (buzon, holds y enlaces vencidos). Endpoint `GET /api/admin/retention`.
- **Endpoints.** `GET/POST /api/admin/incidents`, `PATCH /api/admin/incidents/[id]`, `GET /api/admin/audit/export`, `GET /api/admin/retention`.

Verificacion (rebanada 3): 64 pruebas del portal en verde (+4: ciclo de incidente con sello de resolucion, aislamiento por medico, exportacion de solo lo propio sin contenido clinico y por rango, resumen de retencion), `eslint`/`tsc` limpios y `next build` ok.

Entregado (rebanada 4 — derechos ARCO en la app del medico):

- **Residencia local.** Por decision del inventario funcional, el medico atiende ARCO desde su app porque el expediente clinico es suyo y reside en este equipo cifrado; la nube nunca tuvo el contenido clinico. Migracion SQLite v10 (`arco_requests`, clase OPERATIVO: solo metadatos de la gestion).
- **Acceso / portabilidad (`export_patient_data`).** Exporta todo el expediente del paciente (datos personales, encuentros, notas versionadas, recetas y metadatos de documentos) como JSON descargable.
- **Registro y seguimiento de solicitudes.** Acceso, rectificacion, cancelacion y oposicion; alta con validacion de tipo/paciente, listado, marcado de atendida; todo auditado en la bitacora local.
- **Cancelacion (borrado) gobernada (`fulfill_cancellation`).** En una transaccion elimina el expediente clinico (encuentros, notas, recetas, documentos, consentimientos y trazas de IA, precheckins) y seudonimiza la identidad del paciente, **preservando los registros contables** (cobros/recibos) por obligacion de retencion fiscal — esos solo guardan importes e IDs, sin datos personales.
- **UI y mock.** Pestaña "Privacidad (ARCO)" en el espacio de trabajo (registrar/listar solicitudes, exportar expediente, atender cancelacion con confirmacion); el mock de navegador simula el mismo comportamiento.

Verificacion (rebanada 4): 57 pruebas de Rust en verde (+5: exportacion completa, paciente inexistente, validacion de tipo/paciente, cancelacion que borra lo clinico y conserva lo contable, rechazo de cancelacion sobre solicitud que no es de cancelacion), `cargo clippy` sin warnings nuevos (los 9 restantes son de `operations.rs`, paso 10), `tsc + vite build` ok.

Con esto la compuerta de push del paso 12 queda cubierta: suscripcion gestionable y gating por capacidad, 2FA con codigos de recuperacion, registro de incidentes, exportacion de auditoria, resumen de retencion y derechos ARCO con residencia local. Pendiente futuro (no requerido por la compuerta): pasarela de pago real para cobro de la suscripcion (hoy el ciclo de vida es interno) y panel de administracion de planes con capacidades personalizadas.

## Paso 13 - Directorio y expediente longitudinal del paciente

| Campo | Definicion |
|---|---|
| Objetivo | Que el medico llegue a cualquier paciente sin depender de una cita y construya un expediente longitudinal: antecedentes, historial de consultas y una linea del tiempo clinica que pueda editar. |
| Requisitos relacionados | RF09, RF10, RF11, RNF05, RNF07 (extiende el paso 4) |
| Entrada necesaria | Atencion clinica integrada (paso 4) funcionando. |
| Skills IA recomendadas | `smart-explore`, `impeccable`, `coding-standards`, `superpowers:test-driven-development`, `superpowers:verification-before-completion` |
| Se construye | En la app del medico: directorio de pacientes (listar/buscar/alta), ficha del paciente y linea del tiempo de eventos clinicos relevantes (alta, baja y edicion). Todo persiste en la base local cifrada; nada de este paso toca la nube. |
| Se valida con | El medico busca un paciente, abre su expediente longitudinal, revisa antecedentes e historial, y agrega/edita/elimina eventos en la linea del tiempo. |
| Compuerta de avance | El directorio y la linea del tiempo solo leen y escriben en la base local; ningun dato clinico nuevo sale a la nube (regla de residencia 1). |
| Push recomendado | Hacer push cuando el directorio permita llegar a un paciente y la linea del tiempo sostenga el ciclo completo de eventos (alta/edicion/baja) con pruebas. |

Checklist de salida:

- Directorio de pacientes con busqueda por nombre/telefono.
- Alta manual de paciente que no llego por el portal.
- Ficha del paciente con antecedentes e historial de consultas.
- Linea del tiempo clinica por paciente, editable (anadir/modificar/eliminar).
- Auditoria local de los eventos de la linea del tiempo.
- Agenda y directorio independientes: importar un paciente desde una cita pasa por deteccion de duplicados antes de crear expediente.
- Agenda semanal por bloques (7 dias) con el tamano de bloque que el medico configuro; "Atender" abre el expediente del paciente, no una consulta.

Estado: ✅ DONE — rebanadas 1 (directorio), 2 (linea del tiempo), 3 (independencia agenda/directorio + anti-duplicados) y 4 (agenda semanal por bloques + "Atender" abre expediente) entregadas (2026-06-12/13). Construido sobre el paso 4.

Entregado (rebanada 1 — directorio de pacientes, 2026-06-12):

- **Acceso al paciente sin cita.** Hasta ahora solo se llegaba a un paciente desde una cita de la agenda o un walk-in de recepcion. Nueva pestana "Pacientes" en el espacio de trabajo con el directorio completo del expediente local.
- **Capa clinica (`clinical.rs`).** `list_patients` (filtro opcional por nombre o telefono, con recuento de consultas y fecha de ultima visita), `get_patient_profile` (datos del paciente + historial completo de encuentros), `create_patient` (alta manual con validacion de nombre y normalizacion de campos opcionales). Reutiliza `open_encounter_for_patient` para iniciar una consulta walk-in desde la ficha.
- **Comandos (`lib.rs`).** `list_patients`, `get_patient_profile`, `create_patient`, `open_patient_encounter`.
- **UI y mock (`Directorio.tsx`).** Lista con buscador en vivo, ficha del paciente (datos, alergias, antecedentes, historial e "Iniciar consulta") y formulario de alta; el mock de navegador simula el mismo comportamiento.

Verificacion (rebanada 1): pruebas de Rust en verde (+1: alta con recorte/normalizacion, rechazo de nombre vacio, busqueda por nombre y telefono, ficha con historial y paciente inexistente), `tsc + vite build` ok.

Entregado (rebanada 2 — linea del tiempo clinica editable, 2026-06-12):

- **Expediente longitudinal del paciente.** Nueva pagina (boton "Expediente" junto a "Iniciar consulta" en el directorio) con tres secciones en barra lateral: Antecedentes (lectura), Historial de consultas (lectura) y Linea del tiempo (edicion). El nombre del paciente queda fijo arriba.
- **Migracion SQLite v11 (`timeline_events`).** Eventos clinicos curados a mano por el medico (separados de las notas de consulta), con fecha clinica, categoria, titulo y detalle. CLINICO: viven solo en la base local cifrada; la nube no los conoce.
- **Capa clinica (`clinical.rs`).** `list_timeline_events` (orden por fecha clinica desc), `add_timeline_event`, `update_timeline_event` y `delete_timeline_event`, con validacion de titulo/fecha y de categoria contra una lista cerrada (NOTE, DIAGNOSIS, PROCEDURE, MEDICATION, LAB, ALERT, MILESTONE). Cada alta/edicion/baja queda auditada en la bitacora local.
- **Comandos (`lib.rs`).** `list_timeline_events`, `add_timeline_event`, `update_timeline_event`, `delete_timeline_event`.
- **UI y mock (`Expediente.tsx`).** Linea del tiempo con tarjetas por evento (fecha, categoria con color, titulo y detalle), alta/edicion en formulario y baja con confirmacion; el mock de navegador simula el mismo comportamiento.
- **Antecedentes editables desde el expediente.** La seccion Antecedentes del expediente longitudinal ahora se edita en sitio (alergias, antecedentes personales/familiares y fecha de nacimiento) reutilizando `update_patient_background`, sin necesidad de abrir una consulta.
- **Historial solo con contenido.** El historial (en el expediente y en la pantalla de consulta) y el recuento de consultas del directorio solo cuentan encuentros con algo escrito (al menos una version de nota); los encuentros abiertos y vacios ya no aparecen.
- **Reabrir consultas sin firmar.** Cada consulta del historial que sigue sin firmar muestra un boton "Abrir y firmar" que entra al encuentro para ver/editar lo escrito y cerrarlo; al volver se regresa al expediente.

Verificacion (rebanada 2): pruebas de Rust en verde (+2: linea del tiempo —alta con normalizacion de categoria/detalle, rechazo de titulo/fecha vacios y categoria invalida, paciente inexistente, orden por fecha, edicion y baja con NotFound; y exclusion de encuentros vacios del historial y del conteo, que aparecen al escribir la primera nota), `tsc + vite build` ok.

Entregado (rebanada 3 — independencia agenda/directorio + anti-duplicados, 2026-06-12):

- **La agenda deja de ser la fuente del expediente.** El portal no garantiza el mismo `patient_id` para la misma persona (muchos agendan sin cuenta y escriben sus datos distinto cada vez), y hay medicos que usan otra agenda. La cita ya no crea expediente en automatico: es solo una ayuda de horarios desde la que el medico **importa** al paciente.
- **Importacion con deteccion de duplicados (`attend_appointment`).** Al atender una cita, antes de crear expediente se buscan coincidencias en el directorio con los datos de la cita, **ponderando el nombre** por encima de telefono/correo (estos pueden ser de un tutor: ninos, adultos mayores). Si hay candidatos, se le muestran al medico con el motivo de cada coincidencia para que **vincule** al expediente correcto o confirme que es alguien nuevo. Sin coincidencias, importa y entra directo.
- **Vinculo recordado (migracion SQLite v12, `patient_links`).** Cuando el medico vincula el id del portal a un expediente local, se recuerda el mapeo: la proxima cita de la misma persona (mismo id de portal) se resuelve sola sin volver a preguntar. Al vincular se reapuntan tambien los documentos del buzon descargados bajo el id del portal.
- **Prevencion en el alta manual (`find_patient_matches`).** El alta manual del directorio tambien busca coincidencias antes de crear y, si las hay, ofrece abrir el expediente existente o crear de todos modos.
- **Recepcion cubierta tambien.** El walk-in (`register_walk_in` con `link_patient_id`/`force_new` + `register_walk_in_for_patient`) y el check-in de cita (`start_visit_encounter` ahora pasa por `attend_appointment`) corren la misma deteccion: antes de crear paciente, ofrecen vincular a un expediente existente. Al vincular, la visita y sus cobros quedan asociados al expediente correcto (`link_visit_encounter` sincroniza el `patient_id` de la visita con el del encuentro).
- **UI y mock.** Pantalla de identificacion de paciente compartida (`PatientResolution.tsx`) usada por la agenda y la recepcion (candidatos con motivo y boton de vincular / crear nuevo); aviso de duplicado en el alta manual; el mock de navegador simula el mismo comportamiento.

Verificacion (rebanada 3): pruebas de Rust en verde (+4: resolucion que detecta duplicado por nombre/telefono y vincula sin crear el id del portal, vinculo recordado que resuelve la segunda cita y reapertura idempotente; alta directa sin coincidencias preservando el id del portal; matcher por nombre/telefono/correo con sus razones; walk-in vinculado a un expediente existente que no crea paciente nuevo), `tsc + vite build` ok.

Entregado (rebanada 4 — agenda semanal por bloques + "Atender" abre expediente, 2026-06-13):

- **Agenda semanal por bloques (`WeekAgenda.tsx`).** La pestana Agenda deja de ser una lista plana: ahora es una rejilla de 7 columnas (lunes a domingo, con navegacion de semana y resaltado del dia de hoy). El bloque (slot) es la **duracion de cita que el medico configuro** en su cuenta (`consultationDuration` del perfil). Se listan como filas los bloques del **horario laboral del medico** (de su inicio mas temprano a su fin mas tardio entre las reglas de disponibilidad); los bloques **sin cita salen compactos** y los que **tienen cita a altura completa**. Si hay citas fuera del horario, el rango se extiende para no ocultarlas. Cada cita cae en la celda de su dia y bloque (varias en el mismo bloque/dia se apilan); encabezados de dia fijos y scroll vertical interno. Sin horario configurado se usa 8:00-20:00 por defecto.
- **Duracion de cita y horario laboral sincronizados (`sync.rs`, `lib.rs`).** Se traen del perfil del medico el perfil clinico, `consultationDuration` (guardado como `slot_minutes`) y la ventana de horario laboral derivada de `availabilityRules` (`work_start_minutes`/`work_end_minutes`, inicio mas temprano y fin mas tardio entre reglas activas). `sync_status` los expone al front (defaults en el front si faltan).
- **Refresco en cada sincronizacion (no solo al vincular).** Al vincular se leen de `/api/admin/profile` (sesion). En cada "Sincronizar", `sync_now` los vuelve a leer de un endpoint nuevo del portal **autenticado por device token** (`GET /api/sync/profile` → `getSyncDeviceProfile`), con el mismo shape `{ profile: { specialty, consultationDuration, availabilityRules } }` para reutilizar los mismos extractores (`profile_metadata_from_body`). Asi, si el medico cambia su duracion de cita u horario en el portal, la agenda se actualiza al siguiente sync sin re-vincular. El endpoint no expone contenido clinico.
- **"Atender" abre el expediente, no una consulta (`resolve_appointment_patient`).** El boton de la cita ya no inicia un encuentro: corre la misma deteccion anti-duplicados de la rebanada 3 pero su desenlace es el **expediente** del paciente. Si hay coincidencias, avisa al medico para que vincule al expediente previo o cree uno nuevo; sin coincidencias, importa los datos de la cita y abre el expediente. La consulta se inicia despues, desde el propio expediente (`open_encounter_*`). Se reutiliza el helper nuevo `import_appointment_patient` (extraido de `open_encounter_for_appointment`) y la pantalla compartida `PatientResolution`.

Verificacion (rebanada 4): pruebas de Rust en verde (+4: `resolve_appointment_patient` avisa del duplicado y vincula sin abrir encuentro ni crear el id del portal, vinculo recordado que resuelve la segunda cita, e importacion directa con y sin coincidencias —`force_new`— siempre con cero encuentros para la cita; extraccion de `consultationDuration` del perfil con caso ausente/no positivo; ventana de horario laboral tomando el inicio mas temprano y fin mas tardio entre reglas activas; composicion de metadatos del perfil) mas prueba de integracion del portal (`getSyncDeviceProfile` expone especialidad, duracion y horario activo al dispositivo), `cargo clippy` sin nuevas advertencias, `eslint`/`tsc` del portal limpios, `tsc + vite build` del escritorio ok y prueba manual en navegador (agenda semanal con los bloques del horario laboral 09:00-13:30, filas vacias compactas y con cita a altura completa, columnas alineadas; "Atender" sobre paciente con coincidencia → resolucion → "Usar este expediente" abre el expediente sin iniciar consulta).

Con esto la compuerta de push del paso 13 queda cubierta: directorio para llegar a cualquier paciente sin cita, expediente longitudinal con linea del tiempo editable, y agenda semanal independiente del expediente con importacion anti-duplicados que abre el expediente del paciente — todo en la base local cifrada sin enviar datos clinicos a la nube.

## Paso 14 - Seguridad de medicacion determinista (sin IA)

| Campo | Definicion |
|---|---|
| Objetivo | Resolver con datos deterministas y auditables —no con IA generativa— la seguridad de la prescripcion: interacciones farmaco-farmaco, alergias cruzadas, duplicidad terapeutica y referencia de dosis/etiqueta. Reduce la dependencia de IA y elimina alucinaciones en lo critico (doc 11). |
| Requisitos relacionados | Extiende receta (pasos 4 y 5); RNF05 (seguridad clinica). |
| Entrada necesaria | Receta y expediente (pasos 4 y 5) funcionando. |
| Skills IA recomendadas | `smart-explore`, `coding-standards`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `codex-security:security-scan` |
| Se construye | En la app del medico: normalizacion de farmacos a RxCUI (RxNorm), verificador de interacciones (DDInter local + openFDA como respaldo de texto), alerta de alergia cruzada contra el expediente y duplicidad terapeutica por clase (RxClass), con referencia de etiqueta/dosis. Base de farmacos/interacciones empaquetada o descargable y versionada localmente; la prescripcion del paciente nunca sale del equipo. |
| Se valida con | Al prescribir, el sistema marca interacciones con severidad, alergias en conflicto y duplicidades, **citando la fuente**; el medico decide. Funciona offline con la base local. |
| Compuerta de avance | Ninguna verificacion de seguridad depende de IA; cada alerta cita una fuente determinista y trazable; la prescripcion no sale del equipo (regla de residencia 1). |
| Push recomendado | Hacer push cuando interacciones, alergias cruzadas y duplicidad funcionen offline con fuente citada, version de base visible y pruebas. |

Checklist de salida:

- Normalizacion de farmacos a RxCUI (RxNorm).
- Interacciones farmaco-farmaco con severidad (DDInter); respaldo de texto (openFDA).
- Alerta de alergia cruzada contra las alergias del expediente.
- Deteccion de duplicidad terapeutica por clase (RxClass).
- Base de interacciones versionada localmente y actualizable, con aviso de version.
- Auditoria local de cada alerta mostrada u omitida.

Clasificacion de datos: la base de farmacos/interacciones es REFERENCIA publica (no PHI); las verificaciones corren localmente sobre datos CLINICO (la prescripcion). Nada sale a la nube.

> Nota: la API de interacciones de la NLM/RxNav fue descontinuada en enero 2024; por eso la fuente de interacciones es DDInter (descargable) + openFDA. RxNorm/RxClass siguen vigentes (doc 11).

Estado: ✅ DONE — rebanadas 1 (motor determinista + dataset sembrado), 2 (importacion de datos reales + extraccion desde la receta), 3 (pipeline de actualizacion desde fuentes oficiales con vetting), 4 (respaldo de openFDA) y 5 (catalogo curado empaquetado + experiencia sin URLs para el medico) entregadas (2026-06-13/14). Construido sobre el paso 4.

Entregado (rebanada 1 — motor determinista de seguridad con dataset sembrado, 2026-06-13):

- **Motor de verificacion local (`medication.rs`).** `check_prescription` toma la lista de medicamentos y las alergias del expediente y devuelve un reporte determinista: interacciones farmaco-farmaco con severidad (CONTRAINDICATED/MAJOR/MODERATE/MINOR), alergias cruzadas (por nombre o por clase terapeutica) y duplicidad terapeutica (misma clase). Cada alerta cita su fuente y version de base. Sin IA.
- **Base de referencia sembrada (migracion v13).** `medication_reference` (farmaco → ingrediente, nombre y clase) y `drug_interactions` (pares de ingredientes en orden canonico, con severidad/descripcion/fuente). Clase REFERENCIA: conocimiento clinico publico empaquetado, no PHI. Conjunto representativo de interacciones clinicas conocidas (AINE+warfarina, IECA+ahorrador de potasio, nitrato+sildenafil, macrolido+estatina, ISRS+tramadol, AINE+litio) y clases para duplicidad/alergia cruzada.
- **Normalizacion y orden independiente.** El nombre escrito se normaliza (minusculas, espacios) y se busca en la base; los no reconocidos se reportan para revision (no se verifica lo que no se conoce). La interaccion se encuentra sin importar el orden en que se escribieron los farmacos (par canonico).
- **Residencia y auditoria.** La prescripcion no sale del equipo; la bitacora local registra solo la cantidad de alertas y el id del encuentro (nunca nombres de farmacos ni contenido clinico, REGLA §4).
- **Comando y UI.** `check_medication_safety(encounter_id, medications)` toma las alergias del paciente del encuentro. Panel "Seguridad de la prescripcion" en la seccion Receta de la consulta: lista de medicamentos, alertas por severidad con color y fuente, no reconocidos y version de base. El mock de navegador espeja el motor.

Verificacion (rebanada 1): 91 pruebas de Rust en verde (+10: reconoce farmaco sembrado y marca desconocido, interaccion MAJOR con fuente e independiente del orden, contraindicada, alergia cruzada por clase, duplicidad por clase, combinacion segura sin alertas, lista vacia rechazada, auditoria sin contenido clinico, pares puros y match de alergia), `cargo clippy` sin advertencias nuevas, `tsc + vite build` ok y prueba en navegador (Ibuprofeno+Warfarina → interaccion Grave con fuente; Amoxicilina en paciente alergico a Penicilina → alerta de alergia por clase).

Entregado (rebanada 2 — importacion de datos reales + extraccion desde la receta, 2026-06-13):

- **Parsers de formatos reales (`medication.rs`).** `parse_medication_csv` (columnas `name,ingredient,display_name,drug_class`, derivable de exportaciones de RxNorm/RxClass) y `parse_ddinter_csv` (columnas de DDInter `DDInterID_A,Drug_A,DDInterID_B,Drug_B,Level`, mapeando el nivel a severidad y guardando el par de ingredientes en orden canonico). Puros y testeables sin red.
- **Importador transaccional con versionado (`import_reference`).** Reemplaza la base de referencia local dentro de una transaccion (no la deja a medio cargar), bumpea `medication_reference_version` y devuelve un resumen (medicamentos/interacciones/version). Una lista vacia deja esa tabla sin cambios. Tras importar, la verificacion usa de inmediato los datos nuevos.
- **Extraccion desde la receta (`extract_medications`).** Reconoce los farmacos en el texto libre de la receta respetando limites de palabra (no confunde fragmentos) y sin duplicar, en el orden en que aparecen, para que el medico no tenga que reescribir la lista.
- **Comandos y UI.** `medication_reference_status`, `import_medication_reference` y `extract_prescription_medications`. Nueva pestana "Medicamentos" para ver la version/cantidades e importar CSV (medicamentos + DDInter); boton "Tomar de la receta" en el panel de seguridad que prellena la lista desde el texto de la receta. Mock de navegador espeja todo.
- **Residencia.** La base es REFERENCIA publica (no PHI) y vive cifrada en el equipo; la importacion no usa la red (el CSV lo aporta el medico/instalador). Nada clinico sale a la nube.

Verificacion (rebanada 2): 97 pruebas de Rust en verde (+6: parseo de CSV de medicamentos con encabezado y clase opcional, parseo de DDInter con mapeo de severidad y orden canonico, importacion que reemplaza la base y bumpea la version —y deja de reconocer lo sembrado—, rechazo de version vacia, extraccion en orden y con limites de palabra/dedupe), `cargo clippy` sin advertencias nuevas, `tsc + vite build` ok y prueba en navegador (importar Metoprolol/Verapamilo + interaccion DDInter → base actualizada a `ddinter-2026-06 · 2 · 1`).

Entregado (rebanada 3 — pipeline de actualizacion desde fuentes oficiales, 2026-06-14):

- **El servicio externo regenera la base, no atiende cada receta.** Por la promesa local-first, consultar una API por prescripcion filtraria contenido clinico (los farmacos del paciente) a un tercero. La arquitectura correcta —y la que usan los sistemas clinicos serios— es un ETL: el servicio externo se contacta para **descargar y regenerar** la base local; la verificacion de cada receta sigue siendo local (microsegundos, offline, privada, auditable).
- **Orquestador con vetting (`update_reference`).** Parsea los CSV descargados (reusa los parsers de la rebanada 2), **vetta** (rechaza fuentes vacias o sospechosamente pequenas para que una descarga truncada no degrade una base buena) y solo entonces importa de forma transaccional con su version. Nucleo testeable sin red.
- **Frontera de red fina (`update_medication_reference`, `fetch_text`).** Descarga los CSV por HTTP (reqwest) antes de tomar el lock; no retiene el lock durante ningun await. El contrato real con las fuentes se verifica en staging (regla 5); el orquestador se prueba contra datasets en memoria, incluido el rechazo por vetting.
- **Residencia.** Solo se descargan datos de REFERENCIA publica; no se envia ningun dato del paciente. La base vive cifrada en el equipo.
- **UI y mock.** Seccion "Actualizar desde fuentes oficiales" en la pestana Medicamentos (URLs de los CSV + version, con version por fecha si se deja vacia); el mock de navegador simula una descarga a escala realista de DDInter.

Verificacion (rebanada 3): 100 pruebas de Rust en verde (+3: actualizacion sana que versiona, rechazo de dataset sospechosamente pequeno que deja la base intacta, rechazo de fuente vacia), `cargo clippy` sin advertencias nuevas, `tsc + vite build` ok y prueba en navegador (actualizar desde URLs → base a `oficial-2026-06-14 · 1287 · 3402`).

Entregado (rebanada 4 — respaldo de openFDA, 2026-06-14):

- **Texto de etiqueta FDA como respaldo (`drug_label_text`, migracion v14).** Cuando no hay una interaccion **estructurada** (DDInter/sembrada) para un par de farmacos prescritos, pero la etiqueta FDA de uno menciona al otro, se ofrece ese texto como **evidencia informativa** (no como alerta dura). Clase REFERENCIA publica; una fila por ingrediente.
- **Parser de openFDA (`parse_openfda_labels`).** Extrae de la API drug/label, por `openfda.generic_name`, el texto de `drug_interactions`. Tolerante a campos ausentes; omite etiquetas sin texto. Puro y testeable.
- **Integracion en la verificacion.** `check_prescription` rastrea los pares con interaccion estructurada y, solo para los pares **sin** una, busca el respaldo de etiqueta (`label_fallback`). Las notas de etiqueta no cuentan como `has_alerts`.
- **Wiring en ambos pipelines.** Tanto el import manual (`import_medication_reference`) como la actualizacion desde fuentes (`update_medication_reference`, con `openfda_json`/`openfda_url`) cargan el texto de etiquetas; `reference_status` reporta el conteo de etiquetas.
- **UI y mock.** La pestana Medicamentos muestra el conteo de etiquetas, acepta JSON/URL de openFDA en import/actualizacion; el panel de seguridad muestra las notas de etiqueta (azul informativo, distintas de las alertas). El mock de navegador espeja el respaldo.

Verificacion (rebanada 4): 103 pruebas de Rust en verde (+3: parseo de openFDA que omite etiquetas vacias, nota de etiqueta solo cuando no hay par estructurado y la etiqueta menciona al otro, interaccion estructurada que suprime la nota de etiqueta), `cargo clippy` sin advertencias nuevas, `tsc + vite build` ok y prueba en navegador (importar etiqueta de paracetamol → Paracetamol+Warfarina muestra "Posible interaccion segun etiqueta" con fuente openFDA).

Entregado (rebanada 5 — catalogo MiDoc empaquetado y actualizacion sin URLs, 2026-06-14):

- **Catalogo real inicial empaquetado.** La app incluye un dataset MiDoc de REFERENCIA publica (`reference_data/medications.csv`, `ddinter.csv`, `openfda.json`, `manifest.json`) generado desde fuentes externas: DDInter descargable, openFDA y una lista curada de medicamentos/alias frecuentes. Version `midoc-real-2026-06-14`: 173 filas de medicamentos/alias, 1060 interacciones DDInter filtradas y 64 etiquetas openFDA. Si no hay endpoints fijos configurados en el build, el boton instala/actualiza desde ese catalogo local sin depender de red.
- **Mapeo de nombres comerciales.** El catalogo incluye alias comerciales como filas de `medication_reference` que apuntan al ingrediente canonico usado por DDInter/openFDA (ej. Tylenol/Tempra/acetaminofen → acetaminophen, Coumadin/Jantoven/warfarina → warfarin, Advil/Motrin/ibuprofeno → ibuprofen). La verificacion sigue usando ingredientes canonicos.
- **Actualizacion de producto sin URLs.** Nuevo comando `update_medication_reference_from_midoc`: usa endpoints fijos de build (`MIDOC_MEDICATIONS_URL`, `MIDOC_DDINTER_URL`, `MIDOC_OPENFDA_URL`) cuando existan, o el catalogo empaquetado como fallback offline. El medico ya no escribe URLs.
- **Instalacion automatica en el primer arranque.** Al desbloquear la base, si sigue en la version sembrada (`seed-v1`), se instala el catalogo real empaquetado (`ensure_bundled_reference_installed`). Es idempotente y no pisa una base ya importada/actualizada por el medico; un fallo no bloquea el acceso al expediente (la base sembrada sigue siendo usable). Asi el medico arranca con el catalogo real sin pulsar nada.
- **UI.** La pestana Medicamentos muestra un boton unico "Buscar actualizaciones"; la importacion manual queda como bloque tecnico colapsado.

Verificacion (rebanada 5): 3 pruebas Python del generador en verde, 107 pruebas de Rust en verde (catalogo empaquetado instalable sin red, alias comercial Tylenol → acetaminophen con interaccion DDInter real contra warfarin, instalacion automatica en el primer arranque e idempotencia que respeta una base importada por el medico), 1 E2E ignorada porque requiere portal vivo, `cargo clippy --lib` sin warnings nuevos (persisten los 2 preexistentes de `clinical.rs` y `WalkInOutcome`), `tsc + vite build` ok, y prueba en navegador (al desbloquear, la base ya es `midoc-real-2026-06-14`; Medicamentos → Buscar actualizaciones sin inputs de URL y sin errores de consola).

Con esto la compuerta de push del paso 14 queda cubierta: verificacion determinista con severidad y fuente citada, importacion y actualizacion versionada de datos reales con vetting, extraccion desde la receta, respaldo de openFDA, alias de nombres comerciales y catalogo curado empaquetado — todo local, sin enviar datos del paciente a la nube.

## Paso 15 - Transcripcion local real (Whisper) y descarga de modelo

| Campo | Definicion |
|---|---|
| Objetivo | Sustituir el proveedor fake de transcripcion por Whisper corriendo en el equipo del medico, con descarga gestionada del modelo recomendado, y dejar la nube (AssemblyAI/Deepgram) como respaldo con consentimiento. |
| Requisitos relacionados | RF40, RNF15 (extiende el paso 11). |
| Entrada necesaria | Transcripcion gobernada con fake (paso 11 rebanada 6) y recomendacion de modelo segun hardware (paso 11 rebanada 7). |
| Skills IA recomendadas | `smart-explore`, `coding-standards`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion` |
| Se construye | Integracion de whisper.cpp (binding o binario empaquetado) y `WhisperLocalProvider` que implementa el trait `TranscriptionProvider` ya existente; gestor de descarga del modelo recomendado (checksum, progreso, reanudacion, validacion de espacio en disco) hacia `app_data_dir`; conexion del audio real al provider; adaptador de respaldo en nube con consentimiento de voz y seudonimizacion. |
| Se valida con | El medico descarga el modelo sugerido, graba una consulta y obtiene la transcripcion **offline**; ante equipo insuficiente puede usar la nube con consentimiento. El audio sigue siendo transitorio (no se persiste). |
| Compuerta de avance | La transcripcion corre offline por defecto; el audio no se persiste; el envio a nube exige consentimiento de voz vigente y datos seudonimizados; licencias compatibles con distribucion comercial (whisper.cpp es MIT). |
| Push recomendado | Hacer push cuando la transcripcion local real funcione de inicio a fin con descarga de modelo verificada y respaldo en nube gobernado, con pruebas. |

Checklist de salida:

- Binding/binario de whisper.cpp empaquetado, con licencia verificada.
- Gestor de descarga: checksum, progreso, reanudacion y validacion de espacio.
- `WhisperLocalProvider` cableado al flujo de audio real (reemplaza al fake).
- Respaldo en nube (AssemblyAI/Deepgram) con consentimiento y seudonimizacion.
- Pruebas: descarga interrumpida y checksum invalido, provider real contra fakes del contrato, audio no persistido.

## Paso 16 - Proveedores de IA reales en staging (BAA)

| Campo | Definicion |
|---|---|
| Objetivo | Cablear los proveedores reales de LLM y transcripcion en staging bajo BAA/contrato, manteniendo intacta la gobernanza local (consentimiento, seudonimizacion, trazas, control de costo, fallback y revision humana). |
| Requisitos relacionados | RF41, RNF15. |
| Entrada necesaria | Capa multi-proveedor y benchmark (paso 11); seguridad de medicacion (paso 14), para no delegar lo critico a IA. |
| Skills IA recomendadas | `superpowers:writing-plans`, `coding-standards`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `codex-security:security-scan` |
| Se construye | Adaptadores reales: LLM base **Gemini 3 Flash** con fallback (Gemini 3.1 Pro / GPT-5.5) para SOAP, resumen, instrucciones y documentacion; configuracion de costo real por proveedor; benchmark con casos representativos autorizados o simulados para confirmar la eleccion. Solo en staging con BAA; nunca en local sin acuerdo (regla 4). |
| Se valida con | El benchmark compara los proveedores reales por calidad/costo/latencia/cumplimiento y documenta la decision; las salidas siguen siendo borrador con revision humana. |
| Compuerta de avance | No se envia PHI a ningun proveedor sin BAA/contrato y seudonimizacion; la seleccion se hace con evidencia propia, no por marketing del proveedor (RNF15). |
| Push recomendado | Hacer push cuando los adaptadores reales pasen el contrato contra fakes, el benchmark documente la decision y la gobernanza siga intacta. |

Decision de base (2026-06-13, doc 11): Gemini 3 Flash como base por costo; los LLM generalistas superan a las herramientas clinicas especializadas en benchmark (Nature Medicine 2026), por lo que MedLM/HealthScribe quedan descartados para el MVP. GPT-5.5 / Gemini Pro / Opus se reservan como fallback de seguridad para casos delicados.

## Paso 17 - Produccion: notificaciones y pago reales

| Campo | Definicion |
|---|---|
| Objetivo | Reemplazar los proveedores fake de notificaciones por los reales decididos y habilitar el cobro de la suscripcion. |
| Requisitos relacionados | RF21, RF28, RF31. |
| Entrada necesaria | Comunicaciones (paso 7) y SaaS/suscripcion (paso 12), hoy con fakes y ciclo de vida interno. |
| Skills IA recomendadas | `coding-standards`, `superpowers:test-driven-development`, `codex-security:security-scan`, `analytics` |
| Se construye | En el portal: adaptador real de SMS (**Twilio**) con enlaces cortos y dominio propio; adaptador real de correo (**Resend**) con SPF, DKIM y DMARC; pasarela de pago real para la suscripcion y panel de administracion de planes. |
| Se valida con | Un mensaje real llega por SMS y por correo desde dominios propios; un cliente paga la suscripcion y el gating por capacidad refleja el estado real del pago. |
| Compuerta de avance | Solo nombre, contacto y datos de cita salen a los proveedores de notificacion (regla 4); secretos en boveda; sin contenido clinico en mensajes, logs ni telemetria. |
| Push recomendado | Hacer push cuando SMS y correo reales entreguen desde dominios propios y el cobro de la suscripcion opere con gating real, con pruebas contra fakes del contrato. |

Decisiones (2026-06-13, doc 08): SMS = Twilio, correo = Resend. La pasarela de pago concreta queda por elegir (candidatos: Stripe, Mercado Pago).

## Paso 18 - Agendado con responsable/tutor

| Campo | Definicion |
|---|---|
| Objetivo | Que el agendado distinga explicitamente "agendo para mi" de "agendo para otra persona / un menor a mi cargo", capturando al responsable (tutor) como entidad propia, sin mezclar su contacto con la identidad del paciente. Extiende los pasos 3 (agenda publica) y 6 (paciente). |
| Requisitos relacionados | RF09, RF10 (extiende pasos 3 y 6). |
| Entrada necesaria | Agenda publica (paso 3) y deteccion anti-duplicados (paso 13) funcionando. |
| Skills IA recomendadas | `smart-explore`, `coding-standards`, `superpowers:test-driven-development`, `superpowers:verification-before-completion` |
| Se construye | Selector "para mi / para otra persona" en el formulario de agendado; bloque del responsable (nombre, parentesco, telefono, correo) y fecha de nacimiento del paciente; persistencia del responsable como `PatientContact`; el responsable viaja por sync a la app del medico, que lo muestra. La identidad del paciente nunca se confunde con la del tutor. |
| Se valida con | Agendar para un menor con datos del tutor crea un expediente con el nombre del menor y un responsable asociado; la confirmacion y la app del medico muestran al paciente y, aparte, a su responsable. |
| Compuerta de avance | El correo/telefono del tutor no se asignan a la identidad del paciente; el responsable es CONTACTO (nube minima), nunca contenido clinico; el anti-duplicados sigue pesando el nombre por encima del contacto. |
| Push recomendado | Hacer push cuando el formulario distinga ambos casos, el responsable se persista sin duplicar y la app del medico lo muestre, con pruebas. |

Antecedente: el agendado publico reutilizaba un expediente por correo/telefono sin exigir el nombre, por lo que al agendar para un hijo con el contacto del tutor la confirmacion mostraba al tutor. El fix (`fix: agendar con el contacto de un tutor ya no devuelve al paciente del tutor`, 2026-06-14) corrigio el match (exige nombre) y dejo de asignar el correo del tutor al paciente; este paso lo formaliza capturando al responsable como entidad propia.

Decisiones (2026-06-14): el caso se dispara por **toggle explicito** del que agenda, reforzado por la **fecha de nacimiento** (si es menor, el responsable es obligatorio). Se captura la fecha de nacimiento del paciente en el formulario.

Rebanadas:

- **Rebanada 1 (portal):** toggle + datos del responsable + fecha de nacimiento; `PatientContact` idempotente; notificaciones al responsable cuando el paciente no tiene contacto propio. Pruebas de integracion (para mi / para otra persona).
- **Rebanada 2 (app del medico):** el responsable viaja por sync, migracion local y se muestra en la cita y el expediente.
- **Rebanada 3 (refinamiento):** menor por fecha de nacimiento exige responsable; etiqueta "menor con tutor"; consideraciones ARCO (quien ejerce los derechos del menor).

Estado: ✅ DONE — rebanadas 1 (portal), 2 (app del medico) y 3 (refinamiento de menores) entregadas (2026-06-14). Construido sobre los pasos 3, 6 y 13.

Entregado (rebanada 1 — portal: distinguir paciente con/sin responsable, 2026-06-14):

- **Selector en el formulario (`booking-client.tsx`).** "Para mi" vs "Para otra persona / un menor". En el segundo caso se piden los datos del paciente (con **fecha de nacimiento**) y un bloque separado del **responsable** (nombre, parentesco, telefono, correo).
- **El responsable es entidad propia (`PatientContact`).** Viaja como `contact` y se guarda como contacto primario del paciente, idempotente: reagendar para el mismo paciente actualiza al responsable en vez de duplicarlo. Su contacto no se mezcla con la identidad del paciente.
- **Reutilizacion correcta para menores.** `findOrCreatePatient` confirma identidad por NOMBRE + contacto, donde el contacto puede ser el propio del paciente o el del responsable; asi un menor sin contacto propio se reconoce por su responsable y no se duplica.
- **Notificaciones al responsable.** Cuando el paciente no tiene contacto propio, las notificaciones (y el evento de sync) usan el contacto del responsable.
- **Residencia.** El responsable es CONTACTO (nube minima), nunca contenido clinico.

Verificacion (rebanada 1): 8 pruebas de integracion de agendado en verde (incluye: agendar para un menor crea al menor con su fecha de nacimiento y un responsable primario; reagendar actualiza al responsable sin duplicar; un nombre distinto con el contacto del tutor sigue siendo paciente nuevo), `tsc`/`eslint` limpios y `next build` ok.

Entregado (rebanada 2 — app del medico: el responsable viaja por sync y se conserva en el expediente, 2026-06-14):

- **El responsable viaja en el evento de sync (`public-booking-service.ts` → `APPOINTMENT_BOOKED`).** El payload lleva un objeto `responsible` (nombre, parentesco, telefono, correo) aparte del paciente, mas la `birthDate` del paciente. El responsable es CONTACTO; nunca contenido clinico.
- **Migracion local v15 (`db.rs`).** Columnas nuevas en `appointments` (`patient_birth_date`, `guardian_*`) y en `patients` (`guardian_*`); forward-compatible. La aplicacion del evento (`sync.rs`) las persiste y, al reagendar, conserva el responsable con `COALESCE`.
- **Se conserva en el expediente como entidad propia (`clinical.rs`).** Al importar al paciente desde una cita (`import_appointment_patient`), el responsable y la fecha de nacimiento pasan al expediente. `PatientRecord` expone `guardian: Option<Guardian>`. La identidad del paciente nunca se confunde con la del tutor.
- **Se muestra en el expediente (`Expediente.tsx`).** El banner del paciente muestra "Responsable: Nombre (parentesco) · contacto" cuando existe.

Verificacion (rebanada 2): 109 pruebas de Rust en verde (+2: el agendado de un menor lleva al responsable como entidad propia con la identidad del menor; la importacion desde la cita conserva responsable y fecha de nacimiento en el expediente), `cargo clippy` sin advertencias nuevas, `tsc + vite build` del escritorio ok; 8 pruebas de integracion del portal en verde (la nueva asercion comprueba que `APPOINTMENT_BOOKED` lleva `responsible` y `birthDate`), `eslint`/`tsc` del portal limpios y `next build` ok.

Entregado (rebanada 3 — refinamiento de menores y ARCO, 2026-06-14):

- **Menor exige responsable en el servidor (`public-booking-service.ts`).** `isMinor` deriva la edad de la fecha de nacimiento (mayoria de edad 18); si el paciente es menor y no llega responsable, el agendado se rechaza con 400 — la compuerta ya no depende solo del formulario. La validacion ocurre antes de consumir el hold.
- **Etiqueta "menor con tutor" en el expediente (`clinical.rs` + `Expediente.tsx`).** `PatientRecord` expone `is_minor` derivado de la fecha de nacimiento (helper `is_minor`/`age_years` con chrono); el banner muestra una pildora "Menor con tutor".
- **Consideraciones ARCO (`arco.rs`).** La exportacion del expediente incluye al responsable (`guardian`), la marca `is_minor` y una nota explicita `rights_exercised_by` que documenta quien ejerce los derechos ARCO de un menor (su responsable, con parentesco), o advierte si falta.

Verificacion (rebanada 3): 112 pruebas de Rust en verde (+3: derivacion de menor por fecha de nacimiento con su limite a los 18 y fechas invalidas; exportacion ARCO de un menor documenta a su responsable; exportacion de un adulto sin nota de menor), `cargo clippy` sin advertencias nuevas, `tsc + vite build` del escritorio ok; 8 pruebas de integracion del portal en verde (la nueva asercion rechaza agendar a un menor sin responsable y luego agenda con el), `eslint`/`tsc` del portal limpios y `next build` ok.

## Paso 19 - Pulido del flujo publico, preconsulta y sincronizacion

| Campo | Definicion |
|---|---|
| Objetivo | Cerrar los huecos de usabilidad y confianza detectados en el piloto del flujo publico (perfil, agenda, agendado), incorporar la preconsulta diferida con bifurcacion antecedentes / guiada por IA, el recordatorio de cita con cancelacion, y dar a la app del medico sincronizacion automatica con aviso de cambios pendientes. Extiende los pasos 2, 3, 6, 7 y 11. |
| Requisitos relacionados | RF03, RF04, RF05, RF08, RF13, RF16, RF21, RF39, RF40, RNF03, RNF04, RNF05, RNF15 (extiende pasos 2, 3, 6, 7 y 11). |
| Entrada necesaria | Perfil y disponibilidad (paso 2), agenda publica con hold (paso 3), paciente/precheckin y buzon cifrado (paso 6), comunicaciones (paso 7), IA gobernada con consentimiento/seudonimizacion/trazas (paso 11) y sincronizacion app <-> portal funcionando. |
| Skills IA recomendadas | `smart-explore`, `impeccable`, `ui-ux-pro-max`, `coding-standards`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `codex-security:security-scan` |
| Se construye | Portal: correccion de la foto de perfil recortada por el banner y del mapa de ubicacion (manejo de la API key de Google Maps con fallback); calendario de agenda que solo permite dias con disponibilidad real; carga automatica de horarios al elegir dia (sin boton "Buscar horarios"); hold que no bloquea al mismo paciente al cambiar de horario dentro de su sesion; validacion de telefono (10 digitos + clave de pais autodetectada y editable); preconsulta diferida tras un aviso con boton "Contestar", con bifurcacion "primera visita -> formulario de antecedentes" vs "ya contesto antes -> preconsulta guiada por IA"; reagendado con el mismo selector de calendario del agendado inicial; recordatorio SMS/correo 24 h antes con enlace corto de cancelacion. App del medico: sincronizacion automatica al abrir y badge rojo en el boton "Sincronizar" cuando hay cambios pendientes. |
| Se valida con | Un paciente ve el perfil con la foto y el mapa correctos; solo puede elegir dias con horarios; al elegir un dia los horarios cargan solos y puede cambiar de horario sin que se le bloqueen los de su propia sesion; captura un telefono valido con su clave de pais; tras confirmar la cita decide contestar la preconsulta, responde la bifurcacion y completa antecedentes (mismo formulario del medico) o la preconsulta guiada por IA (maximo 5 preguntas adaptativas); recibe un recordatorio 24 h antes con link para cancelar; el medico abre su app y se sincroniza solo, con aviso visible cuando hay cambios pendientes. |
| Compuerta de avance | La preconsulta y los antecedentes son contenido CLINICO: viajan por el buzon temporal cifrado E2E y la nube nunca los persiste ni los lee en claro; la IA de preconsulta corre bajo consentimiento, seudonimizada, sin persistir contenido ni en logs/telemetria (regla 4), con proveedor real solo en staging con BAA (paso 16). Solo nombre, contacto y datos de cita salen al proveedor de notificaciones. La residencia clinica sigue siendo la app local. |
| Push recomendado | Hacer push por rebanada cerrada y verificada; cada correccion del flujo publico es independiente y se puede integrar por separado. |

Checklist de salida:

- Foto de perfil sin recorte por el banner y mapa de ubicacion funcional (con fallback claro si falta/expira la API key).
- Calendario de agenda que deshabilita los dias sin disponibilidad real del medico.
- Carga automatica de horarios al seleccionar un dia (sin boton "Buscar horarios").
- El hold de 10 min no bloquea al mismo paciente al navegar entre horarios de su propia sesion.
- Validacion de telefono: 10 digitos + clave de pais autodetectada y editable.
- Preconsulta diferida tras aviso y boton "Contestar", con bifurcacion antecedentes / guiada por IA.
- Formulario de antecedentes identico al que el medico llena/consulta en su desktop app.
- Preconsulta guiada por IA: maximo 5 preguntas adaptativas, sin repetir, lenguaje de paciente, arranque desde el motivo de consulta.
- Reagendado con el mismo selector de calendario del agendado inicial.
- Recordatorio 24 h antes (SMS/correo) con enlace corto de cancelacion.
- App del medico: sincronizacion automatica al abrir y badge de cambios pendientes en "Sincronizar".

Clasificacion de datos: perfil/mapa/agenda/telefono son OPERATIVO/publico o CONTACTO (no PHI). Preconsulta y antecedentes son CLINICO transitorio en buzon cifrado E2E. El recordatorio solo lleva nombre, contacto y datos de cita. Nada clinico se persiste en la nube, logs ni telemetria.

Rebanadas:

- **Rebanada 1 (portal, UI) — Perfil publico: foto y ubicacion.** Corregir el recorte de la foto por el banner (CSS/layout del encabezado) y el mapa: validar y configurar la API key de Google Maps, con estado de fallback legible (direccion + enlace) cuando falte o sea invalida en vez del error crudo.
- **Rebanada 2 (portal) — Calendario fiel a la disponibilidad.** El selector de fecha solo habilita dias con horarios reales segun las reglas de disponibilidad y excepciones del medico; los dias sin cupo se muestran deshabilitados (no clickeables), no como disponibles vacios.
- **Rebanada 3 (portal) — Carga automatica de horarios + hold por sesion.** Cargar los horarios al seleccionar un dia (eliminar la friccion de "Buscar horarios"); el hold temporal no debe bloquear al mismo paciente al cambiar de horario dentro de su sesion (liberar/transferir el hold previo de la misma sesion antes de tomar el nuevo).
- **Rebanada 4 (portal) — Validacion de telefono internacional.** Campo de telefono con 10 digitos validados, clave de pais autodetectada (por defecto Mexico/locale) y editable. CONTACTO; sin PHI.
- **Rebanada 5 (portal) — Reagendado con el mismo calendario.** Al cambiar de horario de una cita existente, reutilizar el mismo componente de calendario/horarios del agendado inicial en vez del input nativo `dd/mm/aaaa`.
- **Rebanada 6 (portal) — Preconsulta diferida con bifurcacion.** Tras confirmar la cita, no mostrar el formulario de inicio: mostrar el aviso "Para agilizar la consulta con su medico, ayudenos contestando este formulario pre-consulta" con boton "Contestar". Al contestar, primera pregunta: "Es su primera visita con este medico o ha contestado antes el formulario de antecedentes?" que bifurca el flujo.
- **Rebanada 7 (portal + buzon) — Formulario de antecedentes (paridad con el medico).** Si responde "No" (primera vez), mostrar el mismo formulario de antecedentes que el medico tiene en su desktop app; las respuestas viajan por el buzon temporal cifrado E2E y la app del medico las descarga (y purga del buzon).
- **Rebanada 8 (portal, IA gobernada) — Preconsulta guiada por IA.** Si responde "Si", chat guiado por IA: arranca desde el motivo de consulta escrito (o pregunta por los sintomas si no hay sintomatologia clara), maximo 5 preguntas adaptativas a las respuestas, sin repetir y en lenguaje que el paciente entienda. Bajo gobernanza del paso 11: consentimiento explicito, seudonimizacion, sin persistir contenido en la nube/logs (regla 4); proveedor fake/determinista hasta el cableado real en staging con BAA (paso 16). El resultado se sella en el buzon como la preconsulta.
- **Rebanada 9 (portal) — Recordatorio 24 h con cancelacion.** Job que envia SMS/correo 24 h antes de la cita (sobre el paso 7), con enlace corto de cancelacion (expiracion y un solo uso) que reusa el flujo de cancelacion existente.
- **Rebanada 10 (app del medico) — Sync automatica al abrir + aviso de cambios.** Sincronizar la agenda en automatico al abrir/desbloquear la app; mostrar un badge (circulito rojo) en la esquina del boton "Sincronizar" cuando haya cambios pendientes por bajar/subir, y limpiarlo tras sincronizar.

Estado: 🔜 PLANEADO. Construido sobre los pasos 2, 3, 6, 7 y 11.

> Nota de residencia (rebanada 8): la preconsulta guiada por IA es el unico punto donde contenido clinico transita la nube para generar la siguiente pregunta. Debe tratarse como transitorio: consentimiento del paciente, seudonimizacion, prohibido persistir respuestas o prompts en logs/telemetria, y el resultado final sellado en el buzon cifrado (sealed box con la llave publica del medico) para que solo la app del medico lo lea. El adaptador real de IA se cablea en staging con BAA (paso 16); hasta entonces se usa un proveedor determinista para construir y probar el contrato.

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

La seleccion final de proveedores de IA tampoco debe cerrarse en el MVP: se cablea sobre la capa multi-proveedor en staging con BAA (paso 16). La decision de base vigente (2026-06-13, doc 11) es **Gemini 3 Flash** como LLM por costo —los generalistas superan a las herramientas clinicas especializadas en benchmark— y **Whisper local** para transcripcion, con nube (AssemblyAI/Deepgram) como respaldo con consentimiento. La capa multi-proveedor permite comparar y cambiar sin reescribir los flujos; la eleccion definitiva se confirma con benchmark sobre datos representativos.

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
