# 04 - Validacion de requerimientos

## Criterios usados

| Criterio | Significado |
|---|---|
| Consistente | No contradice otros requerimientos ni el objetivo V2. |
| No ambiguo | Puede entenderse de una sola forma razonable. |
| Relevante | Aporta directamente al sistema o a la operacion clinica. |
| Verificable | Puede probarse mediante flujo, pantalla, API o revision documental. |
| Prioritario | Es importante para la primera version V2. |

## Matriz de validacion

| Requerimiento | Consistente | No ambiguo | Relevante | Verificable | Prioritario |
|---|---:|---:|---:|---:|---:|
| RF01 - Registrar medico | Si | Si | Si | Si | Si |
| RF02 - Iniciar sesion de medico | Si | Si | Si | Si | Si |
| RF03 - Configurar perfil publico del medico | Si | Si | Si | Si | Si |
| RF04 - Configurar servicios, horarios y disponibilidad | Si | Si | Si | Si | Si |
| RF05 - Agendar cita como paciente | Si | Si | Si | Si | Si |
| RF06 - Crear o vincular cuenta de paciente | Si | Si | Si | Si | Si |
| RF07 - Confirmar, cancelar o reagendar cita | Si | Si | Si | Si | Si |
| RF08 - Completar cuestionario previo o precheckin | Si | Si | Si | Si | Si |
| RF09 - Abrir paquete integrado de atencion clinica | Si | Si | Si | Si | Si |
| RF10 - Consultar expediente desde la cita | Si | Si | Si | Si | Si |
| RF11 - Crear o actualizar expediente durante la atencion | Si | Si | Si | Si | Si |
| RF12 - Capturar nota clinica SOAP | Si | Si | Si | Si | Si |
| RF13 - Generar apoyo de IA para nota o insights | Si | Si | Si | Si | Medio |
| RF14 - Emitir receta e indicaciones | Si | Si | Si | Si | Si |
| RF15 - Consultar historial del paciente | Si | Si | Si | Si | Si |
| RF16 - Enviar notificaciones por SMS | Si | Si | Si | Si | Medio |
| RF17 - Registrar cobro y recibo operativo | Si | Si | Si | Si | Medio |
| RF18 - Administrar seguridad, auditoria y consentimientos | Si | Si | Si | Si | Si |
| RF19 - Subir documentos clinicos al expediente o cita | Si | Si | Si | Si | Si |
| RF20 - Generar enlace temporal para carga de estudios por paciente | Si | Si | Si | Si | Si |
| RF21 - Generar enlaces cortos para SMS | Si | Si | Si | Si | Medio |
| RF22 - Configurar el perfil clinico como medicina familiar/general u odontologia | Si | Si | Si | Si | Si |
| RF23 - Documentar consulta familiar/general | Si | Si | Si | Si | Si |
| RF24 - Documentar consulta odontologica con odontograma, periodontograma y plan dental | Si | Si | Si | Si | Si |
| RF25 - Gestionar lista de espera y ofertas de espacios disponibles | Si | Si | Si | Si | Medio |
| RF26 - Gestionar recepcion, estados operativos de cita y caja diaria | Si | Si | Si | Si | Medio |
| RF27 - Gestionar recursos fisicos asignables a citas | Si | Si | Si | Si | Medio |
| RF28 - Gestionar suscripcion, planes, capacidades y acceso por paquete | Si | Si | Si | Si | Medio |
| RF29 - Gestionar creditos, uso, trazas y feedback de IA | Si | Si | Si | Si | Medio |
| RF30 - Gestionar recibos, depositos, anticipos y facturacion operativa | Si | Si | Si | Si | Medio |
| RF31 - Gestionar solicitudes ARCO, retencion de datos e incidentes de seguridad | Si | Si | Si | Si | Medio |
| RF32 - Enviar notificaciones transaccionales por correo | Si | Si | Si | Si | Medio |
| RF33 - Recuperar cuenta por correo con token seguro | Si | Si | Si | Si | Si |
| RF34 - Apartar horario temporalmente durante agendado para prevenir doble reserva | Si | Si | Si | Si | Si |
| RF35 - Gestionar paginas legales y aceptacion de terminos/privacidad | Si | Si | Si | Si | Si |
| RF36 - Cerrar, firmar y versionar nota clinica | Si | Si | Si | Si | Si |
| RF37 - Generar resumen autorizado descargable para el paciente | Si | Si | Si | Si | Medio |
| RF38 - Registrar consulta sin cita previa o encuentro clinico independiente | Si | Si | Si | Si | Medio |
| RF39 - Generar resumen longitudinal, brechas clinicas e instrucciones al paciente con apoyo de IA | Si | Si | Si | Si | Medio |
| RF40 - Transcribir consulta clinica por audio/voz con consentimiento, revision medica y trazabilidad | Si | Si | Si | Si | Medio |
| RF41 - Gestionar capa multi-proveedor de IA para LLM, transcripcion, benchmark y fallback | Si | Si | Si | Si | Medio |
| RNF01 - Proteger datos clinicos con autenticacion, roles y sesiones seguras | Si | Si | Si | Si | Si |
| RNF02 - Registrar trazabilidad de cambios clinicos y operativos | Si | Si | Si | Si | Si |
| RNF03 - Mantener interfaz clara, sobria y accesible | Si | Si | Si | Si | Si |
| RNF04 - Soportar uso movil para agendado y portal del paciente | Si | Si | Si | Si | Si |
| RNF05 - Permitir continuidad de consulta aunque falle la IA | Si | Si | Si | Si | Si |
| RNF06 - Mantener privacidad, retencion y consentimiento documentados | Si | Si | Si | Si | Si |
| RNF07 - Evitar duplicidad innecesaria entre agenda y expediente | Si | Si | Si | Si | Si |
| RNF08 - Presentar estados de error, carga y exito de forma comprensible | Si | Si | Si | Si | Medio |
| RNF09 - Proteger archivos clinicos con permisos, expiracion de enlaces y auditoria | Si | Si | Si | Si | Si |
| RNF10 - Mantener el alcance V2 inicial limitado a medicina familiar/general y odontologia | Si | Si | Si | Si | Si |
| RNF11 - Conservar capacidades heredadas sin obligar a implementarlas todas en el primer incremento | Si | Si | Si | Si | Si |
| RNF12 - Proteger recuperacion de cuenta con expiracion, un solo uso, rate limit y respuesta no enumerable | Si | Si | Si | Si | Si |
| RNF13 - Mantener observabilidad, healthchecks, trazas operativas y limpieza de trabajos programados | Si | Si | Si | Si | Medio |
| RNF14 - Proteger flujos publicos y de autenticacion con rate limit, bloqueo progresivo y verificacion anti-abuso | Si | Si | Si | Si | Si |
| RNF15 - Evaluar proveedores de IA con benchmark clinico, consentimiento, seguridad, costo, latencia, precision y cumplimiento | Si | Si | Si | Si | Medio |

## Observaciones de validacion

- RF09 es el requerimiento rector de V2 porque formaliza la union entre agenda y expediente.
- RF13 se considera prioridad media porque la consulta debe poder operar sin IA.
- RF16 y RF17 son importantes, pero pueden implementarse de forma incremental despues del flujo clinico integrado.
- RF19 y RF20 deben considerarse parte del flujo clinico integrado porque los estudios de laboratorio y documentos externos alimentan la consulta.
- RF21 se considera prioridad media porque mejora entregabilidad y confianza de SMS, pero depende de reglas tecnicas y operativas del proveedor de mensajeria.
- RF22, RF23 y RF24 fijan el alcance clinico de V2: medicina familiar/general y odontologia.
- RF25 a RF31 conservan capacidades reales de V1, pero varias pueden implementarse despues del paquete clinico inicial.
- RF32 agrega correo como canal transaccional complementario a SMS.
- RF33 es prioritario porque sin recuperacion de cuenta el soporte operativo queda fragil.
- RF34 explicita una capacidad critica del agendado publico: evitar que dos pacientes tomen el mismo horario durante el proceso.
- RF35 asegura que terminos, privacidad y aceptacion legal no queden como anexos tecnicos olvidados.
- RF36 se vuelve prioritario porque la nota clinica no debe quedar editable sin control despues del cierre.
- RF37 y RF38 se consideran prioridad media: agregan continuidad y flexibilidad operativa, pero no bloquean el flujo base si se calendarizan despues.
- RF39 se mantiene prioridad media porque depende de madurez de IA y gobierno clinico.
- RF40 se considera prioridad media y diferida porque requiere consentimiento explicito, manejo seguro de audio, revision humana y trazabilidad.
- RF41 evita acoplar MiDoc a un solo proveedor de IA; permite mantener GPT/OpenAI y Deepgram como base inicial, pero comparar OpenAI, MedLM, AWS HealthScribe, Deepgram, AssemblyAI y Nabla por caso de uso.
- RNF07 existe para evitar repetir el problema de separacion funcional detectado en V1.
- RNF09 evita que la carga de documentos clinicos se convierta en un canal inseguro o sin trazabilidad.
- RNF10 evita que el alcance vuelva a crecer con especialidades no priorizadas.
- RNF12 evita que la recuperacion de cuenta abra vectores de enumeracion, abuso o toma de cuenta.
- RNF13 evita que colas, enlaces temporales, recordatorios y jobs queden sin monitoreo al pasar a produccion.
- RNF14 protege los puntos publicos mas expuestos: agendado, login, recuperacion y enlaces de accion.
- RNF15 exige que la seleccion de IA se haga con evidencia propia del producto, no solo por marketing del proveedor.
