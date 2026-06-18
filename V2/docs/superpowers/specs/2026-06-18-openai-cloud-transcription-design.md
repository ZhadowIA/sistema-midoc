# Transcripción de consulta con OpenAI administrada por MiDoc

Fecha: 2026-06-18  
Estado: aprobado para especificación, pendiente de plan de implementación  
Superficies: `V2/desktop-app`, `V2/consultorio-app`  
Pasos: 15 — transcripción local real; 16 — proveedores de IA reales en staging

## Objetivo

Mantener Whisper local como la opción predeterminada y gratuita en créditos, y agregar una opción explícita de transcripción en la nube con OpenAI cuyo consumo y credencial sean administrados por MiDoc.

El médico podrá elegir por consulta:

- `Whisper local`: el audio no sale del equipo y consume `0 créditos`.
- `OpenAI nube`: el audio sale transitoriamente del equipo, consume `1 crédito` y requiere consentimiento vigente.

El acomodo posterior de la transcripción dentro de la plantilla clínica mediante Gemini sigue siendo una ejecución independiente de `CONSULTATION_STRUCTURING` y consume `1 crédito`.

## Decisiones aprobadas

- MiDoc cubre el consumo de OpenAI; el médico no configura una API key propia.
- La API key de OpenAI vive solamente en el entorno seguro del portal.
- La app de escritorio nunca recibe, almacena ni conoce la API key.
- La llamada a OpenAI se realiza mediante un endpoint autenticado del portal MiDoc.
- El portal procesa audio y transcripción únicamente en memoria y no persiste contenido clínico.
- El modelo inicial es `gpt-4o-mini-transcribe`, configurable por entorno.
- OpenAI nube consume `1 crédito` por transcripción completada.
- Whisper local consume `0 créditos`.
- Una llamada posterior a Gemini para acomodar la transcripción consume su propio crédito.
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
```

Respuesta exitosa:

```json
{
  "runId": "uuid",
  "provider": "openai",
  "modelVersion": "gpt-4o-mini-transcribe",
  "transcriptText": "texto",
  "estimatedCostCents": 0,
  "latencyMs": 1234,
  "creditCost": 1
}
```

El costo monetario estimado puede permanecer en `0` hasta que exista una tabla de precios versionada. No se inventará un costo a partir de una tarifa recordada.

El route handler será una frontera fina. Delegará en:

- Un servicio de transcripción gobernada que autentica el dispositivo, verifica la capacidad IA y coordina la reserva.
- Un proveedor OpenAI que construye la petición `multipart/form-data` a `/v1/audio/transcriptions`, usa `Authorization: Bearer`, solicita respuesta JSON y valida `{ text }`.
- La política central de créditos.

### App de escritorio

La app conserva el proveedor local existente y sustituye el adaptador directo de nube estilo Deepgram por un proveedor de portal MiDoc.

El proveedor remoto recibe:

- URL del portal vinculada.
- Token de dispositivo almacenado en la base local cifrada.
- `runId` generado antes de iniciar la llamada.
- Bytes del audio y metadata mínima.

No recibe una clave de OpenAI ni llama directamente a OpenAI.

Al obtener respuesta, la app guarda la transcripción como borrador en la base SQLite cifrada usando el mismo `runId`. La revisión humana, aplicación o descarte siguen el flujo existente.

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

1. El médico confirma el consentimiento de voz y elige `OpenAI nube — 1 crédito`.
2. La app genera un `runId`.
3. La app envía `runId`, audio y duración al portal mediante HTTPS y token de dispositivo.
4. El portal valida autenticación, capacidad IA, configuración de cumplimiento, tamaño y tipo del archivo.
5. El portal crea o recupera la reserva idempotente asociada a `(doctorId, runId)`.
6. El portal envía el archivo a OpenAI en memoria.
7. El portal valida la respuesta y marca el uso como completado con costo de `1 crédito`.
8. El portal devuelve la transcripción a la app sin almacenarla.
9. La app descarta los bytes de audio y guarda el borrador en SQLite cifrado.
10. La sincronización posterior actualiza el mismo registro por `runId` con el estado de revisión, sin cobrar otro crédito.

El portal nunca recibe nombre del paciente, identificador de encuentro, nombre original del archivo ni texto de plantilla. El `runId` es operativo y no codifica información clínica.

## Créditos e idempotencia

La política central deja de depender solamente de `usageType`. Considerará también el origen:

| Uso | Origen | Créditos |
|---|---|---:|
| `TRANSCRIPTION` | proveedor `whisper-local-*` | 0 |
| `TRANSCRIPTION` | endpoint gobernado OpenAI | 1 |
| `CONSULTATION_STRUCTURING` | LLM/Gemini | 1 |
| SOAP, indicaciones y otros usos | política existente | sin cambio |

Reglas:

- El portal es la autoridad para cobrar OpenAI; no confía en un costo enviado por desktop.
- `runId` es único por médico y hace idempotente el crédito.
- La reserva se crea antes de llamar al proveedor para impedir carreras concurrentes.
- Una respuesta exitosa consume exactamente `1 crédito`, aunque el médico descarte después el borrador.
- Un fallo de validación, autenticación, red, OpenAI o parsing marca el intento como `FAILED` y consume `0 créditos`.
- Un reintento con el mismo `runId` nunca crea un segundo crédito.
- Como el texto no puede persistirse en el portal, si OpenAI completó pero la respuesta al desktop se perdió, un reintento con el mismo `runId` puede repetir la llamada al proveedor para reconstruir el resultado, pero no vuelve a cobrar al médico.
- Solicitudes simultáneas con el mismo `runId` reciben conflicto mientras la primera esté en curso.
- El comportamiento comercial vigente se conserva: el saldo agotado no bloquea en seco una consulta crítica; registra sobreconsumo. La capacidad IA o suscripción no habilitada sí rechaza el uso de nube.

El registro `AiUsageLog` contiene solo datos operativos: médico, `runId`, proveedor, modelo, estado, crédito, costo estimado, latencia y fechas. No contiene audio ni transcripción.

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
OPENAI_TRANSCRIPTION_ZDR_APPROVED
```

La validación de entorno exige clave, modelo y confirmación de ZDR cuando la función está habilitada. En producción, `OPENAI_TRANSCRIPTION_ENABLED=true` sin `OPENAI_TRANSCRIPTION_ZDR_APPROVED=true` debe impedir el arranque o deshabilitar explícitamente el endpoint.

El despliegue real requiere además verificación humana/documental del BAA aplicable. Una variable de entorno no sustituye el contrato; solo evita una activación accidental.

## Experiencia de usuario

En la consulta se reemplaza el checkbox ambiguo de respaldo por un selector explícito:

- `Whisper local`  
  Sin costo de créditos. El audio no sale de esta computadora.

- `OpenAI nube · 1 crédito`  
  Puede ser más rápido en equipos lentos. El audio se procesa temporalmente fuera del equipo.

Comportamiento:

- Whisper local queda seleccionado por defecto.
- La opción OpenAI muestra una advertencia breve sobre salida del audio.
- Si el equipo no está vinculado, la nube aparece deshabilitada con guía para vincularlo.
- Si el portal informa capacidad no disponible o configuración de cumplimiento deshabilitada, la UI ofrece continuar con Whisper local.
- Un error remoto no activa fallback automático: el médico decide reintentar o cambiar a local.
- El borrador sigue mostrando proveedor, modelo, latencia y crédito consumido.
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
- OpenAI nube cuesta `1 crédito`.
- `CONSULTATION_STRUCTURING` conserva `1 crédito`.
- La configuración rechaza activar nube sin clave, modelo o confirmación ZDR.
- El parser acepta `{ "text": "..." }` y rechaza respuestas vacías o mal formadas.
- El proveedor envía Bearer, multipart, nombre neutro y modelo configurado.
- Ningún error incluye el audio, la transcripción ni el cuerpo devuelto por OpenAI.

### Portal: integración

- Rechaza dispositivo inválido.
- Rechaza plan sin capacidad IA.
- Rechaza audio vacío, formato inválido y archivo mayor a 25 MB.
- Camino feliz devuelve transcripción y registra una sola unidad de crédito.
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
- Un error remoto no crea un borrador exitoso.
- Whisper local continúa funcionando y reportándose como proveedor local.

### Desktop: UI

- Local está seleccionado por defecto.
- El selector muestra con claridad `0` y `1` crédito.
- Nube se deshabilita sin vínculo.
- Error remoto ofrece reintentar o volver a local.
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
- Diarización automática con `gpt-4o-transcribe-diarize`.
- Persistir audio o transcript en el portal.
- Credenciales de OpenAI por médico.
- Fallback automático entre OpenAI y Whisper local.
- Cobro variable por minutos en esta primera versión.
- Comprar bolsas de créditos desde la app de escritorio.
