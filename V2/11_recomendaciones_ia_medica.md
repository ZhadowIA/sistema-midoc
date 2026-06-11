# 11 - Recomendaciones de IA medica

## Decision recomendada

No se recomienda reemplazar de inmediato el stack actual basado en GPT/OpenAI y Deepgram. La recomendacion es mantenerlos como base inicial, pero construir MiDoc V2 con una capa multi-proveedor de IA que permita comparar y cambiar proveedores sin reescribir los flujos clinicos.

El objetivo no es elegir el proveedor mas famoso, sino el mejor proveedor por tarea clinica: transcripcion, generacion SOAP, resumen longitudinal, instrucciones al paciente, costos, latencia, cumplimiento y facilidad de auditoria.

## Cruce de modelos Anthropic y OpenAI

Cuando este documento mencione una recomendacion de Anthropic, este es el equivalente sugerido de OpenAI para comparar por tarea:

| Uso | Anthropic | OpenAI sugerido |
|---|---|---|
| Maximo razonamiento, arquitectura, seguridad y decisiones delicadas | Opus 4.8 | `gpt-5.5` |
| Implementacion cuidadosa, revision tecnica y trabajo complejo con codigo o docs | Sonnet 4.6 | `gpt-5.4` |
| Exploracion amplia, borradores, soporte mecanico y bajo costo/latencia | Haiku 4.5 | `gpt-5-mini` |

Esfuerzo recomendado por modelo:

| Modelo Anthropic | Esfuerzo recomendado | Equivalente OpenAI | Esfuerzo recomendado |
|---|---|---|---|
| Opus 4.8 | Alto | `gpt-5.5` | Alto |
| Sonnet 4.6 | Medio | `gpt-5.4` | Medio |
| Haiku 4.5 | Bajo | `gpt-5-mini` | Bajo |

## Arquitectura recomendada

| Capa | Responsabilidad |
|---|---|
| Orquestador IA | Decide que proveedor usar por caso de uso, especialidad, costo, latencia o fallback. |
| Adaptadores LLM | Integran proveedores para generacion SOAP, resumen, instrucciones, validaciones y apoyo clinico. |
| Adaptadores de transcripcion | Integran proveedores para audio/voz, diarizacion, terminologia medica y texto resultante. |
| Registro de uso IA | Guarda proveedor, modelo, prompt/version, entrada permitida, salida, costo, latencia, consentimiento y auditoria. |
| Benchmark clinico | Compara proveedores con audios y casos representativos antes de tomar una decision final. |
| Politicas de seguridad | Definen consentimiento, retencion/descarte de audio, manejo de PHI/datos sensibles y revision humana. |

## Proveedores a evaluar

| Categoria | Proveedor | Uso sugerido | Decision inicial |
|---|---|---|---|
| LLM general clinico | OpenAI API | SOAP, resumen, instrucciones, apoyo clinico y estructuracion | Mantener como base inicial si se cuenta con BAA/compliance requerido. |
| LLM medico especializado | Google MedLM | Resumen clinico, preguntas medicas, documentos y notas de salud | Evaluar como alternativa clinica en benchmark. |
| Documentacion clinica todo-en-uno | AWS HealthScribe | Transcripcion, resumen y documentacion de encuentros | Evaluar si se busca reducir desarrollo propio. |
| Transcripcion medica | Deepgram Nova Medical | Audio/voz, terminologia medica, diarizacion y baja latencia | Mantener como base inicial de transcripcion. |
| Transcripcion medica alternativa | AssemblyAI Medical | Transcripcion, diarizacion, redaccion PII y flujo de medical scribe | Evaluar contra Deepgram con audios reales/simulados. |
| API medica de encuentro | Nabla Core API | Transcribir encuentros, generar notas estructuradas y extraer datos | Evaluar si se busca una API mas especializada en scribe clinico. |
| Bot/triage salud | Azure Health Bot | Asistente conversacional, triage y flujos de paciente | No incluir en MVP; evaluar despues si se requiere asistente paciente. |
| Scribe enterprise cerrado | Nuance DAX, Abridge, Ambience | Ambient scribe enterprise integrado a EHR | Referencia de mercado; probablemente no ideal para MVP propio por costo/acceso. |

## Recomendacion por modulo

| Modulo MiDoc | Proveedor inicial | Alternativas a probar | Criterio de decision |
|---|---|---|---|
| Generacion SOAP | OpenAI API | Google MedLM, AWS HealthScribe | Calidad clinica, estructura, trazabilidad, costo y revision medica. |
| Resumen longitudinal | OpenAI API | Google MedLM | Fidelidad al expediente, baja alucinacion, citas internas y claridad. |
| Instrucciones al paciente | OpenAI API | Google MedLM | Lenguaje claro, seguridad, no inventar indicaciones y adaptacion a paciente. |
| Transcripcion de consulta | Deepgram | AssemblyAI, Nabla, AWS HealthScribe | Precision medica, diarizacion, latencia, costo, ruido, acentos y manejo de PHI. |
| Gobernanza/costos IA | Capa propia MiDoc | Servicios cloud complementarios | Costo por consulta, creditos, auditoria y fallback. |

## Equivalencia por tarea

| Tarea clinica | Recomendacion Anthropic | Equivalente OpenAI | Motivo |
|---|---|---|---|
| Generacion SOAP | Opus 4.8 | `gpt-5.5` | Requiere estructura, criterio clinico y bajo margen de error. |
| Resumen longitudinal | Opus 4.8 | `gpt-5.5` | Importa la fidelidad al expediente y la persistencia en contexto largo. |
| Instrucciones al paciente | Sonnet 4.6 | `gpt-5.4` | Hay que redactar con claridad, seguridad y buena adaptacion al lenguaje del paciente. |
| Transcripcion de consulta | Haiku 4.5 / Sonnet 4.6 | `gpt-5-mini` / `gpt-5.4` | Parte del trabajo es mecanico, pero la validacion del resultado necesita buen criterio. |
| Clasificacion, triage interno y reglas de seguridad | Opus 4.8 | `gpt-5.5` | Mejor usar el modelo mas fuerte cuando una mala decision puede afectar seguridad clinica. |
| Documentacion y reportes | Haiku 4.5 | `gpt-5-mini` | Bajo riesgo y alta tolerancia a iteracion. |

## Benchmark clinico obligatorio

Antes de elegir proveedor definitivo, MiDoc debe ejecutar un benchmark con casos representativos. El benchmark debe usar datos simulados o datos autorizados con consentimiento documentado.

Set minimo recomendado:

- 10 consultas de medicina familiar/general.
- 10 consultas odontologicas.
- 5 consultas con ruido ambiente o interrupciones.
- 5 consultas con acentos o velocidad de habla variable.
- Casos con medicamentos, alergias, diagnosticos, procedimientos y estudios.
- Casos donde el paciente use lenguaje coloquial y el medico lenguaje clinico.

Metricas a evaluar:

| Metrica | Que mide |
|---|---|
| Precision de transcripcion | Que tan bien captura sintomas, medicamentos, dosis, fechas y terminos clinicos. |
| Diarizacion | Que tan bien separa medico, paciente y acompanantes. |
| Latencia | Tiempo para recibir transcripcion o nota util. |
| Calidad SOAP | Estructura, completitud, fidelidad y ausencia de informacion inventada. |
| Seguridad clinica | Capacidad de evitar recomendaciones peligrosas o no solicitadas. |
| Revision medica | Cuanto tiempo tarda el medico en corregir la salida. |
| Costo | Costo estimado por consulta y por medico/mes. |
| Cumplimiento | BAA, manejo de PHI, retencion, auditoria, cifrado y residencia si aplica. |
| Integracion | Complejidad tecnica, SDK/API, estabilidad y soporte. |

## Politicas obligatorias para IA

- La IA nunca reemplaza el criterio medico.
- Toda salida clinica generada por IA debe ser borrador hasta que el medico la revise y apruebe.
- La transcripcion por audio requiere consentimiento explicito del paciente.
- El sistema debe registrar proveedor, modelo, version, prompt, fecha, responsable, costo y resultado.
- El audio debe tener politica clara de retencion o descarte.
- Debe existir fallback manual si falla la IA.
- No se debe enviar PHI/datos sensibles a proveedores sin acuerdo contractual y controles adecuados.

## Decision para V2

| Horizonte | Decision |
|---|---|
| MVP | No depender de IA. Dejar flujos manuales completos y preparar interfaces para IA posterior. |
| Piloto controlado | Mantener OpenAI y Deepgram como base si cumplen requisitos contractuales y de seguridad. |
| IA clinica gobernada | Implementar capa multi-proveedor, benchmark y fallback. |
| Escalamiento | Elegir proveedores por evidencia: precision, costo, latencia, seguridad, cumplimiento y experiencia del medico. |

## Fuentes de referencia

- OpenAI for Healthcare: https://openai.com/index/openai-for-healthcare/
- OpenAI BAA API: https://help.openai.com/en/articles/8660679
- Deepgram Medical Transcription: https://deepgram.com/solutions/medical-transcription
- AssemblyAI Medical: https://www.assemblyai.com/solutions/medical
- AssemblyAI Medical Scribe: https://www.assemblyai.com/docs/medical-scribe-best-practices
- Google MedLM: https://cloud.google.com/vertex-ai/generative-ai/docs/models
- AWS HealthScribe: https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe-insights.html
- Azure Health Bot: https://azure.microsoft.com/en-us/products/bot-services/health-bot
- Nabla Core API: https://docs.nabla.com/2024-04-22/guides/intro
