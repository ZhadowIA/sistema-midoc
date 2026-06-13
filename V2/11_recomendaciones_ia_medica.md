# 11 - Recomendaciones de IA medica

## Decision recomendada

MiDoc V2 se construye con una capa multi-proveedor de IA que permite comparar y cambiar proveedores sin reescribir los flujos clinicos. El objetivo no es elegir el proveedor mas famoso, sino el mejor proveedor por tarea clinica al menor costo: transcripcion, generacion SOAP, resumen longitudinal, instrucciones al paciente, costos, latencia, cumplimiento y facilidad de auditoria.

### Actualizacion 2026-06-13 (revision de mercado y costo)

Dos hallazgos cambian la base recomendada respecto a la version original de este documento:

1. **Los LLM generalistas de frontera superan a las herramientas clinicas especializadas.** Estudios de 2026 (Nature Medicine, arXiv) muestran que GPT-5 (96.2% MedQA) y Gemini (94.6% MedQA) superan a herramientas clinicas dedicadas como OpenEvidence (89.6%) y UpToDate (88.4%) en los tres benchmarks evaluados. Conclusion: no es necesario pagar de mas por modelos "medicos" de nicho (Google MedLM, AWS HealthScribe) para el MVP; un generalista barato rinde igual o mejor.

2. **Gemini Flash sustituye a OpenAI como base por costo.** En junio 2026, Gemini 3 Flash (~$0.50/$3.00 por 1M tokens entrada/salida) ofrece 94.6% MedQA a una fraccion del costo de GPT-5.5 ($5/$30) o Claude Opus 4.8 ($5/$25). Se mantienen GPT-5.5 / Gemini Pro / Opus solo como fallback de seguridad para casos delicados.

3. **La seguridad de medicacion no se delega a IA generativa.** Interacciones, dosis, alergias y duplicidad terapeutica se resuelven con herramientas deterministas auditables (ver seccion "Herramientas deterministas que reducen dependencia de IA"). La IA queda para lo generativo (redactar SOAP, resumir, explicar al paciente).

> Toda regla de residencia de datos y consentimiento sigue vigente: no se envia PHI a proveedores sin BAA, y la transcripcion corre primero en el dispositivo (Whisper local).

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

### LLM (precios junio 2026, por 1M tokens entrada/salida)

| Proveedor / modelo | Precio | MedQA | Decision |
|---|---|---|---|
| **Gemini 3 Flash** | $0.50 / $3.00 | ~94.6% | **Base recomendada** para SOAP, resumen y apoyo clinico. Mejor relacion calidad/precio. |
| Gemini 3.1 Flash-Lite | $0.10 / $0.40 | — | Tareas mecanicas/bajo riesgo (instrucciones al paciente, documentacion). Ultra barato. |
| DeepSeek V3 | $0.27 / $1.10 | ~88.6% | Alternativa barata fuerte en razonamiento; evaluar en benchmark y por cumplimiento. |
| Gemini 3.1 Pro | $2 / $12 | ~94.6% | Fallback de calidad cuando Flash no basta, sin pagar lo de OpenAI. |
| GPT-5.5 | $5 / $30 | 96.2% | Fallback de maxima calidad/seguridad. Caro; usar solo en casos delicados. |
| Claude Opus 4.8 | $5 / $25 | — | Fallback de maximo razonamiento. Caro. |
| Google MedLM / AWS HealthScribe | (especializado) | <generalistas | **Descartados para MVP:** los generalistas los superan en benchmark (Nature Medicine 2026). |

### Transcripcion (precio por minuto)

| Proveedor | Precio | Decision |
|---|---|---|
| **Whisper local (en dispositivo)** | $0 | **Primera opcion.** Cumple residencia local-first, sin enviar PHI, gratis. |
| AssemblyAI | $0.0025/min pre-grabado (~$0.15/h) | El mas barato en nube; $50 de credito gratis. Para nube con consentimiento. |
| Deepgram Nova-3 | $0.0043/min pre-grabado, $0.0077/min streaming | Mejor precision medica; $200 de credito gratis (~46k min) para el benchmark. |
| OpenAI gpt-4o-mini-transcribe | $0.003/min | Intermedio; evaluar en benchmark. |
| Nabla Core API | (comercial) | Evaluar solo si se busca scribe clinico especializado todo-en-uno. |

### Whisper local: seleccion automatica de modelo segun el equipo

Whisper es de pesos abiertos y corre en el equipo del medico (via `whisper.cpp`, integrable con Tauri y operable en CPU). Viene en varios tamanos: a mayor tamano, mas precision en terminos clinicos pero mas RAM y mas tiempo de proceso. Para que el medico no tenga que entender de esto, la app **detecta el hardware al configurar la transcripcion y sugiere el tamano de modelo** (implementado en `desktop-app/src-tauri/src/transcription.rs`, comando `transcription_recommendation`, pantalla "Transcripcion").

Requisitos por modelo (referencia; no son limites duros):

| Modelo | RAM del modelo | Disco | Calidad en español clinico |
|---|---|---|---|
| small | ~2 GB | ~0.5 GB | Minimo usable para consulta general |
| medium | ~5 GB | ~1.5 GB | Recomendado: buen balance para terminos clinicos y acentos |
| large-v3 | ~10 GB | ~3 GB | Maxima precision; practico con GPU |

Politica de seleccion (sobre RAM total del equipo; la deteccion de GPU se difiere y por defecto es conservadora):

| RAM total | Sin GPU | Con GPU |
|---|---|---|
| < 8 GB | small + sugerir nube con consentimiento | small + sugerir nube |
| 8-16 GB | small (por lotes) | medium (casi en vivo) |
| >= 16 GB | medium (casi en vivo si CPU >= 8 nucleos) | large-v3 (casi en vivo) |

La transcripcion es por lotes salvo que el equipo (RAM/GPU/nucleos) permita el modo casi en vivo. Cuando el equipo queda por debajo del minimo comodo, la app sugiere la transcripcion en nube (AssemblyAI/Deepgram) seudonimizada y con consentimiento, sin bloquear el modo offline.

## Recomendacion por modulo

| Modulo MiDoc | Proveedor recomendado (costo) | Fallback | Criterio de decision |
|---|---|---|---|
| Generacion SOAP | Gemini 3 Flash | Gemini 3.1 Pro / GPT-5.5 | Calidad clinica, estructura, trazabilidad, costo y revision medica. |
| Resumen longitudinal | Gemini 3 Flash | Gemini 3.1 Pro | Fidelidad al expediente, baja alucinacion, citas internas y claridad. |
| Instrucciones al paciente | Gemini 3.1 Flash-Lite | Gemini 3 Flash | Lenguaje claro, seguridad, no inventar indicaciones; tarea de bajo riesgo y barata. |
| Documentacion / reportes | Gemini 3.1 Flash-Lite | Gemini 3 Flash | Bajo riesgo, alta tolerancia a iteracion. |
| Casos delicados / seguridad clinica | GPT-5.5 o Gemini 3.1 Pro | Claude Opus 4.8 | Usar el modelo mas fuerte cuando una mala decision afecta seguridad. |
| Transcripcion de consulta | Whisper local | AssemblyAI / Deepgram | Residencia local-first primero; nube con consentimiento por precision/costo. |
| Seguridad de medicacion | Herramientas deterministas (no IA) | — | DDInter + openFDA + RxNorm; auditable, sin alucinaciones (ver seccion dedicada). |
| Gobernanza/costos IA | Capa propia MiDoc | Servicios cloud complementarios | Costo por consulta, creditos, auditoria y fallback. |

## Equivalencia por tarea (nivel de complejidad requerido)

Esta tabla **no fija el proveedor**: clasifica el *nivel de complejidad* que necesita cada tarea (alto / medio / bajo). El modelo que se cablea es el **mas barato que cumple ese nivel** (columna "Modelo elegido"), que tras la revision de costo 2026-06-13 es Gemini en casi todos los casos. Los modelos Anthropic/OpenAI quedan como referencia de nivel y como fallback de seguridad cuando una tarea de nivel alto lo amerite.

| Tarea clinica | Nivel requerido | Referencia de nivel (Anthropic / OpenAI) | **Modelo elegido (costo)** |
|---|---|---|---|
| Generacion SOAP | Alto | Opus 4.8 / `gpt-5.5` | **Gemini 3 Flash** (fallback: Gemini 3.1 Pro / GPT-5.5) |
| Resumen longitudinal | Alto | Opus 4.8 / `gpt-5.5` | **Gemini 3 Flash** (fallback: Gemini 3.1 Pro) |
| Instrucciones al paciente | Medio | Sonnet 4.6 / `gpt-5.4` | **Gemini 3.1 Flash-Lite** (fallback: Gemini 3 Flash) |
| Transcripcion de consulta | Medio/bajo | Haiku 4.5 / Sonnet 4.6 | **Whisper local** (nube: AssemblyAI / Deepgram) |
| Clasificacion, triage interno y reglas de seguridad | Alto | Opus 4.8 / `gpt-5.5` | **GPT-5.5 o Gemini 3.1 Pro** (no escatimar: afecta seguridad) |
| Documentacion y reportes | Bajo | Haiku 4.5 / `gpt-5-mini` | **Gemini 3.1 Flash-Lite** |

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

## Herramientas deterministas que reducen dependencia de IA

Principio: todo lo *verificable contra una fuente de verdad* (interacciones, dosis, alergias, duplicidad terapeutica, codigos diagnosticos) debe resolverse con datos deterministas, auditables y citables, **no con IA generativa**. Esto reduce costo, elimina alucinaciones en lo critico y aporta trazabilidad para cumplimiento (NOM-004/NOM-024). La IA se reserva para lo generativo.

### Interacciones medicamentosas

> Aviso: la API de interacciones de la NLM/RxNav fue **descontinuada el 2 de enero de 2024**. Ya no existe. El resto de RxNav (RxNorm, RxClass, RxTerms) sigue vigente.

| Opcion | Costo | Severidad | Decision |
|---|---|---|---|
| **DDInter 2.0** | Gratis, sin registro | Si | **Recomendada.** ~240k interacciones, 1833 farmacos; base descargable (SQLite), encaja con arquitectura local-first. |
| openFDA Drug Label | Gratis | Parcial (texto) | Fuente de respaldo/evidencia con etiquetas FDA oficiales. |
| DrugBank Clinical API | De pago (comercial) | Si, detallada | Estandar de industria; considerar al escalar comercialmente. |

### Otras herramientas deterministas (NLM/FDA, gratis)

| Funcion | Herramienta | Uso |
|---|---|---|
| Normalizacion de farmacos | RxNorm API | Nombre -> RxCUI, evitar duplicados; base para lo demas. |
| Clasificacion de farmacos | RxClass API | Clase terapeutica, mecanismo; insumo para alergias cruzadas/duplicidad. |
| Etiqueta / dosis / contraindicaciones | DailyMed / openFDA | Prospecto oficial estructurado. |
| Eventos adversos | openFDA FAERS | Reportes de seguridad. |
| Alergias cruzadas / duplicidad terapeutica | RxNorm + RxClass (reglas propias) | Logica determinista, sin IA. |
| Codigos diagnosticos | CIE-10 / SNOMED CT | Validacion estructurada del diagnostico. |

## Decision para V2

| Horizonte | Decision |
|---|---|
| MVP | No depender de IA. Dejar flujos manuales completos y preparar interfaces para IA posterior. Integrar herramientas deterministas de medicacion desde temprano (no requieren IA). |
| Piloto controlado | Base recomendada: Gemini 3 Flash (LLM) + Whisper local (transcripcion). Cablear solo con BAA/compliance y consentimiento. |
| IA clinica gobernada | Implementar capa multi-proveedor, benchmark y fallback (Gemini Pro / GPT-5.5 / Opus como fallback de seguridad). |
| Escalamiento | Elegir proveedores por evidencia: precision, costo, latencia, seguridad, cumplimiento y experiencia del medico. |

## Fuentes de referencia

Proveedores:

- OpenAI for Healthcare: https://openai.com/index/openai-for-healthcare/
- OpenAI BAA API: https://help.openai.com/en/articles/8660679
- Deepgram Medical Transcription: https://deepgram.com/solutions/medical-transcription
- AssemblyAI Medical: https://www.assemblyai.com/solutions/medical
- AssemblyAI Medical Scribe: https://www.assemblyai.com/docs/medical-scribe-best-practices
- Google MedLM: https://cloud.google.com/vertex-ai/generative-ai/docs/models
- AWS HealthScribe: https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe-insights.html
- Azure Health Bot: https://azure.microsoft.com/en-us/products/bot-services/health-bot
- Nabla Core API: https://docs.nabla.com/2024-04-22/guides/intro

Evidencia de mercado y costo (revision 2026-06-13):

- General-purpose LLMs outperform specialized clinical AI tools (Nature Medicine 2026): https://www.nature.com/articles/s41591-026-04431-5
- Generalist LLMs Outperform Clinical Tools (arXiv): https://arxiv.org/pdf/2512.01191
- LLM API Pricing Comparison 2026 (Inference.net): https://inference.net/content/llm-api-pricing-comparison/
- Speech-to-Text API Pricing junio 2026 (buildmvpfast): https://www.buildmvpfast.com/api-costs/transcription

Herramientas deterministas de medicacion:

- NIH discontinua su Drug Interaction API (DrugBank): https://blog.drugbank.com/nih-discontinues-their-drug-interaction-api/
- DDInter (base de interacciones, gratis): http://ddinter.scbdd.com/
- openFDA Drug API: https://open.fda.gov/apis/drug/
- RxNorm / RxClass (NLM, vigentes): https://lhncbc.nlm.nih.gov/RxNav/APIs/index.html
