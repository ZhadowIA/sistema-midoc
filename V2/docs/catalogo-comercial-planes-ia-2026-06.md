# Catalogo comercial propuesto para MiDoc V2 (junio 2026)

## Objetivo

Definir un catalogo comercial que:

- sea entendible para medicos individuales y consultorios pequenos;
- respete la arquitectura local-first de MiDoc;
- permita vender IA sin comprometer margen;
- evite que un medico que usa IA en la mayoria de sus consultas se quede sin creditos antes de terminar el mes.

## Decision recomendada

Se recomienda **mantener un plan Inteligente** y **agregar un plan superior con mas creditos IA**, en lugar de intentar que un solo plan premium cubra todos los patrones de uso.

La razon:

- Si el plan Inteligente absorbe todo el uso intensivo, su precio sube demasiado y deja de ser atractivo para el medico promedio.
- Un plan superior permite capturar a los heavy users sin destruir el margen del tier medio.
- La escalera comercial queda mas clara: entrada, operacion, IA frecuente, IA intensiva.
- Permite que el medico empiece con IA sin miedo y luego suba cuando la adopcion ya esta validada.

## Supuestos operativos

Supuestos usados para dimensionar creditos:

- Medico individual o pequeno consultorio privado.
- Entre 12 y 18 consultas por dia.
- Entre 20 y 22 dias habiles por mes.
- Rango operativo: **240 a 360 consultas por mes**.

Uso promedio de IA por consulta dentro de MiDoc:

- SOAP asistido: `1 credito`
- Instrucciones al paciente: `1 credito`
- Transcripcion local de una consulta estandar: `1 credito`
- Resumen longitudinal o tarea mas compleja: `2 creditos`

Por lo tanto, una **consulta asistida estandar** consume normalmente:

- `2 creditos` si el medico usa solo SOAP + instrucciones
- `3 creditos` si usa transcripcion local + SOAP + instrucciones

La referencia de cobertura comercial debe basarse en `3 creditos por consulta asistida`, porque es el flujo que realmente hace sentir al medico que "la IA si le ayudo".

> **Nota tecnica (Ruta B, 2026-07-01) — pendiente de decision comercial.** El
> backend actual **no cobra credito por transcripcion local** (Whisper +
> sherpa-onnx corren en el equipo del medico, `0 creditos`); el supuesto de
> `1 credito` para "transcripcion local" en esta seccion es la politica
> comercial deseada, no el costo tecnico real, y las dos vias nuevas en nube
> tampoco estan reflejadas aqui todavia. El portal ya cobra estas dos vias de
> forma autoritativa por duracion del audio:
>
> | Via | Formula | Ejemplo (15 min = 900s) |
> |---|---|---|
> | Nube estandar | `ceil(duracion_segundos / 900)` | `1 credito` |
> | Nube con hablantes (diarizado) | `ceil(duracion_segundos / 600)` | `2 creditos` |
>
> Falta decidir: (a) si "transcripcion local: 1 credito" se mantiene como
> cobro comercial aunque el costo tecnico sea `0` (para sostener el
> `3 creditos por consulta` de esta seccion), y (b) como entran las dos vias
> en nube en el modelo de "creditos por consulta asistida". No se ha
> modificado el resto de esta seccion para no tomar esa decision de precio
> sin validacion del negocio.

## Catalogo recomendado

### 1. Agenda

- Precio mensual: `MXN 549`
- Creditos IA incluidos: `0`
- Enfoque: captacion y agenda publica

Incluye:

- perfil publico;
- agenda online;
- recordatorios y cancelaciones;
- notificaciones transaccionales;
- flujo basico de pacientes nuevos.

No incluye:

- expediente clinico completo;
- operacion presencial;
- IA clinica.

### 2. Clinico

- Precio mensual: `MXN 999`
- Creditos IA incluidos: `120`
- Enfoque: operacion clinica completa con prueba real de IA

Incluye:

- todo lo de `Agenda`;
- expediente clinico;
- documentos;
- operacion presencial;
- directorio de pacientes;
- linea del tiempo clinica;
- IA gobernada con bolsa inicial util para adopcion.

Objetivo de los `120` creditos:

- no vender este plan como "plan IA";
- permitir descubrir valor;
- cubrir entre `40 y 60` consultas asistidas parciales al mes;
- abrir la puerta al upgrade natural a `Inteligente`.

### 3. Inteligente

- Precio mensual: `MXN 1,499`
- Creditos IA incluidos: `900`
- Enfoque: medico que usa IA en la mayoria de sus consultas

Incluye:

- todo lo de `Clinico`;
- IA clinica gobernada como parte central del flujo;
- prioridad para nuevas funciones IA aprobadas;
- reportes de uso y trazabilidad ampliada.

Cobertura esperada:

- `900 / 3 = 300` consultas asistidas estandar al mes.

Eso significa que este plan cubre bien al medico que:

- atiende alrededor de `14 a 15` consultas por dia durante `20` dias; o
- atiende mas volumen, pero no usa el flujo completo de IA en todas las consultas.

Este cambio es importante: con menos de `900` creditos, el plan Inteligente corre el riesgo de quedarse corto para un medico que realmente adopta la IA como parte de su rutina.

### 4. Inteligente Plus

- Precio mensual: `MXN 2,290`
- Creditos IA incluidos: `1,800`
- Enfoque: medico o consultorio pequeno que quiere IA en practicamente todas sus consultas

Incluye:

- todo lo de `Inteligente`;
- bolsa ampliada para uso intensivo;
- mejor opcion para medicos con alto volumen o para doble turno;
- opcion comercial ideal para usuarios power y early adopters.

Cobertura esperada:

- `1,800 / 3 = 600` consultas asistidas estandar al mes.

Eso cubre de sobra a:

- un medico promedio de `240 a 360` consultas al mes;
- especialidades o consultorios donde casi todas las consultas se documentan con ayuda de IA;
- escenarios con algo de uso extra en resumentes longitudinales o validaciones.

## Recomendacion final sobre el plan Inteligente

La mejor estructura no es "o subimos Inteligente o creamos otro", sino:

- **subir Inteligente a 900 creditos** para que de verdad cumpla la promesa de ayudar en la mayoria de las consultas; y
- **agregar Inteligente Plus** para el uso realmente intensivo.

Si se deja `Inteligente` con una bolsa menor, se vuelve un plan atractivo en marketing pero frustrante en operacion real. Si se intenta que `Inteligente` absorba por si solo a todos los heavy users, se encarece demasiado y se rompe la escalera comercial.

## Add-ons recomendados

Para no forzar upgrades prematuros y proteger el margen, conviene vender bolsas adicionales:

### Bolsas de creditos

- `100 creditos` -> `MXN 149`
- `300 creditos` -> `MXN 399`
- `700 creditos` -> `MXN 849`

### Regla comercial

- Los creditos del plan se renuevan cada mes.
- Los creditos extra se consumen despues de los creditos incluidos del plan.
- Los creditos extra pueden vencer a los `90 dias` para evitar pasivos acumulados largos.

## Politica de terceros incluida en el precio

Los precios propuestos **si contemplan servicios de terceros**, pero no como consumo ilimitado sin control.

### Incluido dentro del plan

- `Twilio` para recordatorios, confirmaciones y cancelaciones transaccionales.
- `Resend` para correo transaccional operativo.
- llamadas IA del medico que forman parte de la bolsa mensual de creditos.
- uso moderado del formulario o preconsulta guiada por IA.

### Como debe modelarse comercialmente

- `Twilio` y `Resend` deben presentarse como **incluidos bajo politica de uso razonable**.
- La IA no debe presentarse como ilimitada; debe consumirse desde la bolsa mensual de creditos.
- El formulario preclinico con IA debe contar contra creditos, aunque con una tarifa baja, para evitar un hueco de costo no controlado.

### Politica de uso razonable recomendada

Para no complicar la venta, el medico no necesita ver limites tecnicos detallados en primera instancia. Internamente, MiDoc si debe gobernarlos.

Recomendacion:

- SMS/correo transaccional normal: incluido.
- volumen anomalo o uso masivo fuera del patron esperado: sujeto a revision o bolsa adicional.
- IA clinica y preconsulta IA: gobernadas por creditos.

## Consumo sugerido del cuestionario preconsulta con IA

El cuestionario preconsulta con IA debe tener un costo simple y predecible:

- preconsulta IA breve: `1 credito`
- preconsulta IA extendida o con mas turnos: `2 creditos`

Recomendacion de producto:

- apuntar a que la mayoria de preconsultas reales queden en `1 credito`;
- reservar `2 creditos` para casos mas largos, con mas iteraciones o mas texto generado.

Esto mantiene la experiencia comercial simple y ayuda a sostener el margen incluso si la adopcion sube mucho.

## Cobertura real del plan Inteligente Plus cuando todos usan preconsulta IA

La pregunta correcta no es solo "cuantos creditos tiene", sino **cuantos creditos consume una consulta completa asistida**.

### Escenario A: consulta asistida estandar sin preconsulta IA

- transcripcion local: `1 credito`
- SOAP asistido: `1 credito`
- instrucciones al paciente: `1 credito`
- total: `3 creditos por consulta`

Con `1,800 creditos`, `Inteligente Plus` cubre:

- `600 consultas asistidas` al mes

### Escenario B: todos los pacientes usan preconsulta IA breve

- preconsulta IA: `1 credito`
- consulta asistida estandar: `3 creditos`
- total: `4 creditos por consulta`

Con `1,800 creditos`, `Inteligente Plus` cubre:

- `450 consultas completas` al mes

### Escenario C: todos los pacientes usan preconsulta IA extendida

- preconsulta IA extendida: `2 creditos`
- consulta asistida estandar: `3 creditos`
- total: `5 creditos por consulta`

Con `1,800 creditos`, `Inteligente Plus` cubre:

- `360 consultas completas` al mes

## Conclusión operativa sobre Inteligente Plus

**Si, `Inteligente Plus` si cubre el caso de que todos los pacientes de un medico promedio usen el cuestionario preconsulta con IA**, siempre que el patron se mantenga dentro del rango esperado de operacion:

- `240 a 360` consultas por mes;
- preconsulta mayormente breve o moderada;
- uso normal de transcripcion + SOAP + instrucciones.

Donde se vuelve justo o apretado:

- medicos por arriba de `360` consultas al mes;
- especialidades con cuestionarios mas largos;
- consultorios que quieran usar preconsulta IA extendida practicamente en todos los casos.

Por eso la recomendacion comercial no debe ser "Inteligente Plus es ilimitado", sino:

- cubre al medico promedio incluso si todos sus pacientes usan preconsulta IA;
- y para sobreconsumo se apoya en bolsas extra de creditos.

## Regla comercial recomendada para evitar friccion

Mensaje comercial:

- `Inteligente`: "IA para la mayoria de tus consultas"
- `Inteligente Plus`: "IA para practicamente toda tu operacion mensual"

Regla operativa:

- cuando un medico supera `80%` de su bolsa en dos meses consecutivos, sugerir upgrade o compra de bolsa extra;
- cuando supera `100%`, consumir bolsas adicionales;
- no bloquear en seco una consulta critica por quedarse sin creditos a mitad de flujo; terminar la accion y registrar el saldo excedido para cobro o consumo posterior.

## Marco de ganancia recomendado

Para control interno, usar un costo objetivo por credito de:

- `MXN 0.35` a `MXN 0.45`

Esto asume:

- transcripcion local por defecto (Whisper local);
- Gemini Flash / Flash-Lite como base de costo;
- fallback caro solo en un porcentaje menor del trafico.

### Reserva de costo IA por plan

- `Clinico` -> `120` creditos -> reserva aprox. `MXN 42 a MXN 54`
- `Inteligente` -> `900` creditos -> reserva aprox. `MXN 315 a MXN 405`
- `Inteligente Plus` -> `1,800` creditos -> reserva aprox. `MXN 630 a MXN 810`

### Margen bruto esperado

Sin contar soporte humano extraordinario ni CAC:

- `Agenda`: `85% a 90%`
- `Clinico`: `80% a 86%`
- `Inteligente`: `73% a 79%`
- `Inteligente Plus`: `65% a 72%`

La lectura correcta no es solo el porcentaje, sino la utilidad absoluta por cuenta:

- `Inteligente` y `Inteligente Plus` dejan menos margen porcentual;
- pero dejan mas margen en pesos y aumentan el valor percibido del producto.

## Mapeo sugerido a capacidades del sistema

Capacidades actuales del backend:

- `agenda`
- `documents`
- `notifications`
- `ai`
- `presential`

Mapeo recomendado:

### Agenda

- `agenda = true`
- `notifications = true`
- `documents = false`
- `presential = false`
- `ai = false`

### Clinico

- `agenda = true`
- `notifications = true`
- `documents = true`
- `presential = true`
- `ai = true`

Nota:

Aunque `Clinico` no debe posicionarse como plan IA principal, si conviene habilitar `ai = true` con una bolsa pequena para que el medico pruebe el valor real del producto.

### Inteligente

- todas las capacidades en `true`

### Inteligente Plus

- mismas capacidades que `Inteligente`
- la diferencia no es funcional sino de volumen de creditos y prioridad comercial

## Copy comercial sugerido

### Agenda

"Empieza a recibir y organizar pacientes sin cambiar tu forma de trabajar."

### Clinico

"Opera tu consultorio completo y prueba la IA de forma segura en tu flujo real."

### Inteligente

"Para medicos que quieren ayuda de IA en la mayoria de sus consultas, sin friccion."

### Inteligente Plus

"Para quienes quieren documentar casi toda su consulta con apoyo de IA, todos los dias."

## Riesgos a evitar

- No prometer IA ilimitada.
- No vender el plan medio como si cubriera uso intensivo cuando no lo hace.
- No cobrar demasiado poco por creditos extra.
- No mezclar demasiadas diferencias funcionales y de volumen al mismo tiempo.
- No dejar que el medico descubra demasiado tarde que ya casi agoto sus creditos.

## Recomendacion de implementacion

Orden sugerido:

1. Publicar `Agenda`, `Clinico` e `Inteligente`.
2. Definir desde el dia 1 las bolsas extra.
3. Medir durante 30 a 45 dias:
   - creditos usados por consulta;
   - porcentaje de medicos que agotan bolsa;
   - conversion de `Clinico` a `Inteligente`;
   - adopcion de bolsas extra.
4. Lanzar `Inteligente Plus` en cuanto existan primeros heavy users o si el analisis inicial confirma que `Inteligente` se consume por arriba de `75%` en una parte relevante de la base.

## Referencias de mercado consultadas

Estas referencias se usaron solo como ancla comercial, no como plantilla de producto:

- Hoppy publica `MXN 999/mes` con `100 notas medicas con IA`.
- MEDISYS publica desde `MXN 600/mes` y `MXN 1,200/mes`.
- Doctoralia PRO publica planes y add-ons orientados a crecimiento/marketing con precio personalizado en varias opciones.

La posicion recomendada para MiDoc es:

- competir por operacion clinica + residencia local + IA gobernada;
- no competir solo por agenda;
- usar el credito IA como palanca de valor y no como costo oculto.
