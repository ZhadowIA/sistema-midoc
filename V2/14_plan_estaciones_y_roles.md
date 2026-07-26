# Plan — Estaciones y separacion de roles (recepcion / clinica)

Estado: PLANEADO (2026-07-25). No implementado. Decisiones cerradas.
Abierto como **paso 27** en `10_linea_de_desarrollo.md`.

Nomenclatura: lo que aqui son **Fases 0-3** son las **Rebanadas 1-4** del paso
27 (Fase 0 = Rebanada 1, y asi sucesivamente). Este documento lleva el detalle
de diseño; la linea de desarrollo lleva el encuadre, la compuerta y el estado.

## 1. Problema

Hoy la app del medico no tiene usuarios. `unlock_database` entrega la
passphrase directo a `PRAGMA key` de SQLCipher (`lib.rs:291`) y guarda una sola
conexion en `AppDb(Mutex<Option<Connection>>)` (`lib.rs:39`): existe una llave
que abre todo o no abre nada. Los 100 comandos Tauri estan abiertos y
`clinical_audit` (`db.rs:113`) registra `entity/entity_id/action/at/details`
sin columna de actor.

Los "perfiles" (`profile_id`, `profile_database_path`) no son usuarios: cada
perfil es una **base de datos distinta**, pensada para dos medicos que
comparten equipo.

`12_inventario_funcional_v1.md:57` difirio multi-usuario de forma explicita
("un dispositivo por consultorio en MVP"). Este plan revierte esa decision y
debe registrar por que.

## 2. Los dos despliegues que hay que soportar

| Modo | Equipos | Quien opera |
|---|---|---|
| `ESTACION_UNICA` | 1 | El medico se administra solo: hace llegada, atiende y cobra. |
| `ESTACION_CLINICA` + `ESTACION_RECEPCION` | 2 | Recepcionista en su propia computadora; medico en la suya. |

**Un solo binario, un interruptor de despliegue.** El modo se elige al
instalar y determina que bases existen en ese equipo y que carriles de
sincronizacion se activan. `ESTACION_UNICA` es el caso degenerado del modelo
de dos estaciones: ambas bases en el mismo disco, sin relevo entre equipos.

Consecuencia de diseno: **no se construye "modo solo" y luego "modo con
recepcionista"**. Se construye el modelo de dos estaciones y el solo es una
configuracion suya. Al reves obliga a reescribir.

## 3. Correccion sobre el costo del corte

En la conversacion previa afirme que separar las bases "rompe los JOIN y
FOREIGN KEY que hoy conectan `visits` con `encounters`". **Es incorrecto** y
cambia la recomendacion: el corte es mucho mas barato de lo que estimé.

Verificado en el esquema:

- `visits.patient_id`, `visits.encounter_id`, `visits.appointment_id`,
  `payments.patient_id` y `payments.appointment_id` son **TEXT sin
  `REFERENCES`**: referencias suaves por id, no claves foraneas.
- `operations.rs` solo tiene dos JOIN y ambos son internos al bloque
  operativo: `visits ← resources` (lineas 194 y 229).
- `visits` ya **desnormaliza** `patient_name` y `patient_phone`, asi que la
  lista de espera no necesita la tabla `patients` para pintarse.

Existe **una sola arista dura** que cruza la frontera:
`payments.budget_id → dental_budgets(id)` (migracion v22) mas la lectura
`FROM payments WHERE budget_id = ?1` en `dental.rs:134` para calcular saldos.

El bloque OPERATIVO es, en la practica, autocontenido. Separar bases es la via
**barata**, no la cara.

## 4. Frontera de datos

**OPERATIVO — vive en las dos estaciones**
`resources`, `visits`, `cash_sessions`, `payments`, `dental_lab_orders`, y las
tablas nuevas `stations` y `payment_allocations`.

El **saldo a favor** del paciente no es una tabla: se deriva de
`payments − payment_allocations` (ver §4.1). Nada que mantener en sync.

La asimetria del despliegue de dos equipos es en un solo sentido: la estacion
clinica tiene **las dos** bases (atiende y tambien cobra); la de recepcion
tiene **solo** la operativa.

**FACTURABLE — concepto clinico que el medico libera a la estacion operativa**
Clase nueva (ver §4.3). Extracto de cobro: `budget_id`, `patient_id`,
`total_cents`, `status` y el **concepto facturable** que ira en el recibo. La
estacion clinica es la autoridad y lo empuja; la operativa solo lo lee.

**CONTACTO — replicado a ambas estaciones**
Identidad del paciente: `id`, `first_name`, `last_name`, `phone`, `email`,
`birth_date`, `sex`. Hoy viven en `patients` mezcladas con lo clinico.

**CLINICO — nunca sale de la estacion clinica**
`encounters`, `note_versions`, `prescriptions`, `documents`, `precheckins`,
`patient_medical_history_versions`, `consultation_transcriptions`, `ai_*`,
`arco_requests`, `dental_budgets`, `dental_budget_items`, y las columnas
`allergies`, `medical_background`, `family_background` de `patients`.

En la estacion de recepcion lo CLINICO **no existe como archivo**. No es un
permiso que se pueda saltar: es ausencia. Eso es lo que distingue esta version
de la minima que describi antes.

### 4.1 Cobro y aplicacion son dos cosas distintas

Decidido 2026-07-25: el excedente de un abono se vuelve **saldo a favor del
paciente**, aplicable a otro presupuesto suyo. Eso obliga a separar un concepto
que hoy esta fundido en una sola columna.

`payments.budget_id` significa hoy dos cosas a la vez: *se recibio este dinero*
y *este dinero se aplica al presupuesto B*. En cuanto el excedente existe, hay
que partirlas, porque tienen naturalezas opuestas:

- **`payments` = hecho.** Dinero recibido, con folio. **Inmutable**: un recibo
  emitido no se reescribe nunca.
- **`payment_allocations` (`payment_id`, `budget_id`, `amount_cents`) = decision
  contable.** Como se reparte ese dinero. **Mutable y reversible.**

Invariante: `SUM(allocations de un pago) <= payments.amount_cents`. Lo no
asignado **es** el saldo a favor. Aplicar saldo a un presupuesto nuevo es
insertar una asignacion, sin cobro nuevo ni folio nuevo.

Consecuencia: `paid_cents` (`dental.rs:130`) deja de sumar `payments WHERE
budget_id = ?` y pasa a sumar asignaciones. La migracion convierte cada
`budget_id` actual en una asignacion por el monto completo del pago.

Esta separacion es tambien lo que hace que la fusion entre estaciones converja
sola (§6.3).

### 4.2 El dinero que entra es hecho; el que sale es decision

Decidido 2026-07-25: **solo el medico autoriza reembolsos del saldo a favor.**

La asimetria es real y conviene nombrarla, porque de ella sale todo el diseno:

- Un **cobro** ya ocurrio cuando el sistema se entera. No se puede rechazar
  (§6.3): se registra y, si sobra, cae en saldo a favor.
- Un **reembolso** es dinero que aun no sale. Si se puede retener. Es la unica
  operacion de caja que admite una compuerta sin mentirle a la contabilidad.

Por eso el reembolso de saldo a favor es la primera operacion del sistema que
necesita **autorizacion cruzada entre estaciones**, y no rompe la propiedad de
convergencia: no converge sola a proposito.

Dos caminos, ambos necesarios:

1. **Medico presente.** Autoriza en el momento sobre la maquina de recepcion,
   con el cambio rapido de usuario (Fase 1, punto 15). Es el caso comun en un
   consultorio de dos equipos en la misma sala.
2. **Medico ausente.** Recepcion captura una **solicitud de reembolso** que
   queda `PENDING`. No se entrega dinero. El medico la aprueba desde su
   estacion; al llegar la aprobacion por el relevo, recepcion emite el pago y
   entrega el efectivo.

La autorizacion va atada a `(patient_id, amount_cents, request_id)` y es **de
un solo uso**: se consume al crear la fila de `payments`. Sin eso, una
aprobacion podria aplicarse dos veces — una en cada camino.

Bitacora: el reembolso registra **dos actores**, quien autorizo y quien entrego
el efectivo. Es el unico movimiento de caja con responsabilidad de dos personas,
y es justo el que la necesita.

### 4.3 El recibo lleva el tratamiento: clase FACTURABLE

Decidido 2026-07-25: **el recibo detalla el tratamiento**, porque se entrega al
paciente y un recibo que no dice que se pago no sirve.

Esto obliga a rediseñar la frontera, no solo a aflojarla. Hasta aqui el corte
era binario (CLINICO no cruza). Ahora hay texto de origen clinico viviendo en
la estacion operativa, y la clasificacion obligatoria de
`REGLAS_DESARROLLO.md:47` necesita una clase mas:

> **FACTURABLE** — descripcion del **procedimiento cobrado**, redactada o
> confirmada por el medico, que reside en la estacion operativa y se imprime en
> el recibo. Es el minimo necesario para cobrar y comprobar.

Tres reglas que la hacen sostenible:

1. **Nada fluye solo.** El concepto no se copia de la nota ni del odontograma.
   El medico lo redacta o lo confirma **al aceptar el presupuesto**, y ese acto
   explicito es lo que lo libera a la estacion operativa. Mismo patron de
   "nada sale sin aprobacion" que ya gobierna la IA en el paso 11.
2. **Procedimiento cobrado, no razonamiento clinico.** Cruza "Corona de
   porcelana, pieza 26". No cruzan diagnostico, hallazgos, evolucion,
   antecedentes ni nota. La linea sigue siendo dura, solo se movio.
3. **Se puede apagar por perfil.** `ClinicalProfile` ya distingue
   `ODONTOLOGY` de `GENERAL_MEDICINE` (`clinicalProfiles.ts:1`). En odontologia
   el detalle es normal y esperado; en otras especialidades un recibo que
   nombra el procedimiento es un problema serio de privacidad. Ajuste por
   consultorio con tres niveles: **detallado** ("Corona de porcelana, pieza
   26"), **generico** ("Tratamiento dental", "Consulta medica") y **solo
   monto**.

   Defaults confirmados (2026-07-25): `ODONTOLOGY` → **detallado**;
   `GENERAL_MEDICINE` → **generico**. El medico puede subirlo o bajarlo, pero
   un consultorio recien instalado nunca empieza filtrando de menos: fuera de
   odontologia hay que pedir el detalle a proposito.

**Costo real, dicho sin adorno:** la recepcionista pasa a conocer el historial
de tratamientos de todo paciente que pague, y el `operativo.db` copiado lo
contiene. En odontologia es tolerable; por eso el nivel es configurable y no
una constante.

La compuerta de la Fase 2 cambia en consecuencia: ya no es "cero filas
clinicas", es **"solo conceptos FACTURABLE liberados por el medico"**, y la
prueba tiene que verificar justo eso.

**Retencion:** el concepto es parte del comprobante y sobrevive al borrado
clinico, como el resto de lo contable
(`10_linea_de_desarrollo.md:539`). Hay que decirlo en el aviso de privacidad:
un paciente que ejerce supresion deja atras el recibo con su concepto.

**Alcance fiscal:** esto es un **recibo simple**, no un CFDI. En Mexico un
comprobante deducible se timbra con un PAC y arrastra RFC, uso del CFDI,
catalogo de productos y servicios y cancelaciones. Es un paso propio; el diseño
de aqui no lo bloquea, pero tampoco lo cubre.

## 5. Fases

### Fase 0 — Sellar la frontera (sin multiusuario)

Valor propio y desactiva el riesgo del resto. Todo dentro de una sola base,
como hoy.

1. **Partir `patients`.** Nueva tabla `patient_identities` (CONTACTO) con las
   columnas de identidad; `patients` conserva solo lo clinico y su `id` pasa a
   referenciar la identidad. Migrar datos existentes.
2. **Resolver la arista dental.** `payments.budget_id` deja de ser FK a
   `dental_budgets`. El saldo se invierte: la estacion clinica pide el total
   abonado a la operativa (`paid_cents`, `dental.rs:130`), en vez de que la
   operativa valide contra una tabla clinica. `register_payment` deja de llamar
   a `dental::validate_budget_payment` (`operations.rs:677`) y valida contra la
   proyeccion de cobro replicada.
3. **Partir cobro de aplicacion.** Nueva tabla `payment_allocations` (§4.1);
   `payments.budget_id` se migra a una asignacion por pago y la columna se
   retira. `paid_cents` (`dental.rs:130`) pasa a sumar asignaciones. Esta es la
   migracion delicada de la Fase 0: toca datos contables con folio emitido.
4. **Degradar la validacion de saldo a consejo.** Hoy
   `validate_budget_payment` (`dental.rs:409`) **rechaza** un abono mayor al
   saldo. Con dos cajones esa garantia deja de ser sostenible (§6.3), y ademas
   es conceptualmente incorrecta: un cobro que ya ocurrio es un hecho, no una
   solicitud — no se puede rechazar dinero que el paciente ya entrego. Pasa a
   ser aviso en captura, y el excedente cae en saldo a favor. Las dos pruebas
   que hoy afirman el rechazo duro (`dental.rs:824` y `:826`) cambian de
   significado.
5. **Aplicar saldo a favor.** Lectura del saldo por paciente y comando para
   asignarlo a un presupuesto aceptado. Sin cobro ni folio nuevo: es una
   asignacion. Disponible en las dos estaciones (es OPERATIVO).
6. **Solicitud de reembolso.** Tabla `refund_requests` (`id`, `patient_id`,
   `amount_cents`, `status`, `requested_by`, `authorized_by`, `payment_id`) con
   el flujo `PENDING → AUTHORIZED → EMITTED`, mas `REJECTED` y expiracion. La
   autorizacion se consume al emitir (§4.2). En `ESTACION_UNICA` el medico es
   ambos actores y el flujo se colapsa en un paso, pero la fila queda igual —
   asi la bitacora es uniforme en los dos despliegues.
7. **Concepto facturable y recibo imprimible.** Campo de concepto en el
   extracto de cobro, redactado o confirmado por el medico al aceptar el
   presupuesto (§4.3), con el nivel de detalle segun ajuste del consultorio.
   Render del recibo (datos del consultorio, folio, concepto, monto, metodo,
   fecha) a PDF entregable. Nace aqui porque el concepto viaja en las mismas
   tablas que se estan migrando; el render puede ir despues sin rehacer nada.
8. **Aislar `operations.rs`.** Que ningun `INSERT`/`SELECT` toque tablas
   CLINICO. Afecta a `register_walk_in` (`operations.rs:334`), que hoy crea el
   paciente en `patients`: pasa a crear solo la identidad CONTACTO.
9. **Prueba de frontera.** Un test que abra la conexion operativa y falle si
   alguna consulta de `operations.rs` nombra una tabla CLINICO. Con FACTURABLE
   en el mapa, la prueba tambien afirma que el unico texto de origen clinico en
   la operativa es el concepto liberado (§4.3). Es la red que evita que la
   frontera se erosione en pasos futuros.
10. **Estacion como entidad, y folio por estacion.** Tabla `stations`
   (`id`, `code`, `name`, `mode`), y columna `station_id` en `cash_sessions` y
   `payments`. El folio pasa de `R-NNNNNN` a `R-{code}-{NNNNNN}` con contador
   propio por estacion (`receipt_seq_{code}` en `app_meta`), y
   `next_receipt_number` (`operations.rs:639`) recibe la estacion. **Se hace
   aqui, no en la Fase 2**, para no migrar la tabla `payments` dos veces sobre
   datos contables reales. En `ESTACION_UNICA` hay una estacion y el prefijo es
   inocuo.

*Compuerta:* la app sigue comportandose igual con una sola base y un solo
usuario. Suite de Rust y TS en verde.

### Fase 1 — Identidad, llaves y compuerta de comandos

11. **Envoltura de llave.** La base deja de cifrarse con la passphrase. Se
   genera una DEK aleatoria y se hace `PRAGMA rekey`. Junto al `.db` queda
   `keys.json` con una entrada por usuario: `salt`, parametros de Argon2id y
   la DEK envuelta con la credencial de esa persona. Tiene que vivir **fuera**
   de la base: no se puede leer la envoltura desde el archivo que la envoltura
   abre. Backup obligatorio antes del rekey (`db::create_encrypted_backup` ya
   existe y corre en cada unlock) y actualizar `restore_drill.rs`.
12. **Actor en la sesion.** `AppDb` pasa a
   `AppSession { conn, actor_id, role, station_id }`. `unlock_database` resuelve
   que envoltura abrio y fija el rol.
13. **Compuerta central de comandos.** Chequeo que **niega por defecto** sobre
   los 100 comandos, con lista explicita por rol. `RECEPCION` obtiene el bloque
   operativo (`list_active_visits`, `check_in_appointment`, `register_walk_in`,
   `set_visit_state`, `assign_resource`, recursos, caja). **No** obtiene
   `start_visit_encounter`: la recepcionista marca la llegada, pero abrir el
   expediente es del medico.

   Ojo con la forma de la compuerta: `register_payment` **si** esta permitido
   para recepcion, salvo cuando `kind = REFUND` contra saldo no asignado
   (§4.2). Es decir, una lista de comandos no alcanza — el chequeo depende de
   los argumentos. Conviene disenarlo asi desde el principio en vez de
   descubrirlo con un parche.
14. **Actor en la bitacora.** Migracion que agrega
   `actor_id`/`actor_role`/`station_id` y `authorized_by` a `clinical_audit`, y
   lo pasa por el helper `audit()` (`operations.rs:34`). Con dos cajones es el
   punto entero: quien abrio cual caja, quien cobro cada folio, quien cerro, y
   —en un reembolso— quien autorizo ademas de quien entrego el efectivo.
15. **UI por rol y bloqueo.** Navegacion filtrada, bloqueo por inactividad y
   cambio rapido de usuario. Sin el bloqueo lo demas es teatro: el medico deja
   su sesion abierta y la recepcionista opera con sus permisos. El cambio
   rapido es ademas el camino de autorizacion presencial del reembolso (§4.2),
   asi que tiene que ser comodo: si autorizar cuesta, se evita.

*Compuerta:* `ESTACION_UNICA` funcional. Un medico solo ya puede darle a su
recepcionista un PIN que solo abre Recepcion, en la misma maquina.

### Fase 2 — Dos bases fisicas

16. **Partir el archivo.** `operativo.db` y `clinico.db`, cada uno con su DEK y
    sus envolturas. La estacion de recepcion se instala con `operativo.db`
    solamente; la clinica lleva los dos, porque tambien cobra. `ESTACION_UNICA`
    lleva los dos y una sola persona con envoltura en ambos.
17. **Replica CONTACTO y FACTURABLE.** Identidades y extractos de presupuesto
    con su concepto viven en ambas bases; la clinica es la autoridad, la
    operativa recibe copia.

*Compuerta:* copiar el `operativo.db` de la estacion de recepcion a otra maquina
y comprobar que lo unico de origen clinico dentro son los conceptos FACTURABLE
que el medico libero — ni notas, ni diagnosticos, ni odontograma, ni
antecedentes (§4.3).

### Fase 3 — Relevo cifrado entre estaciones

Decidido 2026-07-25: **relevo por nube con sobres sellados**, no LAN.

**Correccion sobre el costo.** Escribi antes que esto "reusa `sync.rs` y
`crypto.rs` tal cual". Es **optimista y hay que decirlo**: se reusa el *patron*
de transporte (token de dispositivo, cursor monotono, inbox, ACK, TTL, sobre
sellado que la nube no abre), pero no la *topologia*. El buzon es
**unidireccional y de un solo consumidor**; esto es **bidireccional entre dos
pares**. Tres supuestos del contrato vigente se caen:

- `13_contrato_sincronizacion.md:19` — "**un dispositivo activo por medico**;
  vincular uno nuevo revoca el anterior". Tal cual, dar de alta la estacion de
  recepcion **desconecta la del medico**. Es un bloqueo duro, no un detalle.
- `13_contrato_sincronizacion.md:57` — el ACK **purga de inmediato**. Con dos
  suscriptores, el ACK del primero borraria el evento antes de que el segundo
  lo lea.
- `crypto.rs` sella **hacia el medico**: el paciente cifra con la publica del
  medico y solo el abre. Entre estaciones hace falta abrir en ambos sentidos.

18. **Extender el contrato a varios dispositivos con rol.** N dispositivos por
    medico, cada uno con rol y **cursor propio**; la purga pasa de "tras el ACK"
    a "tras el ACK de todos los dispositivos activos", con el TTL de 30 dias
    como red. Es la primera fase que **toca el portal**, no solo el escritorio:
    hasta aqui todo era `desktop-app`.
19. **Emparejar estaciones e intercambiar llaves.** Cada estacion ya genera su
    par X25519 por base (`ensure_keypair`), asi que esa parte si reusa limpio:
    el emisor sella con la publica del destinatario. Falta el alta: hoy
    `link_account` (`sync.rs:354`) exige el **login del medico en el portal**, y
    la recepcionista no debe tenerlo. El medico emite un codigo de
    emparejamiento desde su estacion; ese codigo lleva el device token y la
    publica de la otra parte. Nunca viaja una llave en claro por la nube.
20. **Re-linea base tras expiracion.** El buzon es cola, no almacen
    (`13_contrato_sincronizacion.md:12`). Si una estacion pasa mas de 30 dias
    sin sincronizar, sus deltas se purgaron y **no hay de donde recuperarlos**:
    la nube nunca guardo un estado completo. Hace falta un camino explicito de
    re-linea base — la estacion clinica exporta un snapshot sellado y la otra
    reinicia desde ahi. Sin esto, un cierre vacacional largo deja una estacion
    en un estado del que no sale sola.
21. **Enmienda de residencia.** `REGLAS_DESARROLLO.md:47` clasifica OPERATIVO
    como "segun residencia" y el paso 10 lo declaro "solo local". Redefinirlo:
    *local, o relevo cifrado extremo-a-extremo entre equipos del mismo
    consultorio*. Y decir explicitamente que los deltas **incluyen conceptos
    FACTURABLE** (§4.3) — texto de origen clinico que viaja sellado, con el
    mismo precedente que los documentos del buzon: la nube guarda ciphertext que
    no puede abrir.

*Compuerta:* recepcionista registra llegada en su maquina, aparece en la sala
de espera del medico; medico atiende; el cobro se asienta en la caja de
recepcion. Ninguna de las dos maquinas necesita estar encendida al mismo
tiempo.

## 6. Invariantes que se rompen con dos maquinas

Esta es la parte que hay que resolver en diseno, no en codigo. Con **dos
cajones** (decidido 2026-07-25: el medico tambien cobra) ninguna tiene la
salida barata del escritor unico.

1. **Caja unica.** `idx_cash_sessions_open` es un indice unico parcial sobre
   `closed_at IS NULL` que garantiza una sesion abierta a la vez — garantia
   **local**, y ahora incorrecta: cada estacion tiene su cajon y su corte.
   Pasa a ser unico por `(station_id) WHERE closed_at IS NULL`. Cada estacion
   abre, cobra y cierra **su** caja; ninguna cierra la de la otra.
2. **Folio de recibo.** `next_receipt_number` (`operations.rs:639`) lleva el
   contador en `app_meta` y dos equipos chocarian en `R-000001`. Ya no hay
   escritor unico, asi que el prefijo por estacion es obligatorio, no
   alternativa: `R-{code}-{NNNNNN}` con contador propio (Fase 0, punto 10). Cada
   serie sigue siendo monotona dentro de su estacion, que es lo que un folio
   necesita.
3. **Sobreabono a presupuesto — resuelto por construccion.**
   `validate_budget_payment` (`dental.rs:409`) rechaza un abono mayor al saldo,
   calculado con `paid_cents` sobre los `payments` **locales**. Con dos cajones
   y relevo asincrono, ambas estaciones pueden aceptar abonos que por separado
   caben en el saldo y juntos lo exceden. No tiene arreglo por validacion:
   cuando el segundo cobro se entera, el dinero ya se recibio.

   Con la separacion cobro/aplicacion (§4.1) y el saldo a favor como destino
   del excedente, la fusion **converge sin intervencion humana**:

   - Los `payments` no se tocan nunca — son hechos inmutables con folio, y dos
     estaciones que cobran no pueden entrar en conflicto porque cada una emite
     en su propia serie (§6.2).
   - Solo las **asignaciones** se recalculan, y son reversibles. Regla
     determinista: reaplicar en orden `(created_at, station_code)`, greedy,
     hasta llenar el saldo del presupuesto; lo que ya no cabe vuelve a saldo a
     favor del paciente. Ambas estaciones llegan al mismo resultado sin
     coordinarse, porque el orden es total y la entrada es la misma.
   - El excedente nunca se pierde ni queda en un limbo: cae en saldo a favor,
     que es dinero del paciente aplicable a otro presupuesto suyo.

   Queda una sola cosa que mostrar con honestidad: el saldo visible es **saldo
   conocido**, y sin relevo reciente puede estar desactualizado. Necesita marca
   de frescura en la UI, no un candado.

   Nota de retencion: el saldo a favor es dinero y sobrevive al borrado
   clinico, igual que el resto de lo contable — consistente con la regla ya
   establecida en ARCO ("cancelacion que borra lo clinico y conserva lo
   contable", `10_linea_de_desarrollo.md:539`).
4. **Corte del dia.** Deja de haber un cierre y pasa a haber uno por cajon.
   `cash_summary` (`operations.rs:577`) queda por estacion, y hace falta una
   lectura consolidada nueva para el dia del consultorio, que solo es definitiva
   cuando ambas cajas cerraron y el relevo llego.
5. **`visits` la escriben los dos.** Recepcion escribe llegada, prioridad y
   recurso; la clinica escribe `started_at`, `encounter_id` y el paso a
   `IN_PROGRESS`. Con propiedad **por campo** la fusion es determinista; con
   last-writer-wins por fila se pierden cambios.
6. **Walk-in.** `register_walk_in` hoy crea el paciente clinico. En la estacion
   de recepcion crea solo la identidad CONTACTO; el expediente clinico nace en
   la estacion clinica al abrir el primer encuentro.
7. **Reloj.** La fusion por campo compara `updated_at` entre maquinas. Hace
   falta tolerancia a desfase o un contador logico por estacion.

## 7. Riesgos

- **El rekey es el momento peligroso** de todo el plan: toca la llave de una
  base con expedientes reales. Backup verificado antes, y `restore_drill.rs`
  extendido para probar restauracion post-rekey.
- **Perder una envoltura es perder el acceso** de esa persona. La del medico
  necesita respaldo de recuperacion; la de recepcion se puede regenerar.
- **Recepcion sin conexion** debe seguir cobrando; el relevo es asincrono por
  diseno. Nada del flujo puede depender de que la otra maquina responda.
- **Erosion de la frontera.** Sin la prueba de la Fase 0, cualquier paso futuro
  vuelve a mezclar las tablas.
- **El alta de la segunda estacion desconecta la primera** mientras el contrato
  siga en "un dispositivo por medico" (`13_contrato_sincronizacion.md:19`). Es
  el primer punto de la Fase 3 por algo: hasta que ese cambio este en el portal,
  no hay dos estaciones que valgan.
- **Estacion fuera de linea mas de 30 dias** pierde sus deltas por TTL y no
  puede recuperarlos de la nube. Necesita la re-linea base de la Fase 3, punto
  20; sin ella un cierre vacacional largo deja una estacion varada.

## 8. Decisiones pendientes

*Resueltas (2026-07-25):* **donde vive el cajon** — dos, uno por estacion
(§6.1-§6.4). **Que pasa con el excedente** — saldo a favor del paciente,
aplicable a otro presupuesto suyo (§4.1, §6.3). **Quien autoriza el reembolso
del saldo a favor** — solo el medico, con solicitud `PENDING` cuando no esta
presente (§4.2). **Que dice el recibo** — el tratamiento, porque se entrega al
paciente; nace la clase FACTURABLE y el nivel de detalle es ajustable por
perfil clinico (§4.3).

**Nivel de detalle por defecto** — detallado en odontologia, generico en
medicina general (§4.3). **Alcance de la Fase 3** — relevo por nube con sobres
sellados, descartado el LAN; funciona con las maquinas nunca encendidas a la
vez y con la laptop fuera del consultorio, al costo de extender el contrato de
sincronizacion (Fase 3).

No quedan decisiones abiertas. Lo que sigue es abrir el paso en
`10_linea_de_desarrollo.md` con el formato de los demas (objetivo, requisitos,
entrada necesaria, se construye, se valida con, compuerta de avance, push
recomendado) y registrar por que se revierte la decision de diferir
multi-usuario (`12_inventario_funcional_v1.md:57`).
