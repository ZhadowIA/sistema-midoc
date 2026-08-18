# 15 - Plan de datos de uso (telemetria de producto)

Documento vivo. Define **que se mide del uso que el medico hace de la app, para que decision sirve cada dato, y que jamas se recolecta**. Nace de una necesidad concreta (decidir el modelo de creditos del chat clinico, paso 28) pero se disena para el conjunto del producto.

## 1. Por que ahora, y que decision anterior se revisa

`12_inventario_funcional_v1.md` tomo dos decisiones que este plan retoma:

- Linea 79: **funnel de reserva (analitica) — "Diferir (decidido)"**. Se difirio la analitica de producto de V1. Este documento no la revive tal cual: propone algo mas chico y con gobernanza propia.
- Linea 132: **limites y telemetria de uso IA — "Adaptar (decidido): telemetria sin contenido clinico"**. Esa es la linea que se continua.

El disparador inmediato es el paso 28: la decision de creditos del chat quedo tomada como **provisional** (opcion 1, por hilo-sesion) precisamente porque no existe un solo dato de uso real. Sin medicion, la siguiente decision seria otra apuesta.

## 2. Regla de oro (no negociable)

Aplica la regla 4 de `REGLAS_DESARROLLO.md` sin excepcion ni matiz:

- **Nunca** contenido clinico en telemetria: ni notas, ni diagnosticos, ni motivos de consulta, ni nombres de medicamentos, ni fragmentos de transcripcion, ni texto que el medico escribio. Ni siquiera truncado, ni hasheado, ni "solo el primer campo".
- **Nunca** texto libre de ninguna clase. Toda metrica es un **numero, una fecha de periodo o un valor de un enum cerrado** definido en el codigo. Si un dato necesita un campo de texto para expresarse, no entra.
- **Nunca** eventos con marca de tiempo individual de actos clinicos. Se suben **contadores agregados por periodo**, no bitacoras. Un evento "consulta firmada a las 16:43 del martes" es un cuasi-identificador; "38 consultas firmadas en agosto" no lo es.
- El sujeto de la medicion es el **medico y la app**, nunca el paciente.

### Nota sobre un dato que ya viaja

`AiUsageLog` (portal) ya persiste `patientId` y `encounterId` como **ids locales opacos**, y la app los manda dentro de `inputReference`/`outputReference`. Es legitimo bajo la regla 4 (referencias, no contenido) y no se cambia, pero hay que nombrarlo con precision: **son identificadores seudonimos estables en la nube**. De ahi se puede derivar cuantos pacientes distintos atiende un medico y con que frecuencia vuelve cada uno — informacion del consultorio, no del paciente, pero sensible de todos modos. Consecuencia para este plan: **la telemetria nueva no agrega ninguna dimension que se pueda cruzar con esos ids**. Los contadores agregados no llevan `patientId` ni `encounterId`, punto.

## 3. Principio de diseno: agregar local, subir contadores

```text
app del medico (SQLite cifrado)              portal
  eventos locales crudos  ──agregacion──►  contadores por periodo  ──►  tablero
  (nunca salen)             semanal/mensual   (sin ids de paciente)
```

1. La app registra localmente lo que necesita, con el detalle que quiera: es la base cifrada del medico.
2. Un **agregador local** produce contadores por periodo (semana o mes) y dimensiones cerradas.
3. Solo los contadores suben, por el canal de sincronizacion existente, con el mismo patron ya probado del reporte de uso de IA: lote, idempotencia por llave `(medico, periodo, metrica, dimensiones)`, validacion Zod `.strict()`.
4. Si el medico revoca el consentimiento, deja de subir; lo local sigue siendo suyo.

Esto no es una decision estetica: es lo que hace que un error de implementacion **no pueda** filtrar contenido clinico, porque el unico tipo que cruza la frontera es numerico.

## 4. Nivel 0 — lo que ya se puede responder sin escribir codigo nuevo

Antes de construir nada, hay tres fuentes ya pobladas que nadie esta explotando:

| Fuente | Donde | Que responde hoy |
|---|---|---|
| `AiUsageLog` | portal | Usos de IA por tipo, proveedor, modelo, version de prompt, costo estimado, latencia, estado y creditos consumidos, por medico y periodo. |
| `clinical_audit` | app local | Que entidades se crean, editan y firman, cuando, y desde el paso 27 con actor y estacion. |
| Bitacora de sincronizacion y notificaciones | portal | Frecuencia de uso real de la app, dispositivos activos, fallos de envio. |

**Primera accion recomendada, de costo casi nulo:** un tablero interno sobre `AiUsageLog` con latencia p50/p95 por uso y modelo, tasa de fallo por proveedor, y creditos por medico contra su cuota. Eso ya orienta el paso 16 (proveedor real) y el paso 24 (degradacion) sin recolectar ni un dato nuevo.

## 5. Catalogo de metricas, ordenado por la decision que desbloquea

### Bloque A — Modelo de creditos del chat (prioridad 1, cierra el pendiente del paso 28)

| Metrica | Forma | Decision que informa |
|---|---|---|
| `chat.turns_per_thread` | histograma en cubetas fijas (1-3, 4-7, 8-15, 16-30, 31+) | Si la mediana son 6 turnos, la opcion 1 es correcta para siempre; si son 25, hay que pasar a la 2 o la 3. |
| `chat.threads_per_encounter` | contador y distribucion | Cuantos hilos abre el medico por consulta; valida el tope de 30 turnos. |
| `chat.encounters_with_chat_ratio` | razon (consultas con chat / consultas totales) | Cuanto pesa el chat en el costo por consulta. |
| `chat.tokens_in`, `chat.tokens_out`, `chat.tokens_cached` | sumas por periodo y modelo | Costo real, y si el cache esta funcionando: un `cached` bajo significa que el prefijo no es estable y hay un defecto de diseno. |
| `chat.deep_opinion_ratio` | razon de turnos con modelo caro | Si el boton de "segunda opinion" se usa el 40% de las veces, el costo se dispara y hay que repensarlo. |
| `chat.cost_cents_per_thread` | histograma | Contraste directo contra el valor imputado del credito. |
| `chat.turns_per_doctor_month` | histograma entre medicos | Dimensiona la bolsa de la opcion 3. |

**Criterio de decision pre-registrado**, escrito antes de ver los datos para no racionalizar despues: con 3 meses o 200 hilos, si el p90 de `turns_per_thread` es menor o igual a 15 y el p90 de `cost_cents_per_thread` no supera el valor del credito, se mantiene la opcion 1. Si el costo p90 lo supera, se pasa a la opcion 2. Si la dispersion entre medicos es alta (p90/p50 mayor a 5), se pasa a la 3, porque el problema no es el precio medio sino la cola.

### Bloque B — La IA, ¿sirve o estorba? (prioridad 2)

| Metrica | Forma | Para que |
|---|---|---|
| `ai.draft_applied_ratio` por uso | razon aplicado / generado | La metrica de calidad mas honesta que existe: si el medico descarta el 70% de los borradores de SOAP, el prompt esta mal, no el medico. |
| `ai.time_to_approve_seconds` | histograma por uso | Proxy de cuanto tiene que corregir. Si sube, empeoro. |
| `ai.provider_overload_events` | contador por proveedor y modelo | Mide si el paso 24 se disparo de verdad y con que frecuencia. |
| `ai.failure_by_reason` | contador por enum cerrado (credencial, sobrecarga, esquema invalido, red, presupuesto) | Distingue "el proveedor falla" de "nuestro esquema lo rechaza". |
| `ai.latency_ms` p50/p95 | por uso y modelo | Si el p95 supera el umbral de paciencia en consulta, el modelo barato deja de ser barato. |
| `ai.model_switch_ratio` | razon | Cuantas veces el medico elige otro modelo teniendo la opcion. |

### Bloque C — Adopcion y flujo de trabajo (prioridad 3)

| Metrica | Forma | Para que |
|---|---|---|
| `workflow.encounters_per_active_day` | histograma | Carga real del consultorio; base de todas las razones. |
| `workflow.encounter_duration_bucket` | cubetas (<10 min, 10-20, 20-40, 40+) | **En cubetas, nunca en segundos exactos ni con hora del dia**, para no volverlo cuasi-identificador. |
| `workflow.unsigned_encounters_ratio` | razon | Consultas que se abren y nunca se firman: el sintoma de friccion mas util del producto. |
| `workflow.feature_used` | contador por enum cerrado (transcripcion, plantilla, receta, odontograma, presupuesto, laboratorio, chat) | Que se usa, y que se construyo para nadie. |
| `workflow.by_clinical_profile` | dimension (GENERAL_MEDICINE / ODONTOLOGY) | Casi todo lo anterior cambia de forma entre perfiles; sin esta dimension los promedios mienten. |
| `workflow.days_since_last_open` | numero | Señal temprana de abandono, mucho antes que la cancelacion. |

### Bloque D — Salud tecnica y soporte (prioridad 3)

| Metrica | Forma | Para que |
|---|---|---|
| `env.app_version`, `env.os`, `env.cpu_cores`, `env.ram_gb` | dimensiones | Saber contra que parque real se prueba. Hoy se decide a ciegas. |
| `env.whisper_backend`, `env.whisper_model` | dimension | Valida la matriz de empaque del doc 11: si el 80% cae en CPU con turbo-q5, ahi va el esfuerzo de optimizacion. |
| `transcription.realtime_ratio` | razon (casi en vivo / por lotes) | Si casi nadie alcanza tiempo real, la promesa de UX esta mal calibrada. |
| `sync.failures`, `sync.queue_depth` | contadores | Salud del canal; anticipa soporte. |
| `backup.restore_drills` | contador | Cuantos medicos probaron restaurar. Si es cero, la promesa de respaldo es teorica. |
| `crash.count` por enum de area | contador | Sin stack traces ni datos: solo area y version. |

### Bloque E — Negocio (prioridad 4)

Consumo contra cuota por plan, excedentes, distribucion de planes, y relacion entre uso de IA y permanencia. Se derivan casi por completo de `AiUsageLog` y las tablas de suscripcion: **no requieren recoleccion nueva**, solo consulta.

## 6. Lo que explicitamente NO se recolecta

Lista cerrada, para no discutirlo caso por caso:

- Contenido o fragmentos de notas, transcripciones, prompts, respuestas de IA, recetas o documentos.
- Diagnosticos, codigos CIE-10, nombres de farmacos o motivos de consulta — aunque vengan de un catalogo cerrado. Un histograma de diagnosticos de un consultorio chico identifica pacientes.
- Datos de pacientes de cualquier tipo, incluidos edad, sexo o codigo postal.
- Marcas de tiempo individuales de actos clinicos.
- Pulsaciones, movimiento de mouse, grabacion de sesion o mapas de calor.
- Cualquier campo de texto libre, incluida la retroalimentacion escrita del medico sobre la IA. Esa se queda local; si se quiere, se pide aparte y con su propio consentimiento.

## 7. Gobernanza

- **Consentimiento del medico, opt-in explicito.** No es telemetria de un servicio web anonimo: es la actividad profesional de una persona identificada. Se pide al configurar la app, con un texto que diga que se manda y para que.
- **Transparencia verificable.** Pantalla "Datos de uso" que muestra **exactamente el ultimo lote enviado**, en el mismo formato en que se envio, y permite exportarlo. Si el medico no puede ver lo que sale, la promesa no vale nada.
- **Revocable en cualquier momento**, sin perder funcionalidad clinica: nada del producto puede depender de que la telemetria este activa.
- **Retencion acotada** en el portal (propuesta: 24 meses de contadores agregados) y borrado al terminar la suscripcion, alineado con el paso 12.
- **Clasificacion**: todos los contadores son `OPERATIVO`. Ninguna metrica de este plan puede clasificarse `CLINICO`; si alguna lo necesitara, esta mal disenada y no entra.
- El agregador local y el esquema de subida se prueban con la misma exigencia que el resto, incluida una prueba de que ningun campo de texto libre puede llegar al payload.

## 8. Donde encaja en la linea de desarrollo

No es un paso propio todavia. Se propone entregarlo en tres tiempos:

1. **Tiempo 0, sin codigo nuevo (hacer ya).** Tablero interno sobre `AiUsageLog` y consultas a `clinical_audit` en soporte. Responde el bloque E completo y parte del B.
2. **Tiempo 1, junto al paso 28.** Las metricas del **bloque A** se instrumentan **dentro** de las rebanadas 2 y 3 del paso 28, que ya registran tokens reales por turno. Es el unico bloque con una decision de negocio esperandolo.
3. **Tiempo 2, paso propio.** Bloques C y D, con el agregador local, el consentimiento del medico y la pantalla de transparencia. Merece paso propio porque introduce una superficie de salida de datos nueva y su gobernanza.

Riesgo principal del plan: que la telemetria se construya "porque se puede" y termine midiendo lo facil en vez de lo que decide algo. Mitigacion: **ninguna metrica entra al catalogo sin nombrar la decision que desbloquea** — es la columna que toda tabla de este documento lleva a proposito, y la regla que hay que hacer cumplir en revision.
