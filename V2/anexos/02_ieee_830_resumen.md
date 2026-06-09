# Anexo 02 - IEEE 830 resumido

## 1. Introduccion

### Proposito

Definir los requerimientos base de MiDoc V2 antes de iniciar implementacion.

### Alcance

MiDoc V2 sera una plataforma clinica para medicos y pacientes, centrada en un paquete integrado de atencion clinica que une agenda, expediente, preconsulta, consulta, receta, seguimiento y trazabilidad. El alcance clinico inicial se limita a medicina familiar/general y odontologia.

### Definiciones

| Termino | Definicion |
|---|---|
| Atencion clinica integrada | Vista o flujo que une cita, paciente, expediente, preconsulta, nota, receta y seguimiento. |
| SOAP | Formato de nota clinica: Subjetivo, Objetivo, Evaluacion y Plan. |
| Preconsulta | Informacion capturada antes de la atencion medica. |
| Expediente | Conjunto de datos clinicos, antecedentes, notas, recetas y documentos del paciente. |
| Enlace temporal de carga | URL generada por el medico para que el paciente suba estudios clinicos durante una ventana limitada. |
| Link corto | URL breve generada por el sistema para incluirse en SMS y redirigir a una URL interna controlada. |
| Recuperacion de cuenta | Flujo para restablecer contrasena mediante correo y token temporal de un solo uso. |
| Odontograma | Registro visual y estructurado de piezas dentales, superficies y hallazgos. |
| Periodontograma | Registro periodontal por pieza, profundidad, sangrado, movilidad y furcacion. |

## 2. Descripcion general

### Perspectiva del producto

MiDoc V2 evoluciona desde un sistema con modulos separados hacia una experiencia clinica integrada. El sistema seguira siendo web, responsivo y orientado a consultorios medicos.

### Funciones principales

- Gestion de medico y perfil publico.
- Agendado de citas.
- Portal de paciente.
- Paquete integrado de atencion clinica.
- Historia clinica y notas SOAP.
- Consulta familiar/general.
- Consulta odontologica.
- Carga de estudios clinicos por medico, paciente o enlace temporal.
- Receta e indicaciones.
- Notificaciones SMS con enlaces cortos.
- Notificaciones por correo.
- Recuperacion de cuenta por correo.
- Seguridad, auditoria y consentimiento.

### Usuarios

| Usuario | Caracteristicas |
|---|---|
| Medico | Requiere rapidez, claridad clinica y trazabilidad. |
| Paciente | Requiere facilidad para agendar, completar informacion y consultar historial. |

## 3. Requerimientos especificos

### Funcionales

Los requerimientos funcionales se detallan en `05_requerimientos_funcionales.md`.

### No funcionales

El sistema debe ser seguro, trazable, claro, responsivo, usable en movil y capaz de operar sin depender completamente de IA.

### Restricciones

- La informacion clinica debe protegerse mediante roles y autenticacion.
- Las acciones criticas deben auditarse.
- Los documentos clinicos deben asociarse a cita o expediente y protegerse mediante permisos.
- Los enlaces temporales de carga deben tener vigencia y poder invalidarse.
- Los SMS deben usar enlaces cortos generados por el sistema cuando incluyan acciones o formularios.
- Los correos transaccionales deben usarse para recuperacion de cuenta y respaldo de mensajes importantes.
- Los tokens de recuperacion deben expirar, ser de un solo uso y auditarse.
- La IA debe funcionar como apoyo, no como reemplazo de criterio medico.
- V2 inicial solo debe cubrir medicina familiar/general y odontologia.
- Las demas especialidades quedan fuera por ahora.
- La V2 inicial debe priorizar el paquete integrado agenda-expediente.

## 4. Criterios de aceptacion generales

- El medico puede abrir una cita y trabajar expediente, preconsulta, nota y receta desde un flujo integrado.
- El medico familiar/general puede documentar factores de riesgo, tamizajes, exploracion y plan preventivo.
- El dentista puede documentar odontograma, periodontograma, condiciones bucales y plan dental.
- El paciente puede agendar y consultar su informacion disponible.
- El medico puede subir estudios clinicos y generar enlaces temporales para que el paciente cargue archivos.
- Los enlaces enviados por SMS son cortos y redirigen a recursos internos controlados.
- El sistema conserva trazabilidad de acciones clinicas relevantes.
- La consulta puede completarse manualmente aunque fallen servicios externos.
