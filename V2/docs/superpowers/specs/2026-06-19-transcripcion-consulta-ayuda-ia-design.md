# Diseño: Transcripción consulta y Ayuda IA

Fecha: 2026-06-19  
Ámbito: `V2/desktop-app`  
Pasos relacionados: 11, 15, 21 y 22

## Objetivo

Separar la captura y revisión de la conversación de las funciones de asistencia
clínica. La sección actualmente llamada `Asistencia de IA` pasa a llamarse
`Transcripción consulta` y se dedica únicamente a grabar, transcribir y revisar
la consulta.

La generación de propuestas clínicas se mueve a `Ayuda IA`, ubicada en la
columna derecha permanente de la Estación Clínica.

## Jerarquía de la pantalla

La vista de atención conserva sus tres regiones principales:

1. Columna izquierda: agenda del día.
2. Columna central: navegación y sección clínica activa.
3. Columna derecha: contexto permanente y acceso a `Ayuda IA`.

`Ayuda IA` pertenece a la tercera región de la Estación Clínica. No es una
columna interna de `Transcripción consulta`. Permanece disponible cuando el
médico cambia entre transcripción, nota SOAP, módulo clínico y receta.

En pantallas donde no quepan las tres regiones, la adaptación responsiva
conservará esta jerarquía y colocará la columna derecha después del contenido
central.

## Transcripción consulta

### Alcance

La sección central `Transcripción consulta` permite:

- iniciar, pausar y finalizar una grabación;
- cargar un archivo WAV compatible;
- elegir el método disponible: local, nube o nube con diarización;
- consultar modelo, costo, velocidad y estado del consentimiento;
- ver la transcripción;
- revisar y corregir texto y hablantes;
- descartar o marcar la transcripción como revisada.

No genera SOAP, diagnósticos diferenciales, estudios ni tratamientos.

### Composición

El flujo guiado usa tres áreas dentro del contenido central:

1. **Captura:** grabadora, duración y acciones principales.
2. **Configuración:** método, modelo, capacidad, hablantes y costo.
3. **Transcripción:** texto resultante y turnos Médico/Paciente.

La estructura se mantiene durante toda la captura para evitar saltos de
interfaz.

### Transcripción en vivo

Si en el futuro el proveedor o motor activo ofrece streaming real, la tercera
área muestra fragmentos durante la grabación y los identifica como
`Transcripción en vivo`.

La capacidad actual `realtimeCapable` solo indica que el equipo puede procesar
casi a la velocidad de la conversación. No implica streaming. Mientras no
exista un contrato de transcripción incremental, la interfaz mostrará:

`La transcripción aparecerá al finalizar la grabación.`

No se simulará texto en vivo ni se presentará procesamiento por lotes como si
fuera streaming.

### Privacidad

- El modo local es el predeterminado.
- El audio permanece transitorio y se descarta después de procesarlo.
- El envío fuera del equipo requiere consentimiento de voz vigente y una
  selección explícita de nube.
- La transcripción se guarda únicamente como borrador clínico en la base local
  cifrada.
- Ningún audio o contenido transcrito se escribe en logs o telemetría.

## Columna derecha y Ayuda IA

La columna derecha conserva información contextual resumida del paciente y
añade una acción principal `Ayuda IA`.

La acción usa como entradas:

- transcripción revisada de la consulta;
- antecedentes disponibles;
- preconsulta disponible;
- plantilla activa del médico.

Antes de ejecutar, la interfaz indica qué fuentes están disponibles y cuáles
faltan. La ausencia de una fuente no debe inventarse ni ocultarse.

### Resultados

`Ayuda IA` devuelve bloques independientes y revisables:

1. Borrador SOAP.
2. Acomodo conforme a la plantilla activa del médico.
3. Posibilidades clínicas.
4. Estudios sugeridos, solo cuando estén justificados.
5. Opciones de tratamiento.

Cada posibilidad clínica usa niveles de compatibilidad:

- `Alta`
- `Media`
- `Baja`

No se muestran porcentajes numéricos. Cada posibilidad debe incluir:

- explicación breve;
- hallazgos a favor;
- hallazgos que no encajan;
- datos faltantes para valorarla mejor.

Los niveles expresan compatibilidad con la información disponible, no
probabilidad diagnóstica ni certeza clínica.

Los estudios y tratamientos muestran su motivo, precauciones relevantes y
datos faltantes. No se presentan como órdenes ni decisiones terminadas.

### Revisión humana

Nada se aplica automáticamente al expediente.

El médico puede:

- revisar cada bloque;
- aplicar campos o segmentos de forma explícita;
- editar el contenido antes de guardarlo;
- descartar bloques o el resultado completo.

La firma de la consulta continúa siendo una acción independiente.

## Estados de interfaz

### Transcripción

- Sin consentimiento de voz.
- Lista para grabar.
- Grabando.
- Pausada.
- Procesando.
- Transcripción disponible.
- Transcripción revisada.
- Error de captura o transcripción.
- Motor o modelo no disponible.

### Ayuda IA

- Sin transcripción.
- Transcripción pendiente de revisión.
- Fuentes disponibles.
- Generando.
- Resultado disponible.
- Resultado parcialmente aplicado.
- Resultado descartado.
- Error sin exposición de contenido clínico.

El botón `Ayuda IA` se deshabilita si no existe una transcripción revisada. La
interfaz explica qué falta en lugar de depender solo del estado deshabilitado.

## Límites de esta implementación

- No se implementa streaming real hasta contar con un motor o proveedor y un
  contrato incremental verificable.
- No se diagnostica automáticamente.
- No se aplican estudios, tratamientos, SOAP ni plantillas sin acción del
  médico.
- No se persiste contenido clínico permanentemente en la nube.
- No se convierte la columna derecha en una parte exclusiva de la sección de
  transcripción.

## Verificación

La implementación deberá comprobar:

- el cambio de etiqueta a `Transcripción consulta`;
- la separación entre transcripción y generación clínica;
- la permanencia de `Ayuda IA` en la columna derecha al cambiar de sección;
- el estado por lotes actual y el estado incremental cuando exista capacidad
  real;
- la corrección manual de texto y hablantes;
- el bloqueo de `Ayuda IA` hasta revisar la transcripción;
- niveles Alta/Media/Baja sin porcentajes;
- aplicación explícita y descarte de cada resultado;
- accesibilidad por teclado, foco visible y mensajes de estado;
- comportamiento responsivo sin desbordamiento horizontal;
- pruebas, tipos y build del proyecto de escritorio.

