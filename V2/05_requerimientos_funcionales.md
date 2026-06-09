# 05 - Tabla de requerimientos funcionales

## Tabla "Que hace" / "Que necesita"

| Que hace? | Que necesita? |
|---|---|
| Registrar medico | Nombre, apellidos, correo, telefono, contrasena, aceptacion legal, especialidad y datos profesionales. |
| Iniciar sesion de medico | Correo, contrasena, sesion segura y validacion de estado activo. |
| Configurar perfil publico | Nombre profesional, especialidad, cedula, direccion, telefono, descripcion, servicios, precios y URL publica. |
| Configurar especialidad V2 | Medico, seleccion de medicina familiar/general u odontologia, servicios sugeridos y plantilla clinica asociada. |
| Configurar disponibilidad | Medico, dias de atencion, horario, duracion de consulta, bloqueos, servicios y reglas de anticipacion. |
| Configurar servicios del medico | Nombre del servicio, descripcion, precio, duracion estimada, estado activo y orden de visualizacion. |
| Agendar cita | Medico, servicio, fecha, horario, datos del paciente, contacto responsable, consentimiento y estado inicial. |
| Apartar horario temporalmente | Medico, servicio, fecha, horario, duracion, token de hold, expiracion, liberacion automatica y validacion de conflicto. |
| Crear o vincular cuenta de paciente | Nombre, telefono, correo, fecha de nacimiento, relacion con contacto, credenciales y expediente asociado. |
| Confirmar cita | Identificador de cita, token o sesion, estado actual y canal de confirmacion. |
| Cancelar cita | Identificador de cita, motivo opcional, reglas de cancelacion y actualizacion de disponibilidad. |
| Reagendar cita | Cita existente, nueva fecha, nuevo horario, disponibilidad valida y registro de cambio. |
| Completar preconsulta | Token o sesion de paciente, respuestas clinicas, antecedentes, sintomas, documentos y consentimiento. |
| Abrir paquete integrado de atencion clinica | Cita, paciente, expediente, preconsulta, historial, notas, receta, estudios clinicos, documentos, pagos y estado de atencion. |
| Consultar expediente desde la cita | Paciente vinculado, permisos del medico, historia clinica, notas previas, recetas, estudios clinicos, documentos y alertas. |
| Crear expediente desde una cita | Datos de paciente, medico responsable, cita origen y validacion de duplicados. |
| Actualizar expediente durante la atencion | Paciente, antecedentes, signos, diagnosticos, plan, documentos, versionado y auditoria. |
| Registrar consulta sin cita previa | Medico, paciente, expediente, motivo, fecha/hora de inicio, servicio opcional, estado clinico y relacion posterior con cita si aplica. |
| Subir documentos clinicos como medico | Cita o paciente, archivo, categoria, descripcion, permisos, almacenamiento seguro y registro de auditoria. |
| Habilitar carga de estudios por paciente | Cita, medico responsable, estado de habilitacion, vigencia, token o enlace temporal y reglas de expiracion. |
| Subir estudios mediante enlace temporal | Enlace valido, archivo, categoria, paciente o cita asociada, validacion de vigencia y confirmacion de carga. |
| Capturar nota SOAP | Cita, subjetivo, objetivo, evaluacion, plan, responsable clinico y estado de cierre. |
| Cerrar, firmar y versionar nota clinica | Nota, medico responsable, fecha de cierre, firma o identificacion profesional, version anterior, motivo de correccion y auditoria. |
| Documentar consulta familiar/general | Factores de riesgo, antecedentes, revision por sistemas, exploracion fisica, laboratorios, tamizajes, plan preventivo y seguimiento. |
| Documentar consulta odontologica | Odontograma, piezas dentales, superficies, hallazgos, periodontograma, condiciones bucales, plan de tratamiento, higiene y proxima revision. |
| Registrar plan dental | Pieza o tratamiento general, procedimiento, prioridad, estado, fecha sugerida, notas y seguimiento. |
| Generar apoyo de IA | Consentimiento, transcripcion o texto clinico, contexto permitido, reglas de seguridad, resultado y auditoria. |
| Transcribir consulta por IA | Consentimiento del paciente, permiso del medico, audio o voz en tiempo real, proveedor de transcripcion, texto resultante, revision medica, descarte o retencion controlada del audio y auditoria. |
| Generar resumen longitudinal e instrucciones | Historial autorizado, notas previas, diagnosticos, tratamientos, estudios, reglas de seguridad, salida revisable por medico y registro de uso IA. |
| Gestionar proveedores de IA | Proveedor, tipo de servicio, credenciales seguras, estado activo, modelo, costo estimado, latencia, reglas de fallback, BAA/compliance si aplica y bitacora de uso. |
| Ejecutar benchmark de IA clinica | Set de consultas simuladas o autorizadas, especialidad, idioma/acento, ruido, metrica de precision, costo, latencia, errores clinicos, resultado comparativo y decision documentada. |
| Validar receta con apoyo del sistema | Medicamentos, alergias, antecedentes, cuestionario, reglas deterministicas y alertas clinicas. |
| Emitir receta | Paciente, medico, diagnostico, medicamentos, indicaciones, fecha, firma o identificacion profesional. |
| Enviar indicaciones al paciente | Cita, paciente, resumen autorizado, canal de entrega y registro de envio. |
| Consultar historial del paciente | Sesion de paciente, citas vinculadas, notas compartibles, recetas, documentos y permisos. |
| Descargar resumen autorizado | Paciente, cita o encuentro, contenido autorizado por el medico, formato descargable, vigencia, permisos y bitacora de acceso. |
| Enviar recordatorio por SMS | Cita, telefono, plantilla, horario programado, enlaces cortos si aplica, estado de envio y bitacora. |
| Enviar notificacion por correo | Usuario o paciente, correo destino, plantilla transaccional, asunto, contenido, enlaces de accion, estado de envio y bitacora. |
| Generar enlace corto para SMS | URL destino, codigo corto, expiracion opcional, redireccion segura, contador de uso y relacion con cita o paciente. |
| Solicitar recuperacion de cuenta | Correo, rol esperado si aplica, rate limit, token de un solo uso, expiracion, plantilla de correo y respuesta generica. |
| Restablecer contrasena | Token valido, nueva contrasena, politica de seguridad, invalidacion del token, cierre de sesiones previas y auditoria. |
| Gestionar lista de espera | Paciente, medico, preferencias de horario, prioridad, estado, oferta de espacio, expiracion y respuesta del paciente. |
| Gestionar recepcion | Cita, estado operativo, llegada, espera, inicio de consulta, salida, usuario que actualiza y bitacora. |
| Registrar cobro | Cita, monto, metodo de pago, estado, recibo y usuario que registra. |
| Cerrar caja diaria | Fecha, ingresos, metodo de pago, citas cobradas, responsable, notas y totales por metodo. |
| Gestionar recursos fisicos | Recurso, tipo, disponibilidad, asignacion a cita, conflicto de horario y estado activo. |
| Gestionar suscripcion y capacidades | Plan, estado comercial, modulos incluidos, renovacion, cancelacion, reactivacion y bloqueo por capacidad. |
| Gestionar creditos y gobernanza IA | Saldo de creditos, consumo, historial, modelo usado, version de prompt, costo estimado, feedback y trazas. |
| Gestionar recibos y depositos | Cita, anticipo, pago pendiente, politica de cancelacion, recibo descargable y resultado de reembolso o no-show. |
| Gestionar privacidad y seguridad operacional | Solicitudes ARCO, politicas de retencion, incidentes, 2FA, recovery codes y exportacion de auditoria. |
| Gestionar paginas legales y aceptacion | Version de terminos, version de privacidad, usuario o paciente, fecha, canal, IP o metadatos disponibles y evidencia de aceptacion. |
| Administrar consentimientos | Paciente, tipo de consentimiento, version legal, fecha, canal y evidencia. |
| Auditar cambios criticos | Actor, accion, entidad afectada, fecha, origen y metadatos del cambio. |

## Prioridad funcional para V2 inicial

| Prioridad | Requerimientos |
|---|---|
| Alta | Registro/login, medicina familiar/general, odontologia, configuracion medica, agendado con hold temporal, paquete integrado, expediente, carga de estudios, SOAP, cierre/versionado de nota, receta, historial, legal basico y seguridad. |
| Media | IA multi-proveedor, benchmark clinico, transcripcion clinica, resumen longitudinal, instrucciones al paciente, consulta sin cita, descarga de resumen, SMS con enlaces cortos, correo transaccional, recuperacion de cuenta, lista de espera, recepcion, caja, recursos, suscripcion, creditos IA, recibos/depositos y consentimientos avanzados. |
| Baja | Analitica comercial avanzada, atribucion de funnel, multi-clinica avanzada y teleconsulta futura. |
