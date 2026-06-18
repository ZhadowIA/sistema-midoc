# Transcripción de consulta con OpenAI administrada por MiDoc

Fecha: 2026-06-18  
Estado: diseño ampliado aprobado, pendiente de revisión final de la especificación
Superficies: `V2/desktop-app`, `V2/consultorio-app`  
Pasos: 15 — transcripción local real; 16 — proveedores de IA reales en staging

## Objetivo

Mantener Whisper local como la opción predeterminada y gratuita en créditos, y agregar opciones explícitas de transcripción normal y diarizada en la nube con OpenAI cuyo consumo y credencial sean administrados por MiDoc.

El médico podrá elegir por consulta:

- `Whisper local`: el audio no sale del equipo y consume `0 créditos`.
- `OpenAI nube`: el audio sale transitoriamente del equipo, se cobra por bloques de `15 minutos iniciados` y requiere consentimiento vigente.
- `OpenAI nube con diarización`: separa hablantes, se cobra por bloques de `10 minutos iniciados` y requiere consentimiento vigente.

El acomodo posterior de la transcripción dentro de la plantilla clínica mediante Gemini sigue siendo una ejecución independiente de `CONSULTATION_STRUCTURING` y consume `1 crédito`.

## Decisiones aprobadas

- MiDoc cubre el consumo de OpenAI; el médico no configura una API key propia.
- La API key de OpenAI vive solamente en el entorno seguro del portal.
- La app de escritorio nunca recibe, almacena ni conoce la API key.
- La llamada a OpenAI se realiza mediante un endpoint autenticado del portal MiDoc.
- El portal procesa audio y transcripción únicamente en memoria y no persiste contenido clínico.
- El modelo inicial de transcripción normal es `gpt-4o-mini-transcribe`, configurable por entorno.
- El modelo de diarización es `gpt-4o-transcribe-diarize`, configurable por entorno.
- OpenAI normal consume `ceil(segundos / 900)` créditos.
- OpenAI con diarización consume `ceil(segundos / 600)` créditos.
- Whisper local consume `0 créditos`.
- Una llamada posterior a Gemini para acomodar la transcripción consume su propio crédito.
- La duración autoritativa para el cobro se calcula en el portal a partir del WAV validado. Si OpenAI devuelve `usage.seconds`, se usa como comprobación adicional.
- La diarización no usa muestras de voz conocidas ni identificación biométrica. El proveedor devuelve hablantes anónimos y el médico confirma su rol localmente.
- La función de OpenAI permanece deshabilitada en producción hasta que la organización usada por MiDoc tenga BAA y Zero Data Retention habilitados y verificados.

## Alternativas evaluadas

### Proxy gobernado en el portal — elegida

La app envía el audio al portal usando el token del dispositivo vinculado. El portal valida identidad, capacidad y consumo, llama a OpenAI y devuelve la transcripción.

Ventajas:

- La clave permanece secreta.
- El portal aplica control autoritativo de créditos y rate limiting.
- MiDoc puede cambiar el modelo sin actualizar la app.
- La gobernanza y auditoría operativa quedan centralizadas.

Costo:

- El audio atraviesa transitoriamente infraestructura de MiDoc, por lo que el endpoint debe evitar persistencia, logs de cuerpo y trazas con contenido.

### Clave embebida en la app — descartada

Aunque reduce una escala de red, una credencial incluida en el binario es extraíble. Permitiría consumo fuera de MiDoc y eludiría créditos, revocación y límites.

### Credencial temporal para llamada directa — descartada

La API de transcripciones por archivo no ofrece un mecanismo apropiado para delegar credenciales efímeras restringidas a una sola transcripción. Agregaría complejidad sin resolver de forma fiable la protección de la clave ni el cobro.

## Arquitectura

### Portal

Agregar un route handler autenticado por token de dispositivo:

```text
POST /api/sync/ai/transcriptions
Content-Type: multipart/form-data

audio: archivo WAV
runId: UUID generado por desktop
durationSeconds: entero opcional
mode: "standard" | "diarized"
```

Respuesta exitosa:

```json
{
  "runId": "uuid",
  "provider": "openai",
  "modelVersion": "gpt-4o-transcribe-diarize",
  "mode": "diarized",
  "transcriptText": "texto",
  "durationSeconds": 1240,
  "segments": [
    {
      "speaker": "speaker_0",
      "startSeconds": 0,
      "endSeconds": 4.2,
      "text": "Buenos días."
    }
  ],
  "estimatedCostCents": 0,
  "latencyMs": 1234,
  "creditCost": 3
}
```

En modo normal, `segments` es `null`. En modo diarizado, el portal exige `diarized_json`, valida cada segmento y devuelve hablante, inicio, fin y texto.

El costo monetario estimado puede permanecer en `0` hasta que exista una tabla de precios versionada. No se inventará un costo a partir de una tarifa recordada. El crédito comercial sí se calcula con las fórmulas aprobadas.

El route handler será una frontera fina. Delegará en:

- Un servicio de transcripción gobernada que autentica el dispositivo, verifica la capacidad IA y coordina la reserva.
- Un proveedor OpenAI que construye la petición `multipart/form-data` a `/v1/audio/transcriptions`, usa `Authorization: Bearer` y:
  - En modo normal solicita JSON y valida `{ text, usage? }`.
  - En modo diarizado solicita `diarized_json`, envía `chunking_strategy=auto` y valida `{ text, segments, usage? }`.
- La política central de créditos.

### App de escritorio

La app conserva el proveedor local existente y sustituye el adaptador directo de nube estilo Deepgram por un proveedor de portal MiDoc.

El proveedor remoto recibe:

- URL del portal vinculada.
- Token de dispositivo almacenado en la base local cifrada.
- `runId` generado antes de iniciar la llamada.
- Bytes del audio y metadata mínima.
- Modo `standard` o `diarized`.

No recibe una clave de OpenAI ni llama directamente a OpenAI.

Al obtener respuesta, la app guarda la transcripción como borrador en la base SQLite cifrada usando el mismo `runId`. Si la respuesta es diarizada, también guarda localmente los segmentos y genera turnos editables por hablante. La revisión humana, aplicación o descarte siguen el flujo existente.

## Flujo de datos

### Whisper local

1. El médico confirma el consentimiento de voz.
2. La app captura o carga un WAV en memoria.
3. Whisper procesa el audio en el equipo.
4. La app descarta los bytes de audio.
5. La transcripción se guarda como borrador local cifrado.
6. En la siguiente sincronización se reportan únicamente referencias y metadata operativa.
7. El portal reconoce el proveedor local y asigna `0 créditos`.

### OpenAI nube

1. El médico confirma el consentimiento de voz y elige transcripción normal o diarizada.
2. La app genera un `runId`.
3. La app calcula y muestra una estimación usando la duración local, pero la etiqueta como aproximada.
4. La app envía `runId`, modo, audio y duración estimada al portal mediante HTTPS y token de dispositivo.
5. El portal valida autenticación, capacidad IA, configuración de cumplimiento, tamaño y tipo del archivo.
6. El portal crea o recupera la reserva idempotente asociada a `(doctorId, runId)`.
7. El portal envía el archivo a OpenAI en memoria con el modelo y formato correspondientes.
8. El portal calcula la duración autoritativa al validar el encabezado WAV. No confía en la duración declarada por desktop.
9. Si OpenAI devuelve `usage.seconds`, el portal comprueba que la diferencia no exceda el mayor valor entre `2 segundos` y `2%` de la duración del WAV. Las respuestas basadas en tokens siguen siendo válidas.
10. El portal calcula el crédito definitivo y marca el uso como completado.
11. El portal devuelve la transcripción y, cuando aplica, los segmentos, sin almacenarlos.
12. La app descarta los bytes de audio y guarda el borrador y sus segmentos en SQLite cifrado.
13. La sincronización posterior actualiza el mismo registro por `runId` con el estado de revisión, sin cobrar otro crédito.

El portal nunca recibe nombre del paciente, identificador de encuentro, nombre original del archivo ni texto de plantilla. El `runId` es operativo y no codifica información clínica.

## Créditos e idempotencia

La política central deja de depender solamente de `usageType`. Considerará también el origen:

| Uso | Origen | Créditos |
|---|---|---:|
| `TRANSCRIPTION` | proveedor `whisper-local-*` | 0 |
| `TRANSCRIPTION` | OpenAI normal | `ceil(segundos / 900)` |
| `TRANSCRIPTION` | OpenAI diarizada | `ceil(segundos / 600)` |
| `CONSULTATION_STRUCTURING` | LLM/Gemini | 1 |
| SOAP, indicaciones y otros usos | política existente | sin cambio |

Reglas:

- El portal es la autoridad para cobrar OpenAI; no confía en un costo enviado por desktop.
- `runId` es único por médico y hace idempotente el crédito.
- La reserva se crea antes de llamar al proveedor para impedir carreras concurrentes.
- Una respuesta exitosa consume el crédito calculado con la duración autoritativa, aunque el médico descarte después el borrador.
- Toda transcripción remota exitosa consume al menos `1 crédito`.
- Los límites son inclusivos por bloque: normal de `1–900` segundos cuesta `1`; diarizada de `1–600` segundos cuesta `1`.
- El modo forma parte de la identidad idempotente. Reutilizar un `runId` con otro modo se rechaza.
- Un fallo de validación, autenticación, red, OpenAI o parsing marca el intento como `FAILED` y consume `0 créditos`.
- Un reintento con el mismo `runId` nunca crea un segundo crédito.
- Como el texto no puede persistirse en el portal, si OpenAI completó pero la respuesta al desktop se perdió, un reintento con el mismo `runId` puede repetir la llamada al proveedor para reconstruir el resultado, pero no vuelve a cobrar al médico.
- Solicitudes simultáneas con el mismo `runId` reciben conflicto mientras la primera esté en curso.
- El comportamiento comercial vigente se conserva: el saldo agotado no bloquea en seco una consulta crítica; registra sobreconsumo. La capacidad IA o suscripción no habilitada sí rechaza el uso de nube.

El registro `AiUsageLog` contiene solo datos operativos: médico, `runId`, proveedor, modelo, estado, crédito, costo estimado, latencia y fechas. No contiene audio ni transcripción.

También registra `durationSeconds` y `transcriptionMode` como metadata `OPERATIVO`. Estos campos no contienen contenido clínico.

El esquema Prisma incorporará ambos campos mediante una migración versionada:

- `durationSeconds Int?`
- `transcriptionMode String?`

No se almacenarán `segments`, etiquetas de hablante, timestamps ni texto transcrito en el portal.

## Diarización y asignación de hablantes

OpenAI devuelve etiquetas anónimas como `speaker_0` y `speaker_1`. MiDoc no presume que la primera voz sea el médico.

La app:

1. Agrupa los segmentos por etiqueta de hablante.
2. Presenta cada etiqueta como `Hablante 1`, `Hablante 2`, etc.
3. Permite asignar a cada grupo uno de estos roles:
   - `Médico`
   - `Paciente`
   - `Acompañante`
   - `Otro`
4. Permite corregir el rol o texto de cada turno.
5. Exige revisar la asignación antes de enviar el diálogo a Gemini.

No se enviarán clips de referencia mediante `known_speaker_names[]` o `known_speaker_references[]`. Evitar muestras biométricas reduce exposición y mantiene el envío en el mínimo necesario.

Los timestamps son evidencia local para revisión y no se envían al acomodo con Gemini salvo que una necesidad funcional futura lo justifique.

## Seguridad, privacidad y cumplimiento

Audio y transcripción son datos `CLINICO`.

Controles obligatorios:

- HTTPS entre desktop, portal y OpenAI.
- Autenticación con el dispositivo activo.
- Consentimiento de voz validado localmente antes del envío.
- Límite máximo de `25 MB`, alineado con la API de OpenAI.
- Formatos inicialmente permitidos: WAV; ampliar formatos exige validación y pruebas.
- Timeouts explícitos hacia OpenAI.
- Rate limit por dispositivo y médico.
- La API key se obtiene de variables de entorno y nunca se devuelve al cliente.
- Cuerpos multipart, bytes, transcripciones y errores del proveedor no se escriben en logs, auditoría, analytics, trazas ni base de datos.
- Los errores para el cliente son tipados y sanitizados.
- La auditoría registra IDs, proveedor, estado y crédito, nunca contenido.
- No se reenvía el nombre original del archivo: el portal usa un nombre neutro como `consultation.wav`.
- El route handler no usa colas, almacenamiento temporal, object storage ni reintentos diferidos que persistan el cuerpo.

Variables previstas:

```text
OPENAI_API_KEY
OPENAI_TRANSCRIPTION_ENABLED
OPENAI_TRANSCRIPTION_MODEL
OPENAI_DIARIZATION_MODEL
OPENAI_TRANSCRIPTION_ZDR_APPROVED
```

La validación de entorno exige clave, modelo y confirmación de ZDR cuando la función está habilitada. En producción, `OPENAI_TRANSCRIPTION_ENABLED=true` sin `OPENAI_TRANSCRIPTION_ZDR_APPROVED=true` debe impedir el arranque o deshabilitar explícitamente el endpoint.

El despliegue real requiere además verificación humana/documental del BAA aplicable. Una variable de entorno no sustituye el contrato; solo evita una activación accidental.

## Experiencia de usuario

En la consulta se reemplaza el checkbox ambiguo de respaldo por un selector explícito:

- `Whisper local`  
  Sin costo de créditos. El audio no sale de esta computadora.

- `OpenAI nube · 1 crédito por cada 15 min iniciados`: transcripción simple. El audio se procesa temporalmente fuera del equipo.

- `OpenAI nube con hablantes · 1 crédito por cada 10 min iniciados`: separa voces para que el médico confirme quién habló. El audio se procesa temporalmente fuera del equipo.

Comportamiento:

- Whisper local queda seleccionado por defecto.
- Las opciones OpenAI muestran una advertencia breve sobre salida del audio.
- La UI muestra una estimación basada en la duración capturada localmente y aclara que el portal confirmará el cargo.
- Si el equipo no está vinculado, la nube aparece deshabilitada con guía para vincularlo.
- Si el portal informa capacidad no disponible o configuración de cumplimiento deshabilitada, la UI ofrece continuar con Whisper local.
- Un error remoto no activa fallback automático: el médico decide reintentar o cambiar a local.
- El borrador sigue mostrando proveedor, modelo, duración, latencia y crédito consumido.
- En modo diarizado se muestra la lista de turnos y la asignación de roles antes del acomodo.
- El acomodo en plantilla explica que es una acción posterior de `1 crédito`.

La pantalla de configuración de transcripción mantiene la descarga de modelos locales y aclara que la nube es opcional, no sustituto obligatorio.

## Errores

El portal devuelve códigos estables sin contenido clínico:

- `401`: dispositivo no autorizado.
- `403`: capacidad IA, BAA/ZDR o proveedor no habilitado.
- `409`: `runId` en curso o reutilizado con datos incompatibles.
- `413`: audio mayor a 25 MB.
- `415`: formato no soportado.
- `422`: multipart o respuesta del proveedor inválidos.
- `429`: límite de uso temporal.
- `502`: OpenAI rechazó o devolvió una respuesta inválida.
- `504`: timeout de OpenAI.

La app traduce estos errores a mensajes en español y preserva el audio solamente durante la operación actual para permitir que el médico elija un reintento inmediato. Al abandonar la operación, se libera.

## Pruebas

### Portal: unidad

- Whisper local cuesta `0 créditos`.
- OpenAI normal cobra por bloques de 900 segundos.
- OpenAI diarizada cobra por bloques de 600 segundos.
- `CONSULTATION_STRUCTURING` conserva `1 crédito`.
- La configuración rechaza activar nube sin clave, modelo o confirmación ZDR.
- El parser acepta `{ "text": "..." }` y rechaza respuestas vacías o mal formadas.
- El parser diarizado exige segmentos con hablante, tiempos válidos y texto.
- El proveedor diarizado envía `gpt-4o-transcribe-diarize`, `diarized_json` y `chunking_strategy=auto`.
- El proveedor no envía muestras de voz conocidas.
- El cálculo normal redondea cada 900 segundos hacia arriba.
- El cálculo diarizado redondea cada 600 segundos hacia arriba.
- Un WAV sin duración válida, vacío o mal formado impide la llamada y el cobro.
- Cuando OpenAI devuelve `usage.seconds`, una discrepancia fuera de tolerancia se rechaza y no cobra.
- El proveedor envía Bearer, multipart, nombre neutro y modelo configurado.
- Ningún error incluye el audio, la transcripción ni el cuerpo devuelto por OpenAI.

### Portal: integración

- Rechaza dispositivo inválido.
- Rechaza plan sin capacidad IA.
- Rechaza audio vacío, formato inválido y archivo mayor a 25 MB.
- Camino feliz normal devuelve transcripción y registra el crédito por bloques de 15 minutos.
- Camino feliz diarizado devuelve segmentos y registra el crédito por bloques de 10 minutos.
- Audios en los límites `600`, `601`, `900` y `901` segundos cobran correctamente.
- La duración enviada por desktop no altera el cobro basado en el WAV validado por el portal.
- Fallo del proveedor registra `FAILED` y cero crédito.
- Dos solicitudes con el mismo `runId` no duplican crédito.
- Dos solicitudes concurrentes con el mismo `runId` ejecutan una sola reserva.
- La base no contiene bytes de audio ni texto transcrito después del camino feliz y del fallo.
- El reporte posterior de desktop actualiza el mismo `runId` sin modificar el crédito autoritativo.

Las pruebas usan un proveedor falso; nunca llaman a OpenAI real.

### Desktop: Rust

- El proveedor remoto exige portal y token vinculados.
- Envía únicamente los campos aprobados.
- Conserva el `runId` entre la llamada remota, el borrador local y el reporte de uso.
- Conserva segmentos diarizados y timestamps solo en la base local cifrada.
- Convierte etiquetas anónimas en turnos revisables sin asumir Médico/Paciente.
- Un error remoto no crea un borrador exitoso.
- Whisper local continúa funcionando y reportándose como proveedor local.

### Desktop: UI

- Local está seleccionado por defecto.
- El selector muestra con claridad las tres tarifas.
- La estimación de créditos cambia con duración y modo.
- Nube se deshabilita sin vínculo.
- Error remoto ofrece reintentar o volver a local.
- Diarización exige confirmar roles antes del acomodo.
- Acomodar en plantilla comunica el crédito independiente.

## Verificación

Portal:

```bash
npm run test
npm run lint
npm run build
```

Desktop:

```bash
npm run build
cargo test
cargo clippy --all-targets -- -D warnings
```

Cuando el entorno nativo esté disponible:

```bash
cargo test --features whisper-local
```

La prueba manual con OpenAI real solo se ejecutará en staging, con cuenta aprobada para BAA/ZDR, audio autorizado y sin datos identificables.

## Fuera de alcance

- Transcripción en tiempo real o streaming.
- Persistir audio o transcript en el portal.
- Credenciales de OpenAI por médico.
- Fallback automático entre OpenAI y Whisper local.
- Identificación biométrica de hablantes mediante muestras de voz.
- Cobro fraccionario o exacto por segundo.
- Comprar bolsas de créditos desde la app de escritorio.
