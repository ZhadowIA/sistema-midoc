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

**Decisiones de proveedores (2026-06-13):** SMS = **Twilio**, correo = **Resend** (doc 08), dominio web = **midocapp.com.mx** (2026-06-15). IA: base **Gemini 3 Flash** por costo con fallback (Gemini 3.1 Pro / GPT-5.5); transcripción **Whisper local** primero y nube (AssemblyAI/Deepgram) como respaldo con consentimiento; MedLM/HealthScribe descartados para MVP porque los generalistas los superan en benchmark (doc 11). La seguridad de medicación se resuelve con herramientas **deterministas** (DDInter, openFDA, RxNorm/RxClass), no con IA.

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
| 15 | Transcripcion local real (Whisper) | `superpowers:writing-plans` | whisper.cpp real, descarga de modelo y respaldo en nube gobernado. | ✅ DONE (backends nativos se validan en staging) |
| 16 | Proveedores de IA reales en staging (BAA) | `codex-security:security-scan` | Adaptadores reales de LLM/transcripcion con gobernanza intacta. | 🔜 PLANEADO |
| 17 | Produccion: notificaciones y pago reales | `superpowers:test-driven-development` | Twilio, Resend y pasarela de pago con dominios propios. | 🔜 PLANEADO |
| 18 | Agendado con responsable/tutor | `superpowers:test-driven-development` | El sistema distingue paciente con tutor de paciente sin tutor. | ✅ DONE |
| 19 | Pulido del flujo publico, preconsulta y sincronizacion | `impeccable` | Perfil/agenda fieles, preconsulta diferida (antecedentes o guiada por IA), recordatorio con cancelacion y sync con aviso. | 🔜 PLANEADO |
| 20 | App del medico: multi-perfil y agenda dia/semana | `impeccable` | Varios medicos comparten una computadora con bases cifradas independientes y agenda dia/semana. | ✅ DONE |
| 21 | Plantillas clinicas asistidas por conversacion | `superpowers:writing-plans` | Consulta grabada/transcrita se acomoda en segmentos revisables de la plantilla activa. | 🧪 EN REVISION (PR #18) |
| 22 | Diarizacion local (separacion de hablantes) | `superpowers:writing-plans` | Dialogo Medico/Paciente separado offline con sherpa-onnx; Ruta B anade transcripcion en nube gobernada por el portal. | 🚧 IN PROGRESS (nativo pendiente de staging) |
| 23 | Anamnesis asistida (cuestionario desde conversacion) | `superpowers:writing-plans` | Antecedentes estructurados propuestos por IA desde la consulta hablada, reconciliados campo por campo y confirmados por el medico. | 🔜 PLANEADO |
| 24 | Degradacion asistida de proveedor de IA | `superpowers:test-driven-development` | Ante sobrecarga del proveedor (503/429), el medico ve la causa y elige reintentar o generar con otro modelo disponible — nunca fallback silencioso. | 🚧 IN PROGRESS |
| 25 | Base de medicamentos a escala | `superpowers:writing-plans` | Pipeline reproducible de fuentes publicas + catalogo mexicano de marcas; verificacion con interacciones de par y de tres clases (triple whammy), base ONChigh de dominio publico. | ✅ DONE (swap ONChigh + triple whammy + apendice ONChigh completo sin QT + marcas MX por regla; pendiente: regla QT curada, RxClass reproducible, pipeline BRSDM completo, publicar endpoints/ops) |
| 26 | Perfil dentista completo (paridad Dentis365 + IA dental) | `superpowers:writing-plans` | Odontograma visual interactivo, indice de placa, plan de tratamiento presupuestado con saldos por avance, ordenes de laboratorio y capa IA dental (dictado al odontograma, nota de evolucion, indicaciones post-operatorias). | ✅ DONE (rebanadas 1-6 completas: odontograma visual y anatomico, indice de placa, presupuesto con saldos, laboratorio, dictado al odontograma, nota de evolucion e indicaciones post-operatorias; el uso DENTAL_EVOLUTION queda listo para el proveedor real del paso 16) |

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

Estado: ✅ DONE (compuerta de push cubierta) — rebanadas 1 (gestor de descarga del modelo), 2 (`WhisperLocalProvider` + decode de audio + cableado, binding real verificado de extremo a extremo) y 3 (respaldo en nube gobernado) entregadas (2026-06-15). Construido sobre el paso 11 (rebanadas 6 y 7). Decisiones de arranque (2026-06-15): la grabacion de audio es en la app de escritorio (WAV/PCM amigable a Whisper, sin decodificador pesado); binding `whisper-rs` 0.16 (MIT). El endpoint en nube real se cablea en staging con BAA (paso 16).

Entregado (rebanada 1 — gestor de descarga del modelo, 2026-06-15):

- **Catalogo de descarga (`transcription_model.rs`).** Para cada modelo soportado (`small`/`medium`/`large-v3`, reusando `WhisperModel` del paso 11) define el asset descargable: nombre de archivo GGML, URL (por defecto el repositorio publico de pesos de whisper.cpp; configurable por build con `MIDOC_WHISPER_*_URL`), checksum SHA-256 fijable por build (`MIDOC_WHISPER_*_SHA256`) y tamano aproximado. Nucleo puro y testeable: resolucion de asset, rutas bajo `models/`, holgura de disco, offset de reanudacion, verificacion de checksum en streaming y construccion del estado.
- **Residencia.** Los pesos son REFERENCIA publica (no PHI) y se comparten entre perfiles: viven en `app_data_dir/models/` (no por perfil). La descarga no envia ningun dato del paciente; el contrato real con la fuente se verifica en staging (regla 5).
- **Comandos (`lib.rs`).** `transcription_model_status` (presencia, verificacion por checksum, progreso por sondeo) y `download_transcription_model` (descarga/reanuda a `.part` con `Range`, valida espacio en disco con `sysinfo`, informa progreso en memoria, verifica el checksum si esta fijado y renombra al archivo final; si no coincide, descarta). Frontera de red fina con `reqwest` por trozos.
- **UI (`TranscriptionSetup.tsx`).** Bajo la recomendacion del modelo, boton "Descargar modelo (~X GB)", barra de progreso por sondeo mientras descarga y estado "Modelo descargado y listo" al terminar (con marca de verificado si hay checksum fijado). El mock de navegador simula el avance de la descarga.

Verificacion (rebanada 1): 124 pruebas de Rust en verde (+8: assets reconocen modelos y rechazan ids invalidos, URL por defecto apunta a whisper.cpp, rutas bajo `models/`, holgura de disco, reanudacion/reinicio del `.part`, `matches_sha256` exige hash fijado, `verify_file` en streaming, estados presente/parcial/no-verificado), `cargo clippy --lib` sin advertencias nuevas (persisten las 2 preexistentes de `clinical.rs` y el enum de comandos), `tsc + vite build` ok, y verificacion en navegador con el mock (recomendacion del modelo → descargar → progreso 1.22/1.46 GB que avanza por sondeo → "descargado y listo", sin errores de consola).

Entregado (rebanada 2 — `WhisperLocalProvider` + decode de audio + cableado, 2026-06-15):

- **Decode de audio (`audio.rs`).** `decode_wav_pcm16_to_whisper` convierte un WAV PCM de 16 bits a muestras f32 mono a 16 kHz **en memoria** (sin escribir el audio a disco; el audio es transitorio): recorre los chunks `fmt `/`data`, valida formato PCM16, mezcla a mono promediando canales y exige 16 kHz (el resampleo queda fuera de alcance: la app captura ya a 16 kHz). Logica pura y testeable.
- **Contrato del proveedor extendido (`ai.rs`).** `TranscriptionProvider::transcribe` ahora recibe tambien el audio en bruto (`&AudioInput`); el proveedor real decodifica las muestras y el fake lo ignora. El flujo gobernado `transcribe_audio` no cambia su contrato de residencia (sigue guardando solo metadata, descarta el audio, salida BORRADOR con revision humana).
- **`WhisperLocalProvider` (`whisper_provider.rs`, feature `whisper-local`).** Implementa el trait corriendo whisper.cpp via `whisper-rs` con el modelo GGML descargado (rebanada 1): decodifica el WAV, carga el modelo, transcribe en español sin red ni costo por uso, y devuelve el texto unido de los segmentos como borrador. El audio nunca se persiste.
- **Cableado (`lib.rs`).** `ai_transcribe_audio` ya no usa el fake: `resolve_transcription_provider` elige el modelo recomendado descargado y construye el `WhisperLocalProvider`; si el modelo no se ha descargado, guia al medico a la pestana Transcripcion. El input de audio en la consulta acepta WAV (mono 16 kHz) con la nota correspondiente.
- **Cadena nativa tras un feature (decision de toolchain).** `whisper-rs` (fijado en **0.16**) es dependencia **opcional** tras el feature `whisper-local`: compilarlo exige CMake + LLVM/libclang. El build por defecto y las pruebas no necesitan esa cadena (igual que los SDKs opcionales del paso 11 r8). Se fija 0.16 porque las versiones previas fallaban con el clang actual (`whisper-rs-sys` 0.13.1 daba un desajuste de layout de `whisper_full_params`; 0.11.1 generaba bindings opacos). El fake de transcripcion queda solo bajo `cfg(test)`.
- **Residencia.** Transcripcion 100% local (sin audio ni texto a la nube); el audio se decodifica en memoria y se descarta; el borrador queda en la base cifrada con revision humana.

Verificacion (rebanada 2): 127 pruebas de Rust en verde por defecto (+3: decode de WAV mono 16k, downmix de estereo a mono, rechazo de no-WAV / 44.1 kHz / 8 bits), `cargo clippy --lib` sin advertencias nuevas (persisten las 2 preexistentes), `tsc + vite build` ok. **Binding real verificado de extremo a extremo** en Windows MSVC tras instalar LLVM: `cargo build --features whisper-local` compila y enlaza whisper.cpp + bindings + provider; `cargo clippy --features whisper-local` sin advertencias nuevas; y un test de integracion (`transcribes_real_audio_without_error`, ignorado por defecto) corre **inferencia real** con el modelo `ggml-tiny` descargado (whisper.cpp carga el modelo, decodifica el WAV y emite segmentos), pasando en verde. La cadena nativa (CMake + LLVM) solo se requiere para la build de distribucion con el feature.

Ampliacion (rebanada 2, 2026-06-29 — mas formatos en el importador de archivos): `decode_wav_pcm16_to_whisper` se reemplaza por `decode_audio_to_whisper(bytes, media_type)`, que sigue decodificando todo **en memoria** pero ya no exige WAV PCM16 a 16 kHz exacto. Usa Symphonia (decodificacion, puro Rust, MPL-2.0, sin cadena nativa adicional — a diferencia de whisper-rs/sherpa-rs compila en el build y los tests por defecto) para WAV (cualquier bit depth/tasa), MP3 y M4A/AAC, y Rubato (resampleo sinc, MIT) para llevar cualquier tasa a 16 kHz. Fuera de alcance a proposito: Opus/OGG y FLAC (decision tomada con el medico: el unico formato sin licencia/dependencia nativa limpia para Opus es FFmpeg, descartado por riesgo de licencia LGPL/GPL en distribucion comercial). La grabacion en vivo (microfono) no cambia: sigue siendo WAV PCM16 16 kHz. El selector de archivo en `ConsultationTranscriptionPanel.tsx` ahora acepta `.wav/.mp3/.m4a/.aac`. Pruebas: WAV mono 16k sin resampleo, downmix estereo, resampleo 44.1k→16k, WAV 24-bit y float, rechazo de bytes irreconocibles/vacios, mas un test de integracion ignorado por defecto (`decodes_real_compressed_audio_file`, vía `MIDOC_TEST_AUDIO_FILE`) para verificar MP3/M4A reales manualmente. 194 pruebas de Rust en verde por defecto (2 ignoradas, las de audio real e inferencia real).

Entregado (rebanada 3 — respaldo de transcripcion en nube gobernado, 2026-06-15):

- **Proveedor en nube (`cloud_transcription.rs`).** `CloudTranscriptionProvider` implementa el trait con un POST sincrono del audio (estilo Deepgram: un request que devuelve el texto), usando `reqwest::blocking` (el comando `ai_transcribe_audio` es sincrono, corre en un hilo de Tauri). `parse_transcript` extrae el texto de la respuesta (`results.channels[].alternatives[].transcript`) — funcion pura y testeable. `estimate_cost_cents` estima el costo por duracion.
- **Gobernanza y seudonimizacion del envio.** Es la unica via en la que el audio sale del equipo, asi que: exige consentimiento de voz vigente (lo aplica `transcribe_audio`); **solo se envian los bytes del audio y el tipo de medio, nunca el nombre de archivo ni identificadores del paciente**; el audio no se persiste; la traza local guarda solo metadata.
- **Configuracion diferida a staging (regla 5).** `CloudConfig::from_env` lee `MIDOC_CLOUD_STT_{PROVIDER,API_KEY,ENDPOINT}`; sin configuracion la via en nube se rechaza con una guia (el proveedor real se cablea en staging con BAA, paso 16). El parser se prueba contra respuestas fake.
- **Seleccion y UI.** `ai_transcribe_audio` acepta `use_cloud`; `resolve_transcription_provider` enruta a nube o a Whisper local. En la consulta, una casilla "Usar respaldo en nube" (deshabilitada sin consentimiento de voz) cambia la via; la nota del panel indica local vs nube (bajo BAA). El mock de navegador espeja ambas vias.
- **Residencia.** Local por defecto (sin salir del equipo); la nube es opt-in, gobernada, transitoria y bajo BAA; el resultado queda como borrador en la base cifrada con revision humana.

Verificacion (rebanada 3): 130 pruebas de Rust en verde (+3: parseo de transcripcion estilo Deepgram, rechazo de respuestas vacias/malformadas, costo por duracion con piso), `cargo clippy --lib` sin advertencias nuevas, `tsc + vite build` ok, y verificacion en navegador (panel "Asistencia de IA": la casilla de nube aparece deshabilitada sin consentimiento de voz, con la nota "transcripcion local"; sin errores de consola). El envio real a un proveedor en nube se valida en staging con BAA.

Con esto la compuerta de push del paso 15 queda cubierta: descarga de modelo verificada, transcripcion local real (binding compilado y con inferencia real verificada) y respaldo en nube gobernado, todo con pruebas y residencia local por defecto.

### Extension (2026-06-21): optimizacion de transcripcion para CPU (rebanadas 4-6)

Motivacion: el paso 15 se diseno descargando pesos fp16 y tratando la GPU como binario *dedicada si/no*. El sistema es para **medicos**, que rara vez tienen GPU dedicada (lo normal es CPU-only, GPU integrada o Apple Silicon). Se reorienta a maxima eficiencia/velocidad/precision en equipos sin GPU dedicada, sin abandonar a quien si la tiene. Decisiones de producto (2026-06-21): reemplazar fp16 por **cuantizados Q5** en todos los modelos, y empaquetar backend **Vulkan universal + Metal + CPU/OpenBLAS**, con la deteccion razonando por backend. Detalle en `11_recomendaciones_ia_medica.md` (seccion "Optimizacion para CPU").

Entregado (rebanada 4 — modelos cuantizados Q5):

- **Pesos Q5 (`transcription.rs`, `transcription_model.rs`).** `WhisperModel::file_name` apunta a las variantes cuantizadas (`ggml-small-q5_1.bin`, `ggml-medium-q5_0.bin`, `ggml-large-v3-turbo-q5_0.bin`, `ggml-large-v3-q5_0.bin`); RAM/disco aproximados y tamanos exactos de descarga (Content-Length verificado) actualizados a Q5. La URL por defecto al repo publico de whisper.cpp sirve sin cambios.
- **Impacto.** El modelo recomendado en CPU (turbo-q5) baja de ~1.6 GB a ~575 MB en disco y de ~6 GB a ~2 GB en RAM, con perdida de precision minima.

Entregado (rebanada 5 — backends de aceleracion + deteccion por backend):

- **Features de Cargo (`Cargo.toml`).** `whisper-openblas`, `whisper-vulkan`, `whisper-metal` (ademas del ya existente `whisper-cuda`), compile-time y verificados en staging (regla 5). El build por defecto y las pruebas no necesitan cadena nativa.
- **Deteccion por backend (`transcription.rs`).** El clasificador booleano `looks_like_accelerable_gpu` se reemplaza por `classify_adapter -> AdapterClass {Dedicated, Integrated, Apple, None}` y `detect_backend_from_names -> AccelBackend {Cpu, VulkanIntegrated, VulkanDedicated, Metal}`. Las GPU integradas (Intel UHD/Iris, APU Radeon) ya **no** se descartan: aceleran via Vulkan. Apple Silicon -> Metal.
- **Politica `recommend()` CPU-first.** turbo-q5 como base en CPU (>=6 GB); large-v3-q5 para GPU dedicada y Apple con >=16 GB; small-q5 + nube solo para CPU con <6 GB. `TranscriptionRecommendation` expone `accel`/`accelLabel` ademas de `hasGpu` (compat). El frontend (`TranscriptionSetup.tsx`) muestra el backend detectado.

Entregado (rebanada 6 — VAD para saltar silencios):

- **Asset VAD (`transcription_model.rs`).** Modelo Silero (`vad-silero`, `ggml-silero-v5.1.2.bin`, ~865 KB) anadido al catalogo; reusa el gestor de descarga (reanudacion/checksum/estado) y vive en `models/` (referencia publica, no PHI).
- **Cableado (`lib.rs`, `whisper_provider.rs`).** `WhisperLocalProvider` acepta una ruta VAD opcional; si el modelo esta descargado, `FullParams` activa el VAD (`enable_vad` + `set_vad_model_path` + `set_vad_params`, silencio minimo 200 ms para no cortar habla clinica) y whisper.cpp procesa solo los tramos con voz. Si no esta, degrada a procesar todo el audio.
- **UI (`TranscriptionSetup.tsx`).** Descarga opcional del detector de voz con su propio estado/progreso, junto al modelo principal.

Entregado (rebanada 7 — matriz de empaque por SO + reconciliacion con el backend compilado):

- **Reconciliacion deteccion/compilacion (`transcription.rs`).** `BackendCaps::compiled()` lee los features de Cargo activos (`cfg!(feature = ...)`) y `effective_backend(detected, caps)` reduce el backend detectado por hardware al que el binario realmente puede usar; si la aceleracion no se compilo, cae a CPU. `detect_specs` aplica esta reduccion. Cierra el acoplamiento: un instalador CPU-only en una maquina con GPU recomienda turbo-q5 (CPU), no large-v3 que correria lento.
- **Matriz de distribucion (`package.json`).** Scripts por SO: `tauri:build:vulkan` (Windows/Linux: Vulkan universal + OpenBLAS + diarizacion), `tauri:build:metal` (macOS: Metal), `tauri:build:cuda` (NVIDIA), y `tauri:build` como respaldo CPU-only. Equivalentes `tauri:dev:*` en `--release` (evita mezclar CRT Debug/Release con libs nativas). Se elimino la duplicacion `cuda:diarize` (identica a `cuda`).
- **Pendiente de empaque (staging, regla 5).** Cada build nativo se compila/firma en su SO con la cadena correspondiente (Vulkan SDK / Xcode-Metal / CUDA toolkit); aqui se definen los comandos y la reconciliacion, la compilacion real se valida en staging como el binding de Whisper.

Verificacion (rebanada 7): `effective_backend` cubierto por pruebas puras (degrada a CPU sin features; conserva backend con su feature; CUDA acelera dedicada pero no integrada; regresion del acoplamiento CPU-only+GPU -> turbo-q5) y `buildScripts.test.ts` valida la matriz por SO y que los dev nativos usan `--release`.

Verificacion (rebanadas 4-6): **187 pruebas de Rust en verde** (politica por backend, clasificacion dedicada/integrada/Apple/ninguna, agregador por prioridad, assets Q5 con tamanos exactos, catalogo con VAD resoluble bajo `models/`), `cargo clippy --lib` sin advertencias nuevas, `tsc + vite build` ok. La inferencia real con VAD (`enable_vad` + modelo Silero) y la compilacion de los backends (`whisper-vulkan`/`whisper-metal`/`whisper-openblas`) se validan en staging con la cadena nativa (regla 5), igual que el binding de Whisper.

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

Decisiones (2026-06-13, doc 08; aclaracion 2026-06-15): SMS = Twilio, WhatsApp Business puede usarse si es por canal oficial de Twilio, correo = Resend. La pasarela de pago concreta queda por elegir (candidatos: Stripe, Mercado Pago). Sigue prohibido el bot no oficial de V1 (`whatsapp-web.js`) por riesgo de baneo/scraping; los recordatorios se envian con contenido minimo, consentimiento y plantillas aprobadas cuando el canal lo requiera.

Implementado (2026-06-15): la cola de notificaciones soporta `WHATSAPP` como canal separado y lo entrega por Twilio WhatsApp Business/API (`whatsapp:+E164`) cuando `WHATSAPP_PROVIDER=twilio`. `PHONE_NOTIFICATION_CHANNEL=SMS|WHATSAPP` decide si las notificaciones a telefono se encolan como SMS (default) o WhatsApp; usar WhatsApp solo con consentimiento/politica lista.

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

Extension — Historia clinica completa (cuestionario ampliado) + separacion de preconsulta:

- **Rebanada 11 (app del medico) — Separar preconsulta IA de antecedentes.** El sobre de antecedentes (kind `medical-history`/`generic`) y el de la preconsulta guiada por IA (kind `ai-preconsulta`) ya no se pisan: la tabla local `precheckins` pasa a PK compuesta `(appointment_id, kind)` para que coexistan. El detalle del encuentro expone dos campos (`medical_history`, `preconsulta`) y el desktop los muestra en secciones distintas ("Preconsulta" = solo IA; "Antecedentes" = cuestionario). CLINICO: todo sigue en la base cifrada local.
- **Rebanada 12 (app del medico) — Espejo de la historia clinica en el desktop.** Reescritura del formateo del desktop (`medicalHistoryFormat.ts`) para la nueva estructura (ficha de identificacion, contacto de emergencia, heredo-familiares por padecimiento con parientes, no patologicos con sub-bloques, gineco-obstetricos, patologicos con sub-preguntas, e interrogatorio por aparatos y sistemas como seccion del medico) y de la extraccion a los buckets editables (`precheckinBackground.ts`): patologicos -> antecedentes, heredo-familiares -> familiares, alergias. El resultado de la preconsulta IA ya no alimenta los antecedentes.
- **Rebanada 13 (contrato + portal) — Contrato nuevo + formulario del paciente.** Reescritura desde cero del contrato compartido `medical-history.ts` (fuente de verdad) y del formulario publico: tipos de campo (numero/fecha/seleccion/si-no), revelados condicionales, secciones por sexo y el widget de heredo-familiares por padecimiento; omite las secciones de audiencia "doctor". El esquema nuevo reemplaza al anterior (el blob es transitorio en el buzon, no hay datos persistidos que migrar). Se recomienda enormemente al paciente pero nunca es obligatorio; viaja sellado E2E.

Estado: ✅ COMPLETADO (rebanadas 1-10 + extension 11-13). Construido sobre los pasos 2, 3, 6, 7 y 11.

Entregado (extension historia clinica + separacion de preconsulta, 2026-06-18):

- **Separacion (r11).** `precheckins` con PK compuesta `(appointment_id, kind)`; el detalle del encuentro expone `medical_history` y `preconsulta` por separado; el desktop muestra "Preconsulta" (solo IA) y "Antecedentes" (cuestionario) sin cruzarse.
- **Contrato y vistas (r12-r13).** Contrato `medical-history.ts` reescrito (fuente de verdad) con tipos de campo (texto/numero/fecha/seleccion/si-no), sub-bloques, revelados condicionales (`showWhen`), heredo-familiares por padecimiento (parientes + tipo) y el interrogatorio por aparatos y sistemas como seccion de audiencia "doctor" (omitida en el formulario del paciente). Espejo en el formateo y la extraccion del desktop; formulario publico reescrito sobre el contrato.
- **Residencia.** Todo el cuestionario es CLINICO transitorio: viaja sellado E2E, vive en la base cifrada local y se purga del buzon tras el ACK. La nube nunca lo ve.

Verificacion (extension): Rust `cargo test` 148 en verde (+1: coexistencia de ambos sobres) y `cargo clippy` sin warnings nuevos; desktop `tsc` + `vite build` ok y pruebas de formato/extraccion reescritas; portal `eslint`/`vitest` (124 + 6 nuevas del contrato) y `next build` ok. Verificacion en navegador del formulario (ruta de prueba temporal, ya eliminada): renderiza sin errores de consola; el interrogatorio por aparatos y sistemas (audiencia medico) no aparece; gineco solo con sexo F; los revelados condicionales (`showWhen`) y el widget heredo-familiar por padecimiento (parientes + tipo de cancer) funcionan.

Entregado (rebanada 1 — perfil publico: foto y ubicacion, 2026-06-15):

- **Foto sin recorte por el banner (`globals.css`).** La portada `.dp-cover` es `position: relative` y, por orden de pintado, se dibujaba encima del avatar que sube con `margin-top: -52px`, recortandolo. Se da `position: relative; z-index: 1` a `.dp-hero-body` para que el avatar (y la identidad) queden sobre la portada. Verificado: el avatar solapa la portada 52px y `elementFromPoint` en esa zona devuelve el propio `.dp-avatar`.
- **Mapa con API key gobernada y fallback (`perfil/[slug]/page.tsx`, `lib/env.ts`, `.env.example`).** Se elimina la API key de Google Maps hardcodeada en el codigo; ahora se lee de `GOOGLE_MAPS_EMBED_API_KEY` (opcional en `env.ts`). Si la llave falta o es invalida, en vez del error crudo del iframe se muestra un fallback legible: la direccion y un enlace "Ver en Google Maps" (`maps/search`) que abre la ubicacion. Nuevo estilo `.dp-map-fallback`.
- **Residencia.** Perfil/foto/mapa son OPERATIVO/publico; sin PHI.

Verificacion (rebanada 1): 80 pruebas del portal en verde (sin nuevas: correccion de UI/configuracion sin logica de dominio nueva), `eslint`/`tsc` limpios, `next build` ok, y verificacion en navegador (avatar pintado sobre el banner; sin la llave configurada el mapa cae al fallback con direccion y enlace a Google Maps; sin errores de consola).

Entregado (rebanada 2 — calendario fiel a la disponibilidad, 2026-06-14):

- **Dias con cupo real (`public-booking-service.ts`).** Nueva `listAvailableDays(slug, serviceId, dateFrom, days)` que reusa el computo real de slots (reglas semanales, excepciones `DATE_OVERRIDE`, bloqueos, citas, holds y limites de anticipacion) y devuelve las **fechas locales del medico** (YYYY-MM-DD) con al menos un horario. `listPublicAvailability` ahora expone `timeZone` y el tope de ventana sube a 31 dias para cubrir meses completos.
- **Endpoint (`/api/public/doctors/[slug]/available-days`).** Espeja la ruta de disponibilidad; valida `serviceId` y `dateFrom`.
- **Calendario fiel (`calendar.tsx`, `booking-client.tsx`).** El selector recibe `availableDays` y deshabilita los dias sin cupo (clase `unavailable`, tachado y no clickeable), ademas de los pasados; ya no se muestran como disponibles vacios. El cliente consulta los dias del **mes visible** al cambiar de mes o servicio, con estado de carga y leyenda. (El boton "Buscar horarios" y la carga automatica de horarios quedan para la rebanada 3.)
- **Residencia.** Fechas/disponibilidad son OPERATIVO/publico; sin PHI.

Verificacion (rebanada 2): 73 pruebas del portal en verde (+1: `listAvailableDays` incluye el dia con regla y excluye el dia siguiente sin regla; cada dia devuelto tiene >= 1 slot), `eslint`/`tsc` limpios, `next build` ok, y verificacion en navegador (junio: solo lun-vie activos, fines de semana y dias pasados deshabilitados; al navegar a julio se recalculan los dias).

Entregado (rebanada 3 — carga automatica de horarios + hold por sesion, 2026-06-14):

- **Carga automatica de horarios (`booking-client.tsx`).** Se elimina el boton "Buscar horarios": al elegir dia o servicio, los horarios se cargan solos (efecto sobre `[serviceId, dateFrom]`), con estado de carga propio y mensaje claro cuando el dia no tiene cupo.
- **Hold por sesion sin auto-bloqueo (`public-booking-service.ts`).** `createAppointmentHold` acepta `previousHoldToken`: dentro de la transaccion serializable libera el hold previo de la misma sesion (estado `RELEASED`) antes de tomar el nuevo, asi cambiar de horario no se bloquea a si mismo ni deja el horario anterior ocupado. `listPublicAvailability` acepta `ignoreHoldToken` para que el horario que el paciente ya aparto siga visible en su propia vista; la ruta de disponibilidad y la de holds exponen ambos parametros.
- **UI.** El cliente pasa su hold actual como `ignoreHoldToken` al recargar horarios y como `previousHoldToken` al apartar uno nuevo. La proteccion de doble reserva entre pacientes distintos se mantiene intacta (el conflicto sigue mirando holds ACTIVE de otros).
- **Residencia.** Sin PHI; solo horarios y tokens opacos de hold.

Verificacion (rebanada 3): 74 pruebas del portal en verde (+1: la misma sesion cambia de hold sin auto-bloquearse — su hold previo queda `RELEASED`, el horario anterior se libera y reapartar el mismo con su token funciona; `ignoreHoldToken` revela su propio horario), `eslint`/`tsc` limpios, `next build` ok, y verificacion en navegador (horarios auto-cargados sin boton; apartar 08:00 y cambiar a 08:30 libera el 08:00 y ambos siguen disponibles para el mismo paciente; sin errores de consola).

Entregado (rebanada 4 — validacion de telefono internacional, 2026-06-14):

- **Helper compartido (`lib/phone.ts`).** Lista curada de paises con clave de marcacion, `detectCountry(locale)` (region del locale; Mexico por defecto), `isValidNationalNumber` (exactamente 10 digitos), `onlyDigits` y `formatFullPhone` (p. ej. "+52 5512345678").
- **Componente (`phone-field.tsx`).** Selector de clave de pais + input de 10 digitos (filtra no-numericos, `maxLength` 10, `inputMode` numerico), con error inline al perder foco si el numero es invalido o falta cuando es obligatorio.
- **Formulario (`booking-client.tsx`).** El telefono del paciente y el del responsable usan `PhoneField`; la clave de pais se autodetecta tras montar (sin desajuste de hidratacion) y es editable. El submit valida 10 digitos antes de enviar y manda el telefono ya normalizado con su clave. El servidor permanece lenient (`min(7)`), sin romper el contrato existente.
- **Residencia.** El telefono es CONTACTO; sin PHI.

Verificacion (rebanada 4): 78 pruebas del portal en verde (+4 unitarias de `phone.ts`: validacion de 10 digitos, deteccion de pais por locale, formato con clave), `eslint`/`tsc` limpios, `next build` ok, y verificacion en navegador (selector MX +52 por defecto con paises; se filtran no-numericos; un numero corto marca error inline y `aria-invalid`; 10 digitos lo limpia; el toggle "para otra persona" muestra el campo del responsable).

Entregado (rebanada 5 — reagendado con el mismo calendario, 2026-06-14):

- **Mismo selector que el agendado inicial (`cita/[token]/appointment-client.tsx`).** El cambio de horario de una cita existente reemplaza el `input type="date"` nativo por el componente `Calendar` (con fidelidad de dias disponibles: solo dias con cupo real habilitados, reusando `/available-days`) y la grilla de horarios. Al abrir "Cambiar horario" se carga un dia por defecto con sus horarios, igual que el agendado inicial; elegir un dia recarga los horarios.
- **Sin cambios de backend.** Reusa los endpoints existentes (`/available-days`, `/availability`, `/reschedule`); es un cambio de presentacion.
- **Residencia.** Fechas/horarios OPERATIVO/publico; sin PHI.

Verificacion (rebanada 5): 78 pruebas del portal en verde (sin nuevas: cambio de UI que reusa componentes/endpoints ya cubiertos; el reagendado ya esta probado en `public-booking`), `eslint`/`tsc` limpios, `next build` ok, y verificacion en navegador (la cita muestra el `Calendar` en vez del input nativo; dias sin cupo deshabilitados; elegir dia 17 -> 08:00 y confirmar cambia el horario de la cita; sin errores de consola).

Fix de zona horaria (2026-06-14): el calendario usaba `toISOString().slice(0,10)` (UTC) para formatear y `new Date("YYYY-MM-DD")` (UTC) para parsear, corriendo el dia uno hacia atras en husos negativos por la noche. Nuevo `lib/local-date.ts` (`toLocalDateString`/`parseLocalDate`); `Calendar`, `nextDateString` y `tomorrowString` usan componentes locales. 80 pruebas en verde (+2), verificado en navegador (hoy 14 a las 17h selecciona el 15; clic en 18 queda en 18).

Entregado (rebanada 6 — preconsulta diferida con bifurcacion, 2026-06-14):

- **Aviso diferido (`cita/[token]/appointment-client.tsx`).** Tras confirmar la cita ya no se muestra el formulario de inicio: aparece el aviso "Para agilizar la consulta con su medico, ayudenos contestando este formulario pre-consulta" con boton "Contestar".
- **Bifurcacion.** Al contestar, la primera pregunta es "¿Es su primera visita con este medico o ya contesto antes el formulario de antecedentes?" con dos opciones; "Es mi primera visita" enruta al formulario de antecedentes (rebanada 7) y "Ya contesto antes" a la preconsulta guiada por IA (rebanada 8). Se puede cancelar o cambiar de ruta. Si ya hay respuestas previas se entra directo al formulario.
- **Estado actual.** En esta rebanada ambas ramas muestran el formulario de preconsulta existente (motivo/antecedentes/sintomas); las rebanadas 7 y 8 especializan cada rama y mueven el contenido al buzon cifrado E2E.

Verificacion (rebanada 6): cambio de UI sin backend; `eslint`/`tsc` limpios, `next build` ok, 80 pruebas en verde, y verificacion en navegador (aviso -> Contestar -> bifurcacion con las dos opciones y cancelar -> formulario con nota de ruta; el formulario no se muestra antes de contestar).

Nota tecnica (rebanadas 7-8): cerrada. Antecedentes (rebanada 7) y el resultado de la IA (rebanada 8) ya viajan como sealed box (X25519, patron del paso 6 para documentos) que la nube no puede leer, con descarga y purga desde la app del medico. Solo la preconsulta GENERICA (placeholder de la rebanada 6) seguiria en texto plano, pero ambas ramas de la bifurcacion (antecedentes / IA) ya estan especializadas y selladas, asi que el placeholder ya no se usa en el flujo del paciente.

Entregado (rebanada 7 — formulario de antecedentes con paridad y buzon E2E, 2026-06-15):

- **Contrato compartido (`lib/medical-history.ts`).** Fuente de verdad de los campos de antecedentes (identificacion, heredofamiliares, no patologicos, patologicos, gineco/andrologicos condicionales por sexo, alergias y medicamentos), con esquema Zod y grupos para construir el formulario. Recortado de `ClinicalHistoryForm` de V1 a lo que el paciente puede contestar; todo opcional.
- **Formulario sellado en el cliente (`medical-history-form.tsx`, `lib/seal-envelope.ts`).** La rama "primera visita" de la bifurcacion (rebanada 6) muestra el formulario; al enviar, las respuestas se validan con Zod, se serializan y se **sellan en el navegador** (sealed box X25519 con la llave publica del dispositivo del medico) reusando el patron de documentos del paso 6 (helper `sealEnvelope` extraido y compartido con la carga de documentos). Gineco/andrologicos se muestran segun el sexo biologico capturado.
- **La nube nunca ve el contenido (`public-booking-service.ts`, `schema.prisma`).** `PrecheckinSubmission` gana `kind`, `ciphertext`, `sizeBytes`, `deliveredAt`, `purgedAt`. `submitMedicalHistory` guarda SOLO el `ciphertext` (`responses` queda nulo) y emite `PRECHECKIN_SUBMITTED` con `sealed:true` y sin respuestas. La purga en `ackSyncEvents` borra el `ciphertext` y marca `purgedAt` tras el ACK (frontera legal).
- **Sin dispositivo no aparece (requisito del medico).** Si el medico no tiene llave publica de dispositivo, `getPublicAppointmentByToken` devuelve `documentPublicKey:null` y el portal **no muestra la preconsulta**; ademas `submitMedicalHistory` rechaza con 409 (defensa del API ante envio directo).
- **Entrega y recepcion E2E (`/api/sync/precheckins/[id]`, desktop `sync.rs`/`lib.rs`/`db.rs`).** Nuevo endpoint que entrega el sealed box al dispositivo (mismo contrato que documentos: dueño unico, 410 tras purga, 404 a intrusos). La app del medico descarga el ciphertext antes de avanzar el cursor, lo descifra con `crypto::unseal_document` y guarda los antecedentes en `precheckins` (columna `kind='medical-history'`); `apply_batch` no pisa el contenido sellado. La vista del medico (`Atencion.tsx`) aplana los antecedentes anidados a pares legibles por grupo.
- **Residencia.** Antecedentes = CLINICO en transito; la nube solo guarda `ciphertext` que no puede abrir, y lo purga tras el ACK. Residencia definitiva en la app local.

Verificacion (rebanada 7): portal 82 pruebas en verde (+2 de integracion: la nube guarda solo `ciphertext` —sin texto plano—, el evento va `sealed` sin respuestas, el dispositivo descifra el sobre y recupera el payload exacto, y tras el ACK el `ciphertext`/payload quedan purgados con re-descarga 410; rechazo 409 sin llave de dispositivo), `eslint`/`tsc` limpios, `next build` ok; desktop 113 pruebas de Rust en verde (+1: antecedentes sellados se guardan como `medical-history` e idempotentes), `cargo clippy` sin advertencias nuevas, `tsc + vite build` del escritorio ok. Verificacion en navegador con libsodium real: con llave de dispositivo el formulario aparece, gineco/andrologicos se muestran segun el sexo, y al enviar la fila queda con `responses=null`, `ciphertext` presente y sin fuga de texto plano; el evento lleva `sealed:true` sin respuestas; sin errores de consola.

Entregado (rebanada 8 — preconsulta guiada por IA, gobernada y sellada E2E, 2026-06-15):

- **Adaptador de IA agnostico (`services/ai/preconsulta-ai.ts`, `lib/env.ts`).** Contrato unico `PreconsultaAiProvider` con tres implementaciones seleccionables por `AI_PROVIDER`: `fake` (determinista, sin red, default para dev/pruebas), `openai` (SDK oficial `openai`, `OPENAI_API_KEY`) y `anthropic` (SDK oficial `@anthropic-ai/sdk`, modelo por defecto `claude-opus-4-8`). Los SDKs son dependencias opcionales (import dinamico con `turbopackIgnore`): el build por defecto no las necesita. Gobernanza (paso 11): el contenido entra seudonimizado, sin PII, y NO se persiste en nube/logs (regla 4); proveedor real solo en staging con BAA (paso 16).
- **Chat guiado (`cita/[token]/preconsulta-ai/route.ts`, `ai-preconsulta-chat.tsx`).** Tras la bifurcacion (rama "ya contesto antes"), consentimiento explicito y luego un chat: arranca del motivo, maximo 5 preguntas adaptativas, sin repetir, en lenguaje de paciente. El endpoint NO guarda nada: calcula y devuelve la siguiente pregunta.
- **Resultado sellado E2E (`public-booking-service.ts`, `preconsulta-ai/submit/route.ts`, `schema.prisma`).** Nuevo `PrecheckinKind.AI_PRECONSULTA`. El resultado (motivo + Q&A) se sella en el navegador (sealed box X25519) y se guarda como `ciphertext` (`responses` nulo), reusando el `submitSealedPrecheckin` compartido con los antecedentes (rebanada 7). El evento de sync va `sealed:true` sin respuestas; la entrega al dispositivo (`getMailboxPrecheckinForDevice`) y la purga tras ACK cubren ambos tipos.
- **Recepcion y vista (desktop `sync.rs`, `Atencion.tsx`).** `store_mailbox_precheckin` lee el `kind` del meta del sobre (antecedentes vs preconsulta IA) y lo guarda en `precheckins.kind`. La vista del medico aplana el resultado IA a Motivo + pares pregunta/respuesta.
- **Sin dispositivo no aparece.** Igual que la rebanada 7: sin llave de dispositivo el portal oculta la preconsulta y el API rechaza con 409.
- **Residencia.** La preconsulta IA es el unico punto donde contenido clinico transita la nube (transitorio, seudonimizado, sin persistir); el resultado final vive sellado y se purga tras el ACK. Residencia definitiva en la app local.

Verificacion (rebanada 8): portal 86 pruebas en verde (+3 fake provider unitarias: arranca por sintoma sin motivo, no repite, termina al maximo; +1 integracion IA: la nube guarda solo `ciphertext` —sin texto plano—, evento `sealed`, el dispositivo descifra el payload exacto via el filtro ampliado a `AI_PRECONSULTA`, y purga tras ACK), `eslint`/`tsc` limpios, `next build` ok; desktop 114 pruebas de Rust en verde (+1: el `kind` se lee del meta del sobre, `ai-preconsulta`), `cargo clippy` sin advertencias nuevas, `tsc + vite build` ok. Verificacion en navegador: con el proveedor real `openai` el adaptador llama a OpenAI de verdad (el flujo se valido contra la API; la cuenta de prueba devolvio 429 por cuota, confirmando la llamada real); con el proveedor `fake` el camino feliz completo (consentimiento -> 5 preguntas sin repetir -> sellado -> envio) deja la fila `AI_PRECONSULTA` con `responses=null`, `ciphertext` presente y sin fuga de texto plano, evento `sealed:true` sin respuestas; sin errores de consola.

Entregado (rebanada 9 — recordatorio 24 h con cancelacion, 2026-06-14):

- **El recordatorio ya existia** (se encola al agendar con `scheduledFor` 24 h antes) y el job de despacho `/api/internal/notifications/dispatch` (cron autorizado) procesa la cola por tiempo. Esta rebanada agrega el **enlace de cancelacion**.
- **Enlace de cancelacion (`public-booking-service.ts`).** El recordatorio apunta a `cita/<token>?accion=cancelar` con enlace corto que **expira al inicio de la cita**; la cancelacion es de un solo efecto (el servicio rechaza cancelar dos veces). La plantilla del recordatorio menciona la cancelacion y el vencimiento.
- **Deep-link (`cita/[token]/page.tsx` + `appointment-client.tsx`).** La pagina lee `?accion=cancelar` y muestra un aviso destacado "¿Quieres cancelar esta cita del <fecha>?" con "Si, cancelar"/"No, conservar", reusando el flujo de cancelacion existente. El aviso ya confirma, asi que omite el `window.confirm` redundante (el boton general "Cancelar cita" si lo conserva).
- **Residencia.** El recordatorio solo lleva nombre, contacto y datos de cita; sin contenido clinico.

Verificacion (rebanada 9): 80 pruebas del portal en verde (la prueba de notificaciones ahora comprueba que el recordatorio lleva `accion=cancelar` y que el de SMS usa enlace corto con expiracion), `eslint`/`tsc` limpios, `next build` ok, y verificacion en navegador (abrir la cita con `?accion=cancelar` muestra el aviso con la fecha; "Si, cancelar" deja la cita en estado Cancelada sin dialogo bloqueante).

Entregado (rebanada 10 — sync automatica al abrir + badge de cambios pendientes, app del medico, 2026-06-14):

- **Sync automatica al abrir/desbloquear (`App.tsx`).** Con la app desbloqueada y vinculada, sincroniza la agenda una sola vez automaticamente (ref para no repetir), ademas del boton manual.
- **Badge de cambios pendientes (`lib.rs` + `App.tsx` + `App.css`).** Nuevo comando `sync_pending` que hace un peek sin aplicar: `pending_download` (eventos en el buzon del portal, GET sin ACK) y `pending_upload` (reportes de uso de IA locales por subir). Best-effort: sin red no marca pendiente. La UI consulta al abrir y cada 60 s, muestra un circulito rojo en la esquina del boton "Sincronizar" cuando hay pendientes y lo limpia tras sincronizar.
- **Residencia.** El peek no descarga ni descifra contenido; solo cuenta eventos.

Verificacion (rebanada 10): 112 pruebas de Rust en verde (las piezas base `fetch_inbox`/`pending_usage_reports` ya estaban cubiertas), `cargo clippy` sin advertencias nuevas, `tsc + vite build` del escritorio ok. La ejecucion visual completa de la app Tauri no se corrio aqui (sin runtime de escritorio); la verificacion es compilacion + pruebas, como en rebanadas previas del escritorio.

> Nota de residencia (rebanada 8): la preconsulta guiada por IA es el unico punto donde contenido clinico transita la nube para generar la siguiente pregunta. Debe tratarse como transitorio: consentimiento del paciente, seudonimizacion, prohibido persistir respuestas o prompts en logs/telemetria, y el resultado final sellado en el buzon cifrado (sealed box con la llave publica del medico) para que solo la app del medico lo lea. El adaptador real de IA se cablea en staging con BAA (paso 16); hasta entonces se usa un proveedor determinista para construir y probar el contrato.

## Paso 20 - App del medico: multi-perfil y agenda dia/semana

| Campo | Definicion |
|---|---|
| Objetivo | Pulir la app del medico tras el piloto: permitir que **varios medicos** compartan una misma computadora, cada uno con su propia base cifrada e independiente; y dar a la agenda una **vista de dia** ademas de la semanal, con opcion de mostrar/ocultar las citas canceladas. Extiende los pasos 1 (base cifrada) y 13 (agenda semanal). |
| Requisitos relacionados | RNF03, RNF04, RNF05 (aislamiento y cifrado por medico), RF04/RF05 (visualizacion de agenda). Extiende pasos 1 y 13. |
| Entrada necesaria | App del medico con base cifrada por frase de seguridad (paso 1) y agenda semanal por bloques (paso 13) funcionando. |
| Se construye | App del medico: registro local de perfiles de medico (`doctor_profiles.json` en el directorio de datos), creacion de perfil desde la pantalla de desbloqueo, base/respaldos por perfil (`profiles/<id>/midoc.db`), seleccion de perfil al abrir; agenda con conmutador Dia/Semana, navegacion coherente (avanza 1 dia o 7 segun la vista) y casilla "Mostrar canceladas" que por defecto las oculta; refinamiento visual (paneles y tarjeta de acceso sin borde/redondeo). |
| Se valida con | Dos medicos en la misma maquina abren bases distintas con sus propias frases sin verse entre si; crear un perfil nuevo no toca las bases existentes; un `profile_id` con `..`/`/` se rechaza (sin path traversal); en la agenda el medico cambia entre Dia y Semana, navega coherentemente y oculta/muestra canceladas. |
| Compuerta de avance | El aislamiento por perfil no rompe el cifrado ni la residencia local: cada base sigue cifrada con su propia frase y vive en disco del medico; el registro de perfiles solo guarda id/nombre/fechas (sin PHI, sin frases). La agenda es presentacion (sin nuevo contenido clinico). |
| Push recomendado | Por rebanada cerrada y verificada; multi-perfil y agenda son independientes. |

Clasificacion de datos: el registro de perfiles (id, nombre del medico, fechas de uso) es OPERATIVO local; no contiene PHI ni frases de seguridad. La agenda dia/semana es presentacion sobre datos ya residentes; sin nuevo contenido clinico.

Rebanadas:

- **Rebanada 1 (app del medico) — Multi-perfil de medico.** Registro local de perfiles, creacion desde el desbloqueo, base y respaldos aislados por perfil, validacion de `profile_id` contra path traversal. El `default` conserva la ruta historica (`midoc.db`) para no romper instalaciones existentes.
- **Rebanada 2 (app del medico) — Agenda dia/semana + mostrar canceladas.** Conmutador Dia/Semana, navegacion por dia o semana segun la vista, casilla "Mostrar canceladas" (ocultas por defecto), con la logica pura extraida a un modulo testeable; refinamiento visual de paneles/tarjeta de acceso.

Estado: ✅ COMPLETADO (rebanadas 1-2 entregadas y verificadas, 2026-06-15). Construido sobre los pasos 1 y 13.

Entregado (rebanada 1 — multi-perfil de medico, 2026-06-15):

- **Registro local de perfiles (`lib.rs`).** Comandos `list_doctor_profiles` y `create_doctor_profile`; el registro vive en `doctor_profiles.json` en el directorio de datos de la app y solo guarda `id`, `display_name`, `created_at` y `last_used_at` (sin PHI ni frases). El perfil `default` se inyecta siempre y conserva la ruta historica (`midoc.db`); los demas usan `profiles/<id>/midoc.db` y sus respaldos en `profiles/<id>/backups/`.
- **Aislamiento y anti path-traversal.** `validate_profile_id` exige `[A-Za-z0-9_-]` (<=64) y rechaza vacios, `..` y `/`; `unlock_database` ahora recibe `profile_id`, marca `last_used_at` y abre la base del perfil seleccionado. El id se deriva del nombre del medico de forma estable y con sufijo ante colisiones.
- **UI de desbloqueo (`App.tsx`, `ipc.ts`).** Selector de medico (preselecciona el ultimo usado), fila "Nuevo medico" + "Crear", y la barra superior del workspace muestra el nombre del medico activo. El mock espeja el comportamiento.
- **Residencia.** Cada base sigue cifrada con su propia frase y vive en disco del medico; el registro de perfiles es OPERATIVO local sin PHI.

Verificacion (rebanada 1): desktop 116 pruebas de Rust en verde (+2: `profile_database_path` separa medicos y respeta `default`; `validate_profile_id` rechaza path traversal), `cargo clippy` sin advertencias nuevas, `tsc + vite build` ok.

Entregado (rebanada 2 — agenda dia/semana + mostrar canceladas, 2026-06-15):

- **Logica pura testeable (`weekAgendaFilters.ts`).** `filterAgendaAppointments` (oculta canceladas salvo opt-in), `getAgendaVisibleDays` (1 dia o la semana lunes-domingo segun la vista) y `moveAgendaAnchorDate` (avanza 1 dia o 7 segun la vista), con test node (`scripts/week-agenda-filter.test.mjs`).
- **UI de agenda (`WeekAgenda.tsx`, `App.css`).** Conmutador Dia/Semana (`aria-pressed`), navegacion `‹ Hoy ›` coherente con la vista, casilla "Mostrar canceladas" (ocultas por defecto), grilla parametrizada por `--week-day-count` (1 o 7 columnas) y encabezado de dia derivado del dia real. Refinamiento visual: paneles y tarjeta de acceso sin borde/redondeo.
- **Residencia.** Presentacion sobre datos ya residentes; sin nuevo contenido clinico.

Verificacion (rebanada 2): test node de filtros en verde (oculta/ muestra canceladas, semana lunes-domingo, navegacion dia vs semana), `tsc + vite build` del escritorio ok.

## Paso 21 - Plantillas clinicas asistidas por conversacion

| Campo | Definicion |
|---|---|
| Objetivo | Convertir la conversacion real de consulta en segmentos clinicos revisables, usando la plantilla activa del medico, sin guardar automaticamente la nota ni quitar control clinico al medico. |
| Requisitos relacionados | RF40, RNF01, RNF06, RNF07, RNF12, RNF14, RNF15. Extiende pasos 5, 8, 11, 15 y 16. |
| Entrada necesaria | App del medico con nota SOAP/plantillas existentes, consentimiento y trazas de IA, Whisper local real, respaldo nube gobernado y proveedores LLM listos para staging. |
| Skills IA recomendadas | `superpowers:writing-plans`, `superpowers:test-driven-development`, `codex-security:security-scan`, `ui-ux-pro-max`, `superpowers:verification-before-completion` |
| Se construye | Flujo de escriba clinico: consentimiento especifico, transcripcion de consulta, propuesta revisable de dialogo Medico/Paciente, seudonimizacion local, envio de transcript + plantilla a Gemini directo desde la app del medico, respuesta JSON validada por segmentos, vista de revision con confianza/fuentes y aplicacion manual a la nota. |
| Se valida con | El medico graba o carga audio, corrige el dialogo si hace falta, genera segmentos para la plantilla activa, ve fuentes/advertencias, aplica solo los segmentos aprobados y guarda la nota manualmente. La salida de IA queda trazada como BORRADOR. |
| Compuerta de avance | La IA no firma ni guarda notas automaticamente; el audio se descarta tras transcribir; el texto enviado a Gemini va seudonimizado; la nube de MiDoc no persiste contenido clinico; todo segmento aplicado requiere revision humana. |
| Push recomendado | Hacer push por rebanada cerrada y verificada; no mezclar editor de plantillas personalizadas con el primer MVP de acomodo. |

Clasificacion de datos: audio, transcript, dialogo y segmentos son CLINICO y viven en la base local cifrada o como bytes transitorios. Las trazas de proveedor/costo son OPERATIVO local y solo se reportan al portal por referencia, sin input/output clinico.

Avance (2026-06-15): MVP de escriba implementado en `desktop-app` con consentimiento `CONSULTATION_SCRIBE`, estructuracion `CONSULTATION_STRUCTURING`, turnos revisables, aplicacion manual por segmento y editor local de plantillas personalizadas en base cifrada (`app_meta`), sin migracion nueva ni persistencia clinica en nube.

Avance (2026-06-16): rebanada de evidencia de revision agregada; cada segmento muestra fuentes legibles del dialogo y el backend rechaza salidas de proveedor con `source_turns` inexistentes o segmentos sin fuentes ni advertencia explicita.

Avance (2026-06-16): grabacion directa desde la consulta agregada; la app captura microfono, codifica un WAV mono 16 kHz en memoria y reutiliza el mismo flujo de transcripcion, sin persistir el audio.

Estado (2026-06-16): implementacion tecnica del MVP completa en PR #18. Pendiente antes de merge: aceptacion manual con grabacion real/WAV real en desktop, validacion de Gemini con `MIDOC_GEMINI_API_KEY` en staging y decision de mantener el PR como draft o pasarlo a ready-for-review.

Rebanadas:

- **Rebanada 1 — Contrato de plantilla y salida segmentada.** Definir el contrato local de segmentos para la plantilla activa: `segment_id`, etiqueta, instrucciones, contenido, confianza, turnos fuente, faltantes y advertencias. Validar la salida de IA antes de mostrarla.
- **Rebanada 2 — Dialogo Medico/Paciente revisable.** Convertir la transcripcion en turnos semi-automaticos, permitir correccion de hablante/texto y usar ese dialogo como entrada del acomodo. Si la separacion automatica falla, el medico puede corregir antes de llamar al LLM.
- **Rebanada 3 — Acomodo IA gobernado.** Nuevo uso de IA `CONSULTATION_STRUCTURING` bajo consentimiento `CONSULTATION_SCRIBE`; prompt versionado; fake determinista para pruebas; Gemini directo desde desktop en staging/produccion con seudonimizacion local y fallback configurado.
- **Rebanada 4 — Vista de revision y aplicacion manual.** Mostrar segmentos, confianza, fuentes y advertencias; permitir aplicar por segmento o descartar; nunca guardar ni firmar automaticamente. Al aprobar, cerrar la traza de IA como `APPROVED`; al descartar, `DISCARDED`.
- **Rebanada 5 — Editor de plantillas personalizadas.** Permitir que cada medico cree/edite plantillas locales con segmentos ordenados, obligatorios/opcionales e instrucciones para IA. Guardar localmente cifrado; no sincronizar contenido clinico ni estructura personalizada a la nube salvo decision futura explicita.

## Paso 22 - Diarizacion local (separacion de hablantes)

| Campo | Definicion |
|---|---|
| Objetivo | Separar la transcripcion de consulta en turnos de Medico y Paciente con un motor real de diarizacion local (sherpa-onnx), reemplazando la heuristica de alternancia del paso 21, sin enviar audio a la nube y sin quitar control al medico (los turnos siguen siendo corregibles a mano). |
| Requisitos relacionados | RF40, RNF06, RNF07, RNF12, RNF15. Extiende los pasos 15 (Whisper local) y 21 (escriba clinico). |
| Entrada necesaria | Transcripcion local real (paso 15) y dialogo revisable Medico/Paciente del escriba (paso 21 rebanada 2). |
| Skills IA recomendadas | `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion` |
| Se construye | Motor de diarizacion local con sherpa-onnx (crate `sherpa-rs`) tras el feature `diarization-local`: dos modelos ONNX (segmentacion derivada de pyannote-3.0 + embedding WeSpeaker CAM++) con descarga gestionada (checksum, progreso, reanudacion) hacia `app_data_dir/models/`; nucleo puro de fusion por solape temporal entre los segmentos de Whisper (con marcas de tiempo) y los tramos de hablante; comando gobernado `ai_diarize_consultation` que transcribe + diariza + fusiona y devuelve el dialogo en turnos; cableado en la pantalla de Atencion con control "Intercambiar medico/paciente"; degradacion sin bloqueo a la heuristica de turnos cuando faltan modelos o el motor nativo. |
| Se valida con | El medico descarga los modelos de separacion de voces, graba o carga una consulta de dos voces y obtiene el dialogo separado en turnos Medico/Paciente **offline**, los corrige si hace falta (o invierte roles con un clic) y los usa como entrada del acomodo. El audio sigue siendo transitorio (no se persiste). |
| Compuerta de avance | La diarizacion corre offline por defecto; el audio se decodifica en memoria y se descarta; sin los modelos o el feature nativo la consulta se transcribe igual (degradacion, no bloqueo); licencias de los modelos verificadas para distribucion comercial (rehospedaje de los `.onnx` y cadena de licencias) antes de empaquetar; `num_speakers` fijo en 2 (Medico/Paciente), el acompanante se corrige a mano. |
| Push recomendado | Hacer push por rebanada cerrada y verificada; la compilacion nativa real (`--features diarization-local`) se valida en staging con la cadena nativa instalada, igual que el binding de Whisper en el paso 15. |

Clasificacion de datos: audio, transcript, tramos de hablante y turnos son CLINICO y viven como bytes transitorios o en la base local cifrada. Los modelos ONNX son REFERENCIA publica (no PHI) y se comparten entre perfiles en `app_data_dir/models/`. Las trazas de proveedor/costo son OPERATIVO local (se reusa el uso `TRANSCRIPTION`).

sherpa-onnx trabaja **aparte** de Whisper (segundo motor paralelo, no un plugin): Whisper responde "que se dijo" (texto + marcas de tiempo) y sherpa-onnx "quien hablo cuando" (tramos de hablante); el pegamento es la fusion por solape temporal en Rust.

Rebanadas:

- **Rebanada 1 — Nucleo de fusion + gestor de descarga.** Nucleo puro y testeable de fusion (solape temporal, fusion de turnos contiguos, asignacion de roles: el primer hablante es el Medico) y gestor de descarga de los dos modelos ONNX (catalogo, checksum, reanudacion, holgura de disco), con comandos `diarization_model_status`/`download_diarization_model` y UI de descarga. Sin inferencia real.
- **Rebanada 2 — Provider sherpa-rs + fusion de extremo a extremo.** `sherpa-rs` opcional tras el feature `diarization-local` (real) con stub que degrada sin el feature; Whisper local extendido para exponer segmentos con marcas de tiempo; funcion gobernada `diarize_consultation` (consentimiento de voz, presupuesto, traza DRAFT, audio transitorio) que inyecta el diarizador; comando `ai_diarize_consultation`; cableado en Atencion con el control "Intercambiar medico/paciente"; degradacion sin bloqueo.

Estado (2026-06-18): Rebanada 1 y la parte no-nativa de la Rebanada 2 implementadas en `desktop-app`. Nucleo de fusion y gestor de descarga con pruebas (Rust por defecto en verde, clippy sin avisos nuevos); `tsc + vite build` limpio. La compilacion del binding nativo (`--features diarization-local`) y su verificacion de extremo a extremo con audio real de dos voces queda para staging con la cadena nativa (CMake/ONNX Runtime) instalada, igual que el binding real de Whisper en el paso 15. Pendiente antes de empaquetar: fijar checksums (`MIDOC_DIARIZE_*_SHA256`) y rehospedar los `.onnx` con verificacion de licencias para distribucion comercial.

Extension de UX (2026-06-19): la antigua seccion `Asistencia de IA` se separa
en `Transcripcion consulta`, dedicada solo a captura, transcripcion, correccion
de hablantes y revision. La transcripcion corregida se conserva como dato
CLINICO en SQLite cifrado, sin audio. `Ayuda IA` vive en la columna derecha
permanente de la Estacion Clinica y solo se habilita con una transcripcion
revisada; combina esa fuente con antecedentes, preconsulta y plantilla activa
para devolver SOAP, segmentos, posibilidades clinicas con compatibilidad
Alta/Media/Baja, estudios y tratamientos revisables. No usa porcentajes, no
aplica contenido automaticamente y no presenta `realtime_capable` como
streaming: mientras no exista un contrato incremental, el texto aparece al
finalizar la grabacion.

Extension de UX (2026-07-06): los resultados de la Ayuda IA dejan de ser un
listado unico con scroll y se organizan en cinco pestañas: Plantilla (SOAP o
plantilla personalizada seleccionada), Especialidad (segmentos `specialty.*`
de la plantilla propia del modulo, p. ej. general/familiar), Posibilidades
clinicas, Sugerencias (exploracion fisica, preguntas al paciente y estudios)
y Tratamiento (opciones + receta sugerida). Los antecedentes detectados y el
boton de descartar permanecen visibles bajo las pestañas porque son acciones,
no lectura. La particion plantilla/especialidad la resuelve
`splitAidSegments` con el target de la definicion activa; un segmento sin
definicion conocida cae a la pestaña Plantilla para no perder propuestas.

Extension (Ruta B, 2026-06-30 a 2026-07-01): la rebanada 3 del paso 15 (`CloudTranscriptionProvider` estilo Deepgram, `CloudConfig::from_env`, `MIDOC_CLOUD_STT_*`) queda **reemplazada** por la transcripcion en nube gobernada por el portal (plan detallado en `docs/superpowers/plans/2026-06-30-ruta-b-faseado.md`). El desktop ya no conoce ninguna clave de proveedor: el portal media la llamada (OpenAI), cobra por duracion autoritativa del WAV y devuelve texto (modo estandar) o turnos anonimos por hablante (modo diarizado). Selector de 3 vias en `Transcripcion consulta`: local (Whisper + sherpa-onnx, gratis), nube estandar y nube con hablantes. En nube con hablantes, el medico confirma el rol (Medico/Paciente/Acompanante/Otro) de cada hablante anonimo antes de continuar — el gate de roles bloquea "Marcar como revisada" hasta que todo hablante con texto tenga rol asignado. `ConsultationTurn` admite los 4 roles en toda la canalizacion (guardado, estructuracion SOAP, ayuda clinica), en TS y Rust.

Costo en creditos por transcripcion (autoritativo, lo fija el portal):

| Via | Formula | Ejemplo (15 min = 900s) |
|---|---|---|
| Local (Whisper + sherpa-onnx) | `0` creditos | `0` |
| Nube estandar | `ceil(duracion_segundos / 900)` | `1` credito |
| Nube con hablantes (diarizado) | `ceil(duracion_segundos / 600)` | `2` creditos |

El resto de usos de IA (SOAP asistido, ayuda clinica, preconsulta, etc.) sigue tarifado sobre el LLM base (Gemini): `+1` credito por invocacion, sin cambios.

Estado: F1 (portal, #28) + F2 (portal, #29) + F3 (desktop, cliente del portal, #31) + F4 (diarizacion: logica pura + Rust + UI de 3 modos y asignacion de roles) completas y con pruebas verdes (cargo + node). Pendiente, no bloqueante para el codigo: activacion del proveedor real con BAA firmado y ZDR verificado en staging (paso 16) — el gate `OPENAI_TRANSCRIPTION_ZDR_APPROVED` es auto-declarado (evita activacion accidental) y no verifica nada con OpenAI; la barrera real es legal/administrativa, no tecnica.

## Paso 23 - Anamnesis asistida: cuestionario de antecedentes desde la conversacion

| Campo | Definicion |
|---|---|
| Objetivo | Cuando el paciente no contesto (o contesto parcialmente) el cuestionario estructurado de antecedentes, el medico hace las preguntas durante la consulta y la IA propone las respuestas mapeadas al cuestionario (`patient_medical_history_versions`), campo por campo, para que el medico las revise, corrija y confirme — sin re-transcribir y sin romper la inmutabilidad por versiones ni el contrato compartido con el portal. |
| Requisitos relacionados | Extiende el paso 11 (IA gobernada), el paso 19 (preconsulta/reconciliacion) y la Ayuda IA del paso 22. Antecedente directo: `background_updates` de la Ayuda IA (2026-07-03), que solo cubre los 3 campos de texto libre (`allergies`, `medical_background`, `family_background`). |
| Entrada necesaria | Transcripcion revisada de la consulta (paso 21/22); contrato del cuestionario (`medicalHistoryFormat.ts`, espejo de `consultorio-app/src/lib/medical-history.ts`); flujo de reconciliacion existente (`reconcileMedicalHistories` / `applyConflictDecisions`). |
| Se construye | Extraccion gobernada (uso `CLINICAL_AID` o uso nuevo dedicado) que devuelve respuestas propuestas restringidas por esquema a las claves reales del cuestionario (`GroupDef`/`FieldDef`, incluidos `yesno`, `select` y estructuras como heredo-familiares), con cita del turno de conversacion que sustenta cada respuesta; UI de reconciliacion campo por campo que reusa el patron de conflictos de la preconsulta (valor actual vs. propuesto, aceptar/editar/descartar); guardado como nueva version con `source = DOCTOR_EDIT` (la IA NUNCA es fuente directa de una version) y trazabilidad del `run_id` de IA en la auditoria. |
| Se valida con | Un paciente sin cuestionario contestado llega a consulta; el medico le hace las preguntas hablando, genera la propuesta, revisa cada campo (acepta unos, corrige otros, descarta los no dichos), confirma, y el expediente queda con una version nueva correcta y auditada — sin haber tecleado las respuestas. |
| Compuerta de avance | Ninguna respuesta se guarda sin confirmacion explicita del medico; el esquema JSON rechaza claves fuera del contrato del cuestionario; cada respuesta propuesta cita el turno que la sustenta (sin cita, se marca como no confiable); la version guardada registra `source = DOCTOR_EDIT` y referencia al run de IA; los cambios de contrato del cuestionario se replican en ambas apps (regla existente del espejo). |
| Push recomendado | Por rebanada cerrada: (1) contrato de extraccion + validacion por esquema con pruebas puras, (2) UI de reconciliacion campo por campo, (3) guardado versionado + auditoria de extremo a extremo. |

Clasificacion de datos: las respuestas propuestas y confirmadas son CLINICO (solo base local cifrada); el contrato del cuestionario es REFERENCIA; la traza del run (costo, latencia, version de prompt) es OPERATIVO local, sin contenido clinico.

Decision de alcance que motiva este paso (2026-07-03): la Ayuda IA ya vuelca antecedentes dichos en conversacion a los 3 campos de texto libre del paciente, pero el cuestionario estructurado quedo deliberadamente fuera: tiene contrato compartido con el portal, tipado por campo y versionado inmutable con reconciliacion propia, y merece este diseno dedicado en lugar de un atajo.

## Paso 24 - Degradacion asistida de proveedor de IA (sobrecarga)

| Campo | Definicion |
|---|---|
| Objetivo | Cuando el proveedor de IA rechaza una solicitud por sobrecarga o limite de tasa (HTTP 503/429, timeouts de red agotados), el sistema se lo explica al medico en lenguaje claro ("es temporal, no es tu sistema") y le ofrece reintentar con el mismo modelo o generar con otro modelo/proveedor configurado — con consentimiento explicito, nunca como fallback silencioso. |
| Requisitos relacionados | Extiende el paso 11 (IA gobernada, capa multi-proveedor) y la Ayuda IA del paso 22. Respeta la decision existente (2026-07): NO degradar en silencio al proveedor fake porque el medico podria tomar un borrador de demostracion por una sugerencia clinica real. |
| Entrada necesaria | Ayuda IA operativa con proveedor real (Gemini directo, `MIDOC_GEMINI_API_KEY`); trazas de run que ya registran proveedor y modelo ganador. |
| Skills IA recomendadas | `superpowers:test-driven-development`, `superpowers:verification-before-completion` |
| Se construye | (1) Clasificacion tipada de errores del proveedor: `Overloaded { provider, model }` para 429/503/5xx transitorios y timeouts agotados, separada de errores permanentes (credenciales, solicitud invalida); reintento automatico con backoff dentro del proveedor antes de molestar al medico. (2) Error estructurado a traves de IPC (JSON con `code`) para que la UI decida por codigo, no parseando texto. (3) Catalogo de modelos/proveedores disponibles (`ai_list_text_models`): modelos Gemini (primario + `MIDOC_GEMINI_FALLBACK_MODELS`) y OpenAI como proveedor alternativo de texto (`OpenAiProvider`, chat completions con los mismos esquemas JSON y la misma canalizacion seudonimizada) cuando el entorno declara `MIDOC_OPENAI_API_KEY` **y** el gate de gobernanza auto-declarado `MIDOC_OPENAI_TEXT_ZDR_APPROVED=true` (espejo del patron `OPENAI_TRANSCRIPTION_ZDR_APPROVED` del portal; la barrera real es legal/administrativa del paso 16, el gate solo evita activacion accidental); el fake nunca se ofrece como alternativa y OpenAI nunca es el primario (la decision vigente del doc 11 mantiene Gemini por costo). (4) Override de modelo por ejecucion en los comandos de Ayuda IA y acomodo (`ai_generate_clinical_aid`, `ai_structure_consultation`); la traza registra el modelo realmente usado (ya existia). (5) Dialogo en Atencion: causa en lenguaje claro + reintentar / generar con alternativa / cancelar; la salida indica visiblemente el modelo que la produjo. |
| Se valida con | Con Gemini devolviendo 503, el medico ve el dialogo de sobrecarga (no un banner criptico), elige un modelo alternativo configurado y obtiene la ayuda clinica; la traza registra el modelo alternativo. Sin alternativas configuradas, solo se ofrece reintentar. |
| Compuerta de avance | Ningun cambio de proveedor/modelo ocurre sin eleccion explicita del medico; el fake jamas aparece como alternativa; los errores permanentes (401/403/400) NO muestran el dialogo de sobrecarga (piden revisar configuracion); los reintentos automaticos tienen tope (no bloquear la consulta); pruebas de clasificacion de errores y de catalogo en verde. |
| Push recomendado | Una rama corta unica (`v2/paso24-degradacion-proveedor-ia`); backend y UI caben en un PR revisable. |

Clasificacion de datos: el error del proveedor y el catalogo de modelos son OPERATIVO (sin contenido clinico); no se agrega ninguna superficie nueva de salida de PHI — el override reutiliza la misma canalizacion seudonimizada existente.

Motivacion (2026-07-04): en uso real, Gemini devolvio `503 Service Unavailable` durante una Ayuda IA y el medico vio el error crudo sin saber si era su sistema, su configuracion o algo temporal, y sin camino de accion. Este paso convierte esa falla externa en una decision informada del medico.

## Paso 25 - Base de medicamentos a escala (pipeline publico + catalogo mexicano)

| Campo | Definicion |
|---|---|
| Objetivo | Sustituir la semilla curada del paso 14 (65 ingredientes, 1,060 interacciones DDInter, 64 etiquetas — version `midoc-real-2026-06-14`) por una base de referencia con **licencia limpia para SaaS de pago**, generada de forma reproducible desde fuentes publicas y complementada con un catalogo mexicano de marcas comerciales (COFEPRIS / Compendio Nacional de Insumos), para que la verificacion de recetas reconozca lo que el medico realmente escribe. Un farmaco no reconocido hoy produce silencio que parece "sin interacciones": el peor modo de fallo en seguridad de medicacion. |
| Fuente primaria de interacciones | **ONChigh** (lista de interacciones de alta prioridad del panel ONC/Phansalkar): **dominio publico** (RAND cedio al gobierno de EE. UU. licencia mundial irrevocable). Era una de las dos fuentes de la Drug Interaction API de la NLM, discontinuada en enero 2024. Es una lista **por clase** de alta prioridad (lo que debe interrumpir al medico), no un catalogo exhaustivo — decision deliberada: reduce fatiga de alertas. Complementos de dominio publico: openFDA (etiqueta) y RxNorm/RxClass (normalizacion), ya en uso. Reemplaza a DDInter como fuente por defecto. |
| Requisitos relacionados | Extiende el paso 14 (DONE): el motor de verificacion, el importador transaccional versionado y los endpoints de actualizacion (`MIDOC_MEDICATIONS_URL` / `MIDOC_DDINTER_URL` / `MIDOC_OPENFDA_URL`, hoy sin configurar — el boton "Buscar actualizaciones" reinstala la misma semilla) ya existen; lo que falta es el contenido y el pipeline que lo genere. |
| Entrada necesaria | Formato CSV/JSON que consume `import_medication_reference` (medication.rs); manifest con fuentes de la semilla actual (`reference_data/manifest.json`); **fuente de interacciones ya decidida (ONChigh, dominio publico — ver decision abajo)**. |
| Skills IA recomendadas | `superpowers:writing-plans`, `superpowers:test-driven-development` |
| Se construye | (1) **Pipeline reproducible** (script versionado en el repo, corre fuera de la app): toma ONChigh como fuente de interacciones, valida y normaliza ingredientes contra RxNorm/RxClass, extrae etiquetas relevantes de openFDA y emite los tres artefactos en el formato del importador, con manifest de version, conteos y checksums. (2) **Capa mexicana de alias**: dataset marca comercial → ingrediente derivado de los registros sanitarios de COFEPRIS y el Compendio Nacional, integrado como filas adicionales del CSV de medicamentos (mismo mecanismo que los 173 alias manuales actuales, pero generado); incluye el mapeo español → ingles de ingredientes que las fuentes internacionales requieren. (3) **Publicacion y distribucion**: artefactos publicados en los endpoints `MIDOC_*_URL`; a escala real la base NO se empaqueta con `include_str!` (inflaria el binario decenas de MB) — se descarga tras la instalacion y la semilla curada queda solo como arranque offline. (4) **Escala y rendimiento**: minimos de importacion (`MIN_MEDICATIONS`/`MIN_INTERACTIONS`) recalibrados, indices en SQLite y verificacion de que `check_prescription` responde sin latencia perceptible con ~10^5 pares. |
| Se valida con | El medico pulsa "Buscar actualizaciones", descarga la base a escala y una receta escrita con marca mexicana (p. ej. "Tempra" + warfarina) produce la alerta con severidad y fuente citada, offline despues de la descarga; un farmaco del Compendio Nacional fuera de la semilla original ahora se reconoce. |
| Compuerta de avance | El pipeline es reproducible (misma entrada → mismos artefactos) y cita fuente, fecha y licencia de cada dataset en el manifest; **la fuente por defecto es de dominio publico (ONChigh/openFDA/RxNorm) y DDInter queda retirado salvo permiso comercial escrito**; la importacion pasa el vetting existente (transaccional, versionada, con minimos); la verificacion sigue funcionando offline y sin enviar la prescripcion a la nube. |
| Push recomendado | Por rebanada cerrada: (1) pipeline + artefactos generados con pruebas del formato, (2) capa mexicana de alias, (3) publicacion en endpoints + validacion a escala en la app. |

Clasificacion de datos: todos los artefactos son REFERENCIA publica (no PHI); el pipeline corre fuera de la app y nunca ve datos de pacientes; la prescripcion se sigue verificando localmente.

**Decision de fuente y licenciamiento (2026-07-07):** se eligio **ONChigh + openFDA + RxNorm/RxClass**, todas de dominio publico, como base por defecto para evitar el riesgo legal de raiz. Comparativa de las fuentes evaluadas:

- **ONChigh (ONC/Phansalkar)** — dominio publico. Elegida como primaria. Lista por clase de alta prioridad; usada por la NLM hasta 2024.
- **openFDA** — dominio publico (gobierno EE. UU.). Etiqueta como respaldo de texto. Ya en uso.
- **RxNorm / RxClass** — dominio publico (NLM). Normalizacion de ingredientes y clases. Ya en uso.
- **Thesaurus ANSM (Francia)** — publicado por agencia estatal, reutilizable, con niveles de severidad clinicos y extractor abierto; candidato de ampliacion, en frances.
- **DDInter** — **CC BY-NC (no comercial): descartada como fuente por defecto.** Solo utilizable con permiso comercial escrito de los autores/editor. La semilla actual del paso 14 ya incluye 1,060 pares de DDInter, asi que el riesgo existe desde hoy; parte de este paso es **retirar DDInter de la semilla empaquetada** salvo que se obtenga permiso.
- **TWOSIDES / nSIDES (Tatonetti)** — minado estadistico de FAERS; licencia no declarada con claridad y las asociaciones son señales estadisticas, no juicio clinico: no apto como alerta dura.
- **DrugBank** — comercial de pago (la via academica prohibe producto comercial). Escalon futuro solo cuando el volumen de clientes justifique el contrato, para catalogo exhaustivo.

La licencia de cada dataset se cita en el manifest. Cualquier cambio a una fuente no de dominio publico exige permiso escrito antes de publicar en los endpoints de produccion.

Rebanada 1 (2026-07-07): pipeline reproducible en TypeScript fuera de la app (`desktop-app/scripts/medication-reference/`), con TDD. Funciones puras `expandClassRule`/`expandRuleset` que convierten reglas ONChigh por clase en pares canonicos de ingredientes (espejando `normalize_name`/`canonical_pair` del motor, que NO cambia), deduplicando y conservando la severidad mas alta; emisor de `interactions.csv` (con columna `source` real, no DDInter), `medications.csv` y `manifest.json` con licencia por fuente y checksums SHA-256. Datos ONChigh curados a mano (subconjunto de alta prioridad verificable; `TODO(onchigh-full)` y `TODO(cofepris)` marcan lo pendiente). 15 pruebas en verde (`npm run test:medication`), incluida autoconsistencia (todo ingrediente de una regla existe en la base) y reproducibilidad.

Validacion clinica de la lista (2026-07-07): el medico reviso las reglas y aplico ajustes antes del swap: (1) aspirina sale de AINE y queda solo en Antiplaquetario (evita falsos positivos, p. ej. metotrexato + aspirina dosis baja; el sangrado con anticoagulante ya lo cubre Antiplaquetario); (2) estatinas divididas: simvastatina/lovastatina + inhibidor fuerte CYP3A4 = CONTRAINDICADO, atorvastatina = MAJOR (riesgo aumentado, no contraindicacion dura); (3) reglas nuevas de alto impacto: alopurinol/febuxostat + tiopurina (azatioprina/mercaptopurina) = CONTRAINDICADO, e IECA/ARA2 + AINE = MAJOR (deterioro renal, hiperpotasemia); (4) mensajes reforzados de IMAO (override clinico para linezolid) y metotrexato. Total: 20 reglas, 188 pares expandidos (61 CONTRAINDICADO, 127 MAJOR), 80 medicamentos. Cada decision quedo fijada con una prueba en `sources.test.ts`. Limite conocido: el "triple whammy" (IECA/ARA2 + diuretico + AINE, lesion renal aguda) es una interaccion de TRES farmacos y el motor solo empareja pares canonicos; queda como `TODO(triple-whammy)`, requiere extender `check_prescription` a reglas n-arias — decision pendiente del usuario.

Rebanada 2 (2026-07-07): ingest consciente de la fuente en Rust (`medication.rs`), aditivo y sin tocar el emparejamiento. `parse_interactions_csv` lee el formato del paso 25 conservando la fuente real y la descripcion (con `csv_fields_quoted` para descripciones entrecomilladas con comas); `parse_interactions` enruta por encabezado entre el formato nuevo y el DDInter heredado; `update_reference` usa el dispatcher. Resuelve el hallazgo de la rebanada 1 (`parse_ddinter_csv` hardcodeaba `source: "DDInter 2.0"`).

Triple whammy / reglas n-arias (2026-07-07): el usuario pidio el triple whammy "bien hecho". El motor empareja pares canonicos, asi que una interaccion de TRES clases (IECA/ARA2 + diuretico + AINE -> lesion renal aguda) no era expresable como par. Se extendio el motor a reglas de tres clases evaluadas por las CLASES presentes en la prescripcion (no expandiendo a tripletas de ingredientes): tabla `class_triple_interactions`, `TripleRow`/`TripleInteractionAlert`, `parse_triples_csv`, `canonical_triple`, `import_triples`, evaluacion en `check_prescription` y `SafetyReport.tripleInteractions` (alerta dura). En el pipeline: `TripleRule`, `expandTripleRuleset`, `toTriplesCsv`, clase Diuretico y dos reglas (IECA y ARA2). UI: `MedicationSafety.tsx` muestra la interaccion triple. Dispara solo cuando estan las tres clases (independiente del orden), no con dos.

Rebanada 4 / marcas comerciales MX (2026-07-07): capa de nombres comerciales mexicanos verificada contra multiples fuentes (PLM, Vademecum, Listado de Medicamentos de Referencia de COFEPRIS/gob.mx, Cuadro Basico del IMSS). `MEXICAN_BRANDS` en `sources.ts` mapea marca -> ingrediente (Sintrom, Tafil, Rivotril, Flanax, Dolac, Klaricid, Lipitor, Cozaar, Renitec, Lasix, Tempra, Losec…); `resolveBrands` (reference.ts) resuelve display/clase desde el catalogo y lanza si una marca apunta a un ingrediente inexistente (evita fallo silencioso de reconocimiento); `ADDITIONAL_INGREDIENTS` reincorpora genericos de primer nivel que el swap habia dejado fuera (paracetamol, omeprazol, metformina, amoxicilina…). La base empaquetada paso de 90 a 150 medicamentos (version onchigh-mx-2026-07-07). 34 pruebas Rust (incluida: la base reconoce marcas MX y una interaccion por marca dispara — Sintrom+Flanax) + 72 TS. Verificado en el navegador: tecleando puras marcas (Sintrom+Flanax) la UI dispara la interaccion citando ONChigh, y una marca inventada sale como "no reconocido". Motivacion: el swap a ONChigh (rebanada 3) habia reducido el reconocimiento de marcas; primer nivel en Mexico teclea nombres de farmacia, no principios activos. `TODO(cofepris-full)`: completar desde el registro sanitario. Sigue pendiente (ops): publicar en endpoints MIDOC_*_URL.

Rebanada 3 / data swap (2026-07-07): tras la validacion clinica del usuario, la base ONChigh generada reemplazo la semilla en `src-tauri/src/reference_data/` (`medications.csv`, `interactions.csv`, `triples.csv`, `manifest.json`); **se elimino `ddinter.csv`** (los 1,060 pares CC BY-NC), cerrando el riesgo legal en un SaaS de pago. La semilla empaquetada (`BUNDLED_*`, version `onchigh-2026-07-07`) instala esta base: 90 medicamentos, 188 pares (61 CONTRAINDICADO, 127 MAJOR) y 2 tripletas, todo citando ONChigh. 33 pruebas de Rust del modulo (incluidas: sin fuente DDInter en la base, marca->ingrediente citando ONChigh, y triple whammy end-to-end desde la base empaquetada), 70 pruebas TS, `cargo clippy --lib` sin advertencias. Pendiente (ops, no codigo): publicar los artefactos en los endpoints `MIDOC_*_URL` (incluido `MIDOC_TRIPLES_URL`) para actualizacion post-instalacion.

## Paso 26 - Perfil dentista completo (paridad Dentis365 + IA dental)

| Campo | Definicion |
|---|---|
| Objetivo | Llevar el perfil de odontologia del nivel "nota dental estructurada" (paso 8) al nivel de un sistema dental dedicado (referencia: Dentis365), reconociendo que el dentista trabaja con las manos y no con una consulta hablada: su nota es el odontograma, su plan es multi-sesion con presupuesto y saldos, y su flujo depende de laboratorio e imagenes. La IA dental NO es transcripcion de consulta ni diferencial: es dictado manos-libres al odontograma/periodontograma, generacion de nota de evolucion desde lo capturado, indicaciones post-operatorias e integracion del plan presupuestado. |
| Investigacion base | Dentis365 (2026-07-09): odontograma inicial/actual + pediatrico, periodontograma, indice de placa con calculo automatico, imagenes por tratamiento, diagnostico integral con presupuestos alternativos y saldos por paciente, ordenes de laboratorio, caja/facturacion, agenda con recordatorios. Lo ya cubierto por MiDoc: odontograma/periodontograma/plan (paso 8), caja y cobros (paso 10), agenda y recordatorios (pasos 3/7), recetas con verificacion (pasos 14/25), imagenes/documentos (pasos 6/13). Brechas reales: odontograma visual, indice de placa, presupuesto con saldos por avance, ordenes de laboratorio, IA dental. |
| Requisitos relacionados | RF22, RF24, RF36, RNF10; extiende pasos 8 (payload dental), 10 (caja), 15 (Whisper local), 21 (scribe por plantilla). |
| Entrada necesaria | Paso 8 DONE (payload `DentalPayload` en `clinicalProfiles.ts` con odontograma/periodontograma/plan); caja local del paso 10; pipeline Whisper del paso 15; patron de segmentos revisables del paso 21. |
| Skills IA recomendadas | `superpowers:writing-plans`, `impeccable`, `ui-ux-pro-max`, `superpowers:test-driven-development` |
| Se construye | Todo en la app del medico (clase CLINICO/OPERATIVO, nada toca la nube): (1) odontograma visual interactivo con denticion adulta y pediatrica/mixta, (2) indice de placa (O'Leary) con calculo automatico, (3) plan de tratamiento presupuestado con alternativas, aceptacion, avance por sesion y saldos integrados a la caja, (4) ordenes de laboratorio dental, (5) capa IA dental gobernada (dictado al odontograma, nota de evolucion generada, indicaciones post-operatorias). |
| Se valida con | Un dentista atiende una cita completa: marca hallazgos en el odontograma visual (o los dicta por voz y los confirma), captura indice de placa, genera plan presupuestado que el paciente acepta, cobra un abono que queda en caja con saldo actualizado, levanta una orden de laboratorio y cierra la nota con evolucion generada por IA revisada. |
| Compuerta de avance | El flujo dental manual completo funciona sin IA (regla: la IA nunca es dependencia del flujo clinico); toda salida de IA pasa por revision y confirmacion del dentista; los montos cuadran contra la caja del paso 10 sin doble contabilidad. |
| Push recomendado | Por rebanada cerrada, ramas `v2/paso26-<rebanada>` hacia `dev`. |

Clasificacion de datos: odontograma, periodontograma, indice de placa, plan y evolucion = CLINICO (solo local cifrado); presupuestos, saldos, abonos y ordenes de laboratorio = OPERATIVO (solo local); nada de este paso se persiste en la nube ni viaja a proveedores de IA sin la seudonimizacion y consentimiento del paso 11.

### Rebanadas verticales

**Rebanada 1 — Odontograma visual interactivo.** Hoy el odontograma son tarjetas con selects por pieza (`DentalNoteEditor.tsx`); Dentis365 y todo software dental lo presentan como grafico bucal. Se construye un componente SVG con las dos arcadas (notacion FDI, la ya usada en `DENTAL_TOOTH_IDS`), cada pieza con sus 5 superficies clicables, codigo de color por estado (sano/caries/restaurado/ausente/corona/etc.), vista inicial vs. actual, y soporte de denticion pediatrica/mixta (piezas 51-85). El payload `DentalPayload` existente se conserva — es solo una capa de presentacion nueva sobre el mismo modelo, alineada con el rediseño D1 (manda la plantilla). Las tarjetas actuales quedan como vista de detalle al seleccionar pieza.

**Rebanada 2 — Indice de placa (O'Leary).** Nueva seccion del payload dental: por pieza, marcar superficies con placa; el porcentaje (superficies con placa / superficies presentes x100) se calcula automaticamente excluyendo piezas ausentes. Historico por encuentro para mostrar evolucion de higiene. Extiende `coerceDentalPayload` de forma retrocompatible (payloads viejos sin la seccion siguen validando).

**Rebanada 3 — Plan de tratamiento presupuestado con saldos.** Extiende `TreatmentPlanItem` con precio unitario y permite agrupar partidas en un **presupuesto** con alternativas (p. ej. amalgama vs. resina vs. corona), estado (propuesto/aceptado/rechazado), total y descuento. Al aceptar, el presupuesto se convierte en el plan activo: cada sesion registra procedimientos realizados y **abonos** que se asientan en la caja del paso 10 (mismo mecanismo de cobro/recibo, sin duplicar contabilidad), manteniendo el **saldo por paciente** visible en el expediente. Reportes: tratamientos pendientes vs. realizados y saldos por cobrar.

**Rebanada 4 — Ordenes de laboratorio dental.** Alta de orden vinculada a paciente y pieza/tratamiento: tipo de trabajo (corona, protesis, guarda...), laboratorio destino, fecha de envio, fecha prometida, estado (enviada/recibida/entregada al paciente), costo y notas. Lista con pendientes por recibir para que nada se pierda entre sesiones. Todo local (OPERATIVO).

**Rebanada 6 — Diseño anatomico del odontograma (pedida 2026-07-09).** El glifo generico de 5 superficies de la rebanada 1 se sustituye por siluetas SVG que parecen dientes reales: forma por tipo de pieza (incisivo, canino, premolar, molar) segun su numero FDI, corona vista desde oclusal con las superficies como zonas anatomicas, raices sugeridas en la vista de arcada y curvatura de arcada en lugar de filas rectas. Sin cambio de payload ni de interaccion: mismas superficies clicables, mismos marcadores; solo mejora la capa visual (`OdontogramChart.tsx` + CSS).

**Rebanada 5 — IA dental gobernada.** Sobre la gobernanza del paso 11 y el pipeline local del paso 15/21, tres capacidades opt-in con revision obligatoria: (a) **dictado manos-libres al odontograma/periodontograma** — el dentista explora con guantes y dicta "18 caries oclusal, 17 amalgama, 16 ausente" o la secuencia de bolsas "3-2-3, 4-3-4"; Whisper local transcribe y un parser (determinista primero, LLM como fallback) propone marcas que el dentista confirma en lote, con el patron de segmentos revisables del paso 21; (b) **nota de evolucion generada** desde lo capturado en la sesion (cambios del odontograma, procedimientos del plan realizados, materiales), redactada por el LLM gobernado y editable antes de firmar; (c) **indicaciones post-operatorias** por procedimiento (extraccion, endodoncia, cirugia) en lenguaje llano para el paciente, sobre plantillas revisadas. Explicitamente fuera de alcance: analisis de radiografias por IA (requiere modelos de vision especializados y carga regulatoria; se registra como fase futura, no se implementa).

Orden recomendado: 1 → 3 → 5a → 2 → 4 → 5b/5c. El odontograma visual es la base de todo lo demas; el presupuesto con saldos es el mayor valor de negocio frente a Dentis365; el dictado por voz es el diferenciador IA que ningun competidor local-first ofrece.

Rebanadas 5b/5c (2026-07-09): nota de evolucion e indicaciones post-operatorias, entregadas en `v2/paso26-odontograma-visual`. **5b — Nota de evolucion**: doble via respetando la regla "la IA nunca es dependencia". Via determinista `dentalEvolution.ts` (`buildDentalSessionSummary`): resume lo capturado en la sesion — hallazgos por pieza, indice de placa con clasificacion, condiciones activas, plan con estados, higiene y proxima revision — en espanol listo para insertar. Via IA gobernada: nuevo uso `DENTAL_EVOLUTION` en el carril de texto del paso 11 (`ai.rs`: TEXT_USAGES, prompt `dental-evolution/v1`, brazo del FakeProvider), donde el payload dental de la nota entra al contexto SOLO para este uso (los demas asistentes no lo arrastran, probado); misma gobernanza: consentimiento TEXT_ASSIST obligatorio (el panel ofrece registrarlo si falta), seudonimizacion, corrida DRAFT trazada, presupuesto. El borrador (cualquiera de las dos vias) es editable y se inserta explicitamente en O · Objetivo. **5c — Indicaciones post-operatorias** (`postOpInstructions.ts`): 7 plantillas curadas en lenguaje llano (extraccion, endodoncia, restauracion, corona/protesis, implante, cirugia, limpieza), sugeridas de forma determinista desde el plan de tratamiento por palabras clave (prioriza partidas realizadas/en progreso), componibles con checkboxes e insertadas en Indicaciones al paciente; sin IA (la personalizacion queda en el asistente de instrucciones del paso 11). UI `DentalNoteAids.tsx` en el modulo dental, deshabilitada con nota firmada. Verificado en navegador: resumen sin IA correcto desde dictado+plan, insercion en Objetivo e Indicaciones comprobada en la nota SOAP, via IA bloqueada sin consentimiento y funcionando tras registrarlo (borrador con proveedor/modelo visibles). 1 prueba Rust nueva (241) + 4 TS (93) + tsc + clippy + build en verde. Con esto el paso 26 queda completo.

Rebanada 6 (2026-07-09): diseño anatomico del odontograma, entregado en `v2/paso26-odontograma-visual`. El glifo generico de la rebanada 1 ahora parece diente real **sin cambiar payload ni interaccion**: las mismas 5 zonas clicables del espacio 40x40 se recortan (clipPath) con la silueta de la corona vista desde oclusal segun el tipo de pieza — molar cuadrado lobulado con fisuras en H, premolar ovalo vestibulo-lingual con surco central, canino punta redondeada con cresta, incisivo banda mesio-distal delgada con borde incisal. Logica pura nueva en `odontogramModel.ts`: `toothType` por digito de posicion FDI (en temporales las posiciones 4/5 son molares, no premolares) y `archCurveOffset` (curvatura de arcada: las filas se curvan una hacia la otra, maximo al centro, cero en extremos). Raices sugeridas hacia afuera de la boca (arriba en superiores, espejadas abajo en inferiores; molares con raiz doble), atenuadas en ausentes/extraccion indicada y en color primario en implantes. Verificado en navegador: siluetas por tipo en denticion adulta y mixta (52 piezas sin colisiones), clic en superficie sigue ciclando estados bajo el clip, marcadores (X, corona, implante) legibles, tema claro y oscuro correctos. 2 pruebas TS nuevas (89 totales) + tsc + build en verde; sin cambios en Rust.

Rebanada 4 (2026-07-09): ordenes de laboratorio dental, entregado en `v2/paso26-odontograma-visual`. Tabla OPERATIVO `dental_lab_orders` (migracion v23): orden vinculada a paciente y pieza/encuentro con tipo de trabajo, laboratorio destino, fecha prometida, costo y notas. Ciclo de vida con transiciones validadas en el motor (`dental.rs`): POR ENVIAR → ENVIADA → RECIBIDA → ENTREGADA, cancelable antes de entregar, sin retrocesos, y cada transicion sella su fecha (enviada/recibida/entregada). 4 comandos Tauri (`dental_*_lab_order*`) con espejo en el mock del navegador; helpers `dentalLab.ts` (transiciones validas para que la UI solo pinte botones legales, deteccion de vencidas — fuera del consultorio despues de su fecha prometida — y borrador validado) con 4 pruebas node. UI en dos lugares: `DentalLabPanel.tsx` en el modulo dental (alta y seguimiento por paciente, chip "Vencida") y seccion "Laboratorio: pendientes por recibir" en **Recepcion y caja** (global, con nombre de paciente, ordenada por fecha prometida) para que ningun trabajo se pierda entre sesiones. Verificado en navegador: alta de corona de zirconia con fecha prometida vencida → chip Vencida; marcada enviada aparece en pendientes de Recepcion; recibida y entregada muestra el rastro completo de fechas y desaparece de pendientes. 3 pruebas Rust nuevas (240 totales) + 4 TS (87 totales) + tsc + clippy + build en verde.

Rebanada 2 (2026-07-09): indice de placa de O'Leary, entregado en `v2/paso26-odontograma-visual`. Payload dental extendido de forma **retrocompatible** con la seccion `plaque` (caras M/D/V/L con placa por pieza; `coerceDentalPayload` filtra caras invalidas — la oclusal no participa del O'Leary clasico — y los payloads viejos validan igual). Modulo puro `plaqueIndex.ts`: `togglePlaqueSurface` inmutable, `computePlaqueIndex` (porcentaje = caras con placa / piezas presentes x4, un decimal; las piezas AUSENTES salen del denominador y sus marcas del numerador; null sin division entre cero) y clasificacion O'Leary (<=10% Ideal, <=20% Aceptable, >20% Deficiente). **Evolucion de higiene entre consultas**: comando `dental_specialty_history` (dental.rs) devuelve la ultima version de nota por encuentro del paciente y la UI calcula el porcentaje historico con la misma funcion pura que la captura en vivo. UI `PlaqueIndexPanel.tsx` en el modulo dental: cuadricula V/M/D/L clicable por pieza con toggle de denticion, porcentaje y clasificacion en vivo, piezas ausentes tachadas y deshabilitadas, y linea de evolucion (fecha: % ... hoy: %). Verificado en navegador: 5 caras marcadas = 3.9% (5/128); al dictar "16 ausente" el indice recalculo a 0.8% (1/124) con la pieza tachada; evolucion muestra la consulta previa (6.3%) y el valor de hoy; nota guardada. 6 pruebas TS nuevas (83 totales) + 1 Rust (237) + tsc + clippy + build en verde.

Rebanada 5a (2026-07-09): dictado manos-libres al odontograma/periodontograma, entregado en `v2/paso26-odontograma-visual`. El corazon es un **parser determinista** en espanol (`dentalDictation.ts`, sin LLM — gramatica fija y auditable; el fallback LLM queda para cuando el paso 16 cablee proveedores reales): segmenta por numero de pieza FDI (robusto a la falta de comas de Whisper), entiende numeros hablados ("dieciocho", "treinta y ocho"), superficies simples/compuestas/siglas ("mesio-oclusal", "MOD"), estados de superficie (caries/resina/amalgama/sellador/fractura), estados de pieza (ausente/corona/implante/endodoncia/extraccion indicada) y periodonto ("bolsas 3 2 3 4 3 4", "movilidad 2", "furca 1"; los valores de bolsas no abren segmentos de pieza). Lo no entendido sale como "Sin interpretar" y **nunca se aplica**. UI `DentalDictationPanel.tsx` dentro del editor dental: textarea (el flujo no depende de IA — se puede teclear), microfono opcional que graba WAV y transcribe con **Whisper local** via `ai_transcribe_audio` (gobernado: bloqueado sin consentimiento de voz del paciente, corrida trazada, audio descartado), propuestas con checkbox (patron de segmentos revisables del paso 21) y aplicacion en lote via `applyProposals` puro. Verificado en navegador: dictado tecleado "18 caries mesio-oclusal, 17 amalgama, 16 ausente, dieciseis bolsas 3 2 3 4 3 4 movilidad 2" produjo 5 propuestas correctas, aplicadas marcaron odontograma (caries M+O, restaurado, X ausente) y periodontograma (bolsas y movilidad), nota guardada; microfono correctamente deshabilitado sin consentimiento con aviso. 14 pruebas nuevas del parser (77 TS totales) + tsc + build en verde.

Rebanada 3 (2026-07-09): plan de tratamiento presupuestado con saldos, entregado en `v2/paso26-odontograma-visual`. Decision de diseño (desviacion deliberada del plan original): los precios NO se agregaron a `TreatmentPlanItem` — el payload clinico queda sin dinero y los montos viven en tablas OPERATIVO propias (`dental_budgets`, `dental_budget_items`, migracion v22 de db.rs), mejor separacion de residencia. Motor en `dental.rs` (Rust): crear presupuesto con partidas/descuento validados, decidir (aceptar/rechazar; aceptar auto-rechaza a las alternativas propuestas del mismo grupo — los presupuestos creados en el mismo encuentro comparten grupo), avance por partida solo en presupuestos aceptados (COMPLETED sella fecha), y saldo por paciente sobre aceptados. Los abonos se asientan por la caja del paso 10: `payments` gano columna `budget_id` y `register_payment` valida contra el presupuesto (solo aceptados, abono ≤ saldo, reembolso ≤ abonado) — una sola contabilidad, el recibo con folio sale de caja. 5 comandos Tauri (`dental_*`), espejo completo en el mock de navegador (con libro de abonos acumulado que sobrevive reaperturas de caja), helpers puros `dentalBudget.ts` (parseo de montos MXN, borrador desde el plan dental, validacion en espanol) con 6 pruebas node, y panel `DentalBudgetPanel.tsx` en el modulo odontologico (operativo: se puede cobrar aun con la nota firmada). Verificado en navegador: presupuesto desde el plan ($1,500), aceptar, abono de $500 con recibo R-000001 asentado en Recepcion y caja, saldo $1,000, partida marcada Realizado, y sobreabono de $2,000 rechazado con mensaje. 63 pruebas TS + 236 Rust + build en verde. Bug corregido durante verificacion: leer `event.currentTarget` dentro de updaters de estado de React (se anula tras el handler) tumbaba el panel; los valores ahora se capturan antes.

Rebanada 1 (2026-07-09): odontograma visual interactivo entregado en `v2/paso26-odontograma-visual`. Logica pura en `odontogramModel.ts` (denticion temporal FDI 51-85, filas por denticion adulta/mixta/infantil con temporales al centro, orientacion clinica de superficies —vestibular hacia afuera, mesial hacia la linea media, espejado por cuadrante—, ciclado de estado por clic, marcadores clasicos: X ausente, / extraccion indicada, circulo corona, triangulo endodoncia, poste implante, e `inferDentition` que abre la vista segun las piezas con hallazgos) con 11 pruebas en `node --test`. Componente SVG `OdontogramChart.tsx`: glifo de 5 superficies clicables por pieza (clic cicla Sano→Caries→Restaurado→Sellador→Fractura), numero abre la tarjeta de detalle existente (que pasa de grilla de 32 tarjetas a vista de detalle de la pieza seleccionada), toggle de denticion, linea media entre cuadrantes, leyenda, tooltip/aria-label con resumen en espanol. El payload `DentalPayload` NO cambio: es solo capa de presentacion, retrocompatible con notas dentales existentes. Verificado en navegador (mock): ciclado de superficie, seleccion, denticion mixta (52 piezas), marcador de ausente, guardado de nota con nueva version y tema claro/oscuro. 57 pruebas TS + tsc + build en verde.

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
