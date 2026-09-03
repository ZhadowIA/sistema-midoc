# 13 - Contrato de sincronizacion app del medico ↔ portal nube

Estado: **diseño aprobable** (2026-06-09). Este documento define el protocolo antes de implementarlo; cambiarlo despues de implementado requiere PR justificado (regla 11).

## Proposito

La app de escritorio es la fuente de verdad clinica; el portal es agenda publica y buzon temporal. La sincronizacion transporta lo minimo en cada direccion y **purga el buzon** una vez confirmada la entrega. Ningun dato clinico queda en nube de forma permanente (regla de residencia 1, `01_contexto_v2.md`).

## Principios

1. **Pull desde la app, nunca push desde la nube.** El portal jamas inicia conexiones hacia el equipo del medico. La app sincroniza al abrir, periodicamente mientras esta abierta, y manualmente.
2. **El buzon es cola, no almacen.** Todo elemento entregado y confirmado (ACK) se purga de la nube. El tiempo de vida maximo de un elemento no reclamado es de 30 dias; despues se purga con aviso al medico.
3. **Idempotencia total.** Toda operacion puede repetirse sin duplicar efectos (la red del consultorio se cae a mitad de sync).
4. **Cada lado es dueño de lo suyo.** Conflictos se resuelven por propiedad, no por timestamp: el portal es dueño de la *creacion* de citas publicas y datos de contacto capturados por el paciente; la app es dueña del *estado clinico* y de la disponibilidad.

## Autenticacion del dispositivo

- Al vincular la app (primer login del medico en el escritorio), el portal emite un **device token** opaco (mismo patron que `AuthSession`: token aleatorio, hash SHA-256 en BD, revocable) con alcance `sync` y vida larga (90 dias, renovacion automatica en cada sync exitoso).
- Header: `Authorization: Bearer <deviceToken>`. Un dispositivo activo por medico en MVP; vincular uno nuevo revoca el anterior (alcance "un dispositivo" de `01_contexto_v2.md`).
- Todos los endpoints de sync viven bajo `/api/sync/*`, con rate limit por dispositivo y auditoria de cada llamada.

## Que viaja y en que direccion

| Entidad | Direccion | Contenido | Purga tras ACK |
|---|---|---|---|
| Cita nueva / reagendada / cancelada / confirmada | nube → app | id, horario, estado, servicio, motivo, datos de contacto del paciente | No (la cita operativa vive en ambos lados; solo metadatos no clinicos) |
| Preconsulta enviada | nube → app | respuestas del cuestionario | **Si** — es dato clinico; ademas purga por TTL a los 30 dias sin ACK |
| Documento subido por paciente | nube → app | archivo cifrado + metadatos | **Si** — es dato clinico; ademas purga por TTL a los 30 dias sin ACK |
| Disponibilidad (reglas y bloqueos) | app → nube | reglas semanales, excepciones, bloqueos | n/a (estado publicado) |
| Estado de cita decidido por el medico | app → nube | COMPLETED / CANCELLED / reagendada por el medico | n/a |
| Resumen autorizado al paciente | app → nube | PDF cifrado con enlace temporal y expiracion | Si — al expirar el enlace |

Lo que **nunca** viaja a la nube: notas SOAP, recetas, diagnosticos, historia clinica, odontograma, resultados de IA.

## Endpoints

### `GET /api/sync/inbox?cursor=<n>`

Devuelve eventos pendientes para el dispositivo en orden, con un cursor monotono:

```json
{
  "events": [
    { "seq": 41, "type": "APPOINTMENT_BOOKED", "payload": { } },
    { "seq": 42, "type": "PRECHECKIN_SUBMITTED", "payload": { } }
  ],
  "nextCursor": 42
}
```

- `seq` es por-medico, monotono, asignado al crear el evento (tabla `SyncEvent` en el portal).
- La app persiste su cursor localmente; repetir la peticion con el mismo cursor devuelve los mismos eventos (idempotente).
- Lotes de maximo 100 eventos; la app itera hasta vaciar.

### `POST /api/sync/ack { "cursor": 42 }`

Confirma la recepcion hasta `seq <= cursor`. El portal entonces:
1. Marca los eventos como entregados.
2. **Purga el contenido clinico** referenciado (respuestas de preconsulta, archivos del buzon) y deja solo un registro de auditoria sin contenido (`purgedAt`, tipo, ids).

El ACK es la frontera legal: antes del ACK el dato clinico existe cifrado en nube con TTL; despues solo existe en el equipo del medico.

**Purga por TTL (sin ACK).** Si la app nunca confirma (equipo apagado, dispositivo desvinculado), el mantenimiento programado (`POST /api/internal/maintenance/cleanup`, cada hora desde `.github/workflows/cron-jobs.yml`) purga el contenido clinico a los 30 dias (`MAILBOX_RETENTION_DAYS`): documentos del buzon por fecha de alta y preconsultas por `expiresAt`, que cada reenvio del paciente reinicia. La purga deja el mismo rastro que el ACK (`purgedAt`, sin contenido) pero con `deliveredAt` nulo, y vacia el `payload` del `SyncEvent` asociado: el inbox sigue entregando el evento sin contenido y la app lo ignora sin romper; si pide el elemento por id recibe `410`.

### `PUT /api/sync/availability`

La app publica el snapshot completo de reglas y bloqueos (no deltas: el snapshot es idempotente por naturaleza y elimina drift). El portal reemplaza el estado publicado de forma transaccional.

### `POST /api/sync/appointment-actions`

Lote de acciones del medico sobre citas, cada una con `actionId` (UUID generado por la app) para idempotencia:

```json
{ "actions": [ { "actionId": "…", "appointmentId": "…", "type": "COMPLETE" } ] }
```

El portal aplica las no procesadas, ignora las repetidas y responde el resultado por accion.

## Resolucion de conflictos

| Conflicto | Regla |
|---|---|
| Paciente reagenda en portal mientras el medico edita la cita offline | La accion del medico llega con `actionId` y el portal la aplica *sobre* el estado actual; si la cita ya cambio (p.ej. cancelada por el paciente), la accion se rechaza con motivo y la app muestra el evento al medico. El paciente nunca pierde una cancelacion. |
| Doble reagendado simultaneo | El portal es el arbitro de la agenda publica: las transacciones serializables del paso 3 deciden; el perdedor recibe el evento corregido en el siguiente inbox. |
| Disponibilidad editada en app vieja vs portal | La app es dueña: el ultimo `PUT /api/sync/availability` gana. El portal no permite editar disponibilidad directamente cuando hay dispositivo vinculado. |

## Manejo de fallas

- **Red cae a mitad de inbox**: la app reintenta con el mismo cursor; nada se pierde (la purga solo ocurre tras ACK).
- **ACK se pierde**: la app re-ACKea; el portal lo trata como repetido.
- **Dispositivo perdido/robado**: el medico revoca el device token desde el portal (o soporte); el buzon retiene los eventos no entregados hasta vincular el dispositivo restaurado desde respaldo.
- **Reloj del cliente**: irrelevante; el orden lo da `seq` del servidor.

## Implementacion por fases

1. **Fase A (cierra paso 3):** `SyncEvent` + device token + `GET inbox` + `POST ack` con purga de preconsultas, y emision de eventos desde el booking publico. Cliente Rust minimo en la app que descarga citas y las guarda en SQLite.
2. **Fase B (paso 6 — IMPLEMENTADA):** documentos del buzon (archivos cifrados E2E) y resumen autorizado. Detalle abajo.
3. **Fase C (paso 6-7):** `PUT availability` y `appointment-actions` (mientras tanto, el medico gestiona disponibilidad en el portal). Pendiente.

### Fase B implementada (paso 6)

- **Documentos del paciente → medico (buzon):** el paciente cifra cada archivo en su navegador con un *sealed box* (X25519) usando la llave publica del medico (publicada en `SyncDevice.documentPublicKey` al vincular). La nube guarda solo ciphertext en `MailboxDocument` y jamas puede leerlo. La app descarga via `GET /api/sync/documents/[id]`, descifra con `crypto_box_seal`/`dryoc`, y el `POST ack` purga el ciphertext (frontera legal). El nombre y tipo del archivo viajan dentro del sobre cifrado `[metaLen|metaJSON|bytes]`.
- **Resumen autorizado medico → paciente:** la app cifra el PDF con *secretbox* (llave nueva por resumen), lo publica via `POST /api/sync/summaries`, y arma un enlace temporal `/resumen/[token]#k=<llave>`. La llave viaja **solo en el fragmento del enlace**, nunca al servidor: la nube guarda ciphertext que no puede abrir. Enlace con expiracion y purga; acceso auditado.

## Preguntas abiertas — RESUELTAS (2026-06-10)

- **Cifrado de archivos del buzon:** se eligio **cifrado del lado del paciente con la llave publica del medico** (sealed box E2E): la nube nunca puede leer, alineado con la promesa local-first. (La alternativa de llave por-medico derivada en el portal se descarto.)
- **Tamaño y formatos:** archivo en claro ≤ 8 MB (ciphertext ≤ 12 MB en el servidor); formatos sugeridos en la carga del paciente: pdf, jpg/jpeg, png, webp, heic. El resumen autorizado usa el mismo tope de ciphertext.
