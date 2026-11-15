# Paso 32 — Preconsulta configurable

Diseño acordado con el dueño el 2026-10-19, antes de programar. Sustituye la definición breve del paso 32 en `10_linea_de_desarrollo.md`, que remite aquí.

## 1. Idea

Cada médico tiene **un cuestionario** que cualquier persona puede contestar desde un **enlace general**: el médico no genera un enlace por paciente. Las respuestas le llegan cifradas a su app, donde quedan en una bandeja. Al iniciar una consulta, el médico **busca la preconsulta** y la adjunta. Para los casos en que conviene, también puede mandar un **enlace personal** cuya respuesta se adjunta sola.

Principios:

- **Cómodo para el paciente:** sin cuenta ni contraseña, desde el celular, en pocos minutos, sin preguntas que no le aplican.
- **Cero trabajo por paciente para el médico** con el enlace general.
- **Residencia intacta:** las respuestas se cifran en el celular del paciente con la llave pública del médico. El portal solo guarda el sobre cifrado y lo borra cuando la app confirma la descarga (buzón del paso 6). La nube nunca ve una respuesta en claro.

## 2. El cuestionario

Uno solo por médico, en dos partes:

1. **Información general**, para el paciente que consulta **por primera vez** con ese médico: el cuestionario de antecedentes del paso 19 (identificación ampliada, heredo-familiares, personales, gineco-obstétricos), el mismo contrato que hoy comparten portal y escritorio (`lib/medical-history.ts` y su espejo, vigilados por la prueba de deriva).
2. **Motivo de consulta:** las preguntas que el médico arma.

Al empezar, el paciente indica si es su primera consulta con ese médico:

- **Primera vez:** contesta las dos partes.
- **Ya ha consultado antes:** pasa directo a la parte 2. Una pregunta breve, "¿Cambió algo de tu salud desde tu última visita (medicamentos, alergias, cirugías, embarazo)?", le deja anotar novedades en texto libre si las hay.

## 3. Identificación (obligatoria)

Sin cuenta, la identificación es lo que permite encontrar la preconsulta. Son **obligatorios**: nombre(s), apellidos, fecha de nacimiento y teléfono. Van dentro del sobre cifrado, como todo lo demás. El portal no los ve, así que la búsqueda ocurre en la app del médico, ya descifrada.

## 4. Enlaces

| Enlace | Para qué | Al recibir la respuesta |
|---|---|---|
| **General** (fijo por médico) | Compartirlo una vez: QR en la sala de espera, WhatsApp, redes. | Va a la **bandeja** de la app; el médico la adjunta. |
| **Personal** (por paciente, desde el expediente) | Cuando el médico quiere la preconsulta de alguien concreto, por ejemplo una cita futura. Vence a los 30 días y sirve para un envío. | Se **adjunta sola** a ese paciente, sin buscar. |

- El enlace general solo permite **depositar**: quien lo tenga puede enviar cuestionarios, nunca leer los de otros. Después de enviar, el formulario queda vacío y el borrador local se borra, por si el teléfono es compartido.
- El médico puede **pausar** el enlace general o **regenerarlo** (el anterior deja de funcionar) desde la app.
- El médico comparte el enlace como quiera: copiar, QR o abrir WhatsApp con el mensaje escrito. El portal no envía SMS ni correo al paciente; esas notificaciones siguen congeladas.

## 5. Lo que ve el paciente

- Inicio con nombre y cédula del médico, tiempo estimado y aviso de privacidad en dos líneas (con enlace al completo).
- Pocas preguntas por pantalla, barra de progreso, letra grande y botones del tamaño de un dedo.
- Respuestas de un toque siempre que se pueda: sí/no, opciones, escala de dolor 0–10, fechas con calendario. El texto libre es opcional (el teclado del celular permite dictar).
- "No sé" o "Prefiero no responder" en las preguntas no indispensables.
- Preguntas condicionales: solo aparecen si aplican.
- **Guardado automático en el propio celular:** si se cierra el navegador, al volver sigue donde iba. Nada se guarda en el servidor hasta enviar.
- Pantalla de revisión antes de enviar, **consentimiento explícito** (datos sensibles, Ley Federal de Protección de Datos Personales) y confirmación final.

## 6. Lo que hace el médico

**Editor del cuestionario** (en la app de escritorio): agregar preguntas a la parte 2, elegir el tipo (texto corto, texto largo, sí/no, opción única, opción múltiple, escala 0–10, fecha, número), marcarlas como obligatorias y poner condiciones ("mostrar si…"). Tiene **vista previa en formato de celular** y **plantillas de inicio** (medicina general, odontología). La parte 1 no se edita: es el contrato de antecedentes común.

**Bandeja y "Buscar preconsulta":**

- Al iniciar una consulta aparece el apartado **"Buscar preconsulta"**. Arriba, las **coincidencias automáticas** con el paciente de la consulta: nombre parecido aunque cambien acentos o mayúsculas, misma fecha de nacimiento o mismo teléfono, ordenadas por cuántos datos coinciden. Abajo, **todas las recibidas**, buscables por nombre, con fecha de envío y marca de "nueva".
- **Nunca se adjunta sola** una preconsulta del enlace general: el médico confirma, normalmente con el paciente enfrente, porque la identidad la declara quien llena el formulario.
- Al adjuntar, las respuestas quedan en la consulta (sección Preconsulta) con botón para llevarlas al Subjetivo, y la parte 1 pasa por la **conciliación de antecedentes** que ya existe: el médico decide qué se queda en el expediente.
- El médico puede **descartar** una preconsulta (spam, duplicada, de alguien que no llegó).

**Retención:** las preconsultas **sin adjuntar** se borran solas de la app a los **60 días** por omisión. El médico puede cambiar ese plazo, porque hay quien agenda a tres meses o más. Opciones: 30, 60, 90, 120 o 180 días. Las adjuntadas pasan a ser parte del expediente y siguen sus reglas.

## 7. Seguridad

| Riesgo | Mitigación |
|---|---|
| Spam o abuso del enlace general | Límite de envíos por dispositivo y red (`RateLimitCounter`), trampa invisible para bots, tamaño máximo por envío y tope de preconsultas pendientes por médico. |
| Identidad declarada | Solo sugerencias; el médico confirma al adjuntar. |
| Difusión del enlace | Pausar o regenerar desde la app. |
| Datos de quien nunca llegó | Borrado automático de las no adjuntadas (60 días por omisión, configurable) y descarte manual. |
| Datos sensibles sin consentimiento | Casilla de consentimiento explícito antes de enviar. |
| Páginas falsas | El enlace vive en el dominio de MiDoc y muestra nombre y cédula del médico. |
| Contenido ofensivo | El portal no puede leerlo (cifrado); el médico lo descarta en la app. |

## 8. Datos y residencia

- **Definición del cuestionario** (preguntas de la parte 2, opciones, condiciones): no es dato clínico. Se publica en el portal para pintar el formulario. Clase **OPERATIVO**.
- **Enlaces** (general y personales, con su estado): **OPERATIVO**. El personal referencia al paciente solo por un identificador opaco que la app reconoce; el portal no guarda su nombre.
- **Respuestas:** sobre cifrado (sealed box con la llave del médico) en un modelo del buzón, con `purgedAt`, borrado tras la confirmación de la app. Clase **CLINICO en tránsito**, como `PrecheckinSubmission`; la prueba de clasificación de #86 lo vigila.
- **En la app:** las preconsultas descifradas viven en la base cifrada del perfil, en una bandeja propia (OPERATIVO hasta adjuntarse, CLINICO al adjuntarse a una consulta).

## 9. Rebanadas

1. **Editor y publicación:** editor de la parte 2 en la app con plantillas y vista previa; la definición se publica en el portal. Enlace general con pausar y regenerar.
2. **Formulario del paciente:** pantalla de inicio, primera vez o ya paciente, parte 1, parte 2, identificación obligatoria, guardado local, condiciones, revisión, consentimiento y envío cifrado. Límites contra abuso.
3. **Bandeja y "Buscar preconsulta":** descarga y descifrado en la app, coincidencias automáticas, búsqueda, adjuntar, descartar, conciliación de antecedentes, paso al Subjetivo y retención configurable.
4. **Enlace personal:** generar desde el expediente, compartir por WhatsApp, enlace o QR, y adjuntado automático.

## 10. Compuerta

Un médico arma su cuestionario y comparte su enlace general. Un paciente nuevo lo contesta en el celular, sin cuenta, y otro que ya es paciente pasa directo al motivo de consulta. El médico encuentra la preconsulta al iniciar la consulta y la adjunta. La nube nunca guarda una respuesta en claro, la prueba de clasificación sigue pasando y las no adjuntadas se borran al vencer su plazo.
