# 09 - Contraste del sistema anterior contra V2

## Metodo de revision

Se revisaron documentos del sistema anterior, rutas de la aplicacion, componentes, servicios, modelos Prisma y migraciones. El objetivo fue detectar funciones reales que pudieran perderse al redisenar V2 y contrastarlas contra los requerimientos actuales.

## Resumen ejecutivo

La V2 ya cubria el nucleo clinico: registro, login, perfil publico, agenda, expediente, portal paciente, documentos clinicos, SMS, correo, recuperacion de cuenta, medicina familiar/general y odontologia. La segunda verificacion encontro funciones que estaban presentes o muy claras en V1, pero que necesitaban quedar explicitas en la lista V2:

- Retencion temporal del horario para evitar doble reserva durante agendado.
- Paginas legales y aceptacion de terminos/privacidad.
- Cierre, firma y versionado de nota clinica.
- Resumen autorizado descargable para el paciente.
- Consulta sin cita previa o encuentro clinico independiente.
- Resumen longitudinal, brechas clinicas e instrucciones al paciente con IA.
- Observabilidad, healthchecks y limpieza de trabajos temporales.
- Rate limit, bloqueo progresivo y verificacion anti-abuso en flujos publicos.

## Matriz de contraste

| Area detectada en V1 | Evidencia revisada | Cobertura V2 actual | Estado | Decision |
|---|---|---|---|---|
| Perfil publico del medico y servicios | Rutas publicas por slug, disponibilidad publica y servicios | RF03, RF04, RF05 | Cubierto | Conservar en V2 inicial. |
| Agendado publico | Rutas de agenda publica, confirmacion y accion por token | RF05, RF07, RF16, RF21 | Cubierto | Conservar como entrada principal del paciente. |
| Retencion temporal de horario | Servicios y rutas de hold de disponibilidad | RF34 | Brecha cerrada | Agregar como requisito explicito para evitar doble reserva. |
| Confirmar, cancelar y reagendar por enlace | Rutas de accion publica por token | RF07, RF21 | Cubierto | Mantener con tokens seguros y enlaces cortos por SMS. |
| Registro/login medico | Rutas auth, sesiones, logout y refresh | RF01, RF02, RNF01 | Cubierto | Mantener con sesiones seguras. |
| Politica de contrasena y bloqueo | Servicios de password policy, rate limit y lockout | RNF12, RNF14 | Brecha cerrada | Integrar como requisito no funcional de seguridad. |
| Recuperacion de cuenta | Necesidad V2 y soporte de correo transaccional | RF33, RNF12 | Cubierto | Mantener por correo con token de un solo uso. |
| Paginas legales y aceptacion | Rutas de terminos, privacidad y aceptacion legal | RF35, RNF06 | Brecha cerrada | Registrar version y evidencia de aceptacion. |
| Portal paciente | Rutas auth patient, citas, documentos y precheckin | RF06, RF08, RF15, RF19 | Cubierto | Mantener como continuidad del paciente. |
| Descarga de resumen por paciente | Ruta de descarga de cita/resumen | RF37 | Brecha cerrada | Agregar resumen autorizado descargable. |
| Precheckin | Rutas y modelos de respuestas previas | RF08 | Cubierto | Mantener antes de consulta. |
| Expediente clinico | Modelos de paciente, expediente, notas e historial | RF09, RF10, RF11, RF15 | Cubierto | Conservar integrado a la cita. |
| Consulta sin cita | Encuentros clinicos independientes | RF38 | Brecha cerrada | Diferir a V2 operativa, util para espontaneos. |
| Nota SOAP | Workspace clinico y rutas de encuentros | RF12 | Cubierto | Mantener como formato base. |
| Firma/cierre/versionado de nota | Modelos de versionado y cierre clinico | RF36, RNF02 | Brecha cerrada | Hacerlo requisito prioritario. |
| Receta e indicaciones | Rutas y flujos de receta/instrucciones | RF14 | Cubierto | Mantener para ambos perfiles clinicos. |
| Estudios y documentos clinicos | Uploads de medico y paciente por token | RF19, RF20, RNF09 | Cubierto | Mantener con permisos, expiracion y auditoria. |
| Enlaces cortos | Rutas de redireccion, analitica y limpieza | RF21, RNF13 | Cubierto ampliado | Conservar para SMS y controlar expiracion/uso. |
| Notificaciones SMS | Servicios de mensajeria y recordatorios | RF16, RF21 | Cubierto | Canal transaccional principal para recordatorios. |
| Notificaciones por correo | Proveedor de correo y destinatarios de notificacion | RF32 | Cubierto | Usar para recuperacion, respaldo y eventos transaccionales. |
| Medicina familiar/general | Payloads clinicos y alcance confirmado | RF22, RF23 | Cubierto | Mantener como perfil base. |
| Odontologia | Payload dental, odontograma y periodontograma | RF22, RF24 | Cubierto | Mantener como segundo perfil V2. |
| Otras especialidades | Payloads y plantillas de otras especialidades | RNF10 | Omitido intencional | No entran por ahora. |
| IA SOAP e insights | Servicios de IA, trazas, feedback y creditos | RF13, RF29 | Cubierto parcial | Mantener IA como apoyo, no como bloqueo. |
| Capa multi-proveedor IA | Necesidad de comparar GPT/OpenAI, Deepgram y alternativas medicas | RF41, RNF15 | Brecha cerrada | Implementar abstraccion para LLM, transcripcion, benchmark y fallback. |
| Resumen longitudinal, brechas e instrucciones IA | Rutas de gaps, resumen e instrucciones | RF39 | Brecha cerrada | Diferir a V2 IA clinica con revision medica. |
| Dictado/transcripcion clinica | Servicios de transcripcion | RF13, RF40 | Diferido | No depender de esto para V2 inicial; implementarlo con consentimiento, revision humana y trazabilidad. |
| Lista de espera | Rutas admin y ofertas al paciente | RF25 | Diferido | Mantener en roadmap operativo. |
| Recepcion | Rutas de estados operativos y panel de recepcion | RF26 | Diferido | Mantener para V2 operativa. |
| Caja diaria | Rutas de cierre, entradas y checkout | RF26, RF30 | Diferido | Mantener para consultorios presenciales. |
| Pagos, recibos, depositos | Checkout, webhooks, recibos y conciliacion | RF17, RF30 | Diferido | Mantener, pero despues del nucleo clinico. |
| Recursos fisicos | Rutas y modelos de recursos asignables | RF27 | Diferido | Util para consultorios con salas/equipos. |
| Suscripcion y gating | Planes, capacidades y acceso comercial | RF28 | Diferido | Relevante para SaaS, no para levantar V2 clinica. |
| Creditos y gobierno IA | Creditos, trazas, resumen mensual y feedback | RF29 | Diferido | Activar antes de IA con costo real. |
| ARCO, retencion e incidentes | Rutas patient ARCO y compliance | RF31, RNF06 | Diferido | Debe existir antes de produccion formal. |
| 2FA y codigos de recuperacion | Rutas y servicios de seguridad avanzada | RF31 | Diferido | Endurecimiento posterior al flujo base. |
| Observabilidad y healthchecks | Rutas health, ready, request context y jobs | RNF13 | Brecha cerrada | Requisito no funcional para produccion. |
| Admin interno de clientes | Rutas internal-admin y clientes SaaS | RNF11 | Omitido intencional | No entra al foco medico/paciente. |
| Multi-clinica y secretarias | Modelos multi-doctor/clinica y roles operativos | RNF11 | Omitido intencional | Posponer por decision de alcance. |
| Funnel y atribucion | Backlog comercial y crecimiento | RNF11 | Omitido intencional | No aporta al levantamiento clinico inicial. |
| Teleconsulta | Backlog futuro | RNF11 | Omitido intencional | No entra en V2 presencial inicial. |
| Bot conversacional del canal anterior | Automatizaciones de canal anterior | RF16, RF21, RF32 | Reemplazado | Sustituir por SMS y correo transaccional. |

## Brechas cerradas en esta revision

| Brecha | Ajuste realizado |
|---|---|
| Hold temporal de agenda no estaba explicito | Se agrego RF34. |
| Legal/aceptacion estaba diluido en seguridad | Se agrego RF35. |
| Firma/cierre/versionado estaba en alcance pero no en RF | Se agrego RF36. |
| Descarga de resumen para paciente no estaba en RF | Se agrego RF37. |
| Consulta sin cita previa no estaba contemplada | Se agrego RF38 y se difiere a V2 operativa. |
| Resumen longitudinal/brechas/instrucciones IA no estaba explicito | Se agrego RF39 y se difiere a V2 IA clinica. |
| Observabilidad/jobs no estaba en RNF | Se agrego RNF13. |
| Anti-abuso publico/login/recuperacion no estaba en RNF | Se agrego RNF14. |

## Conclusiones

La lista V2 queda alineada con lo importante del sistema anterior sin arrastrar todo el crecimiento accidental. El nucleo recomendado para iniciar sigue siendo: medico familiar/general y dentista, paciente, agenda integrada con expediente, documentos clinicos, SMS, correo, recuperacion de cuenta, seguridad basica y legal.

Las funciones operativas y comerciales valiosas no se eliminan; quedan diferidas con nombre propio para que no se olviden: lista de espera, recepcion, caja, recursos, pagos avanzados, suscripcion, creditos IA, compliance avanzado y observabilidad productiva.
