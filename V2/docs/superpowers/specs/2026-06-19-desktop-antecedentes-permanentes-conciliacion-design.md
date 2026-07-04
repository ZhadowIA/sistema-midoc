# Antecedentes permanentes, conciliación y edición en desktop

## Objetivo

Sustituir los cuatro campos resumidos que aparecen al final de la sección
Antecedentes por un expediente de historia clínica completo, permanente y
versionado. Cuando el paciente envíe un cuestionario nuevo, el médico deberá
conciliar únicamente los campos que tengan valores distintos en ambas versiones;
los datos nuevos se incorporarán automáticamente.

El cuestionario original enviado por el paciente permanecerá inmutable en la
base local. Las decisiones y ediciones del médico crearán nuevas versiones
permanentes del expediente.

## Alcance de la interfaz

Se eliminarán de la vista de consulta:

- Alergias;
- Antecedentes personales;
- Antecedentes familiares;
- Fecha de nacimiento;
- el botón actual `Guardar antecedentes`.

En su lugar, la cabecera de Antecedentes tendrá el botón
`Editar antecedentes`. La lectura normal seguirá mostrando la jerarquía clínica
aprobada: secciones, conteos y filas separadas.

El editor incluirá los mismos grupos, bloques, controles, opciones y condiciones
que ve el paciente en el portal:

- sexo biológico;
- alergias y medicamentos actuales;
- grupos de audiencia `patient` o `both`;
- condiciones `onlyForSex`;
- condiciones `showWhen`;
- antecedentes heredo-familiares estructurados.

Los grupos exclusivos del médico, como el interrogatorio por aparatos y
sistemas, no forman parte de esta primera edición porque no aparecen en el
formulario del paciente.

## Fuente permanente y versionado

Se añadirá una migración SQLite para una tabla local
`patient_medical_history_versions` con:

- `id`;
- `patient_id`;
- `version`, incremental por paciente;
- `payload_json`, con el cuestionario completo;
- `source`, con valores `DOCTOR_EDIT`, `PATIENT_INITIAL` o
  `PATIENT_RECONCILIATION`;
- `encounter_id`, opcional;
- `source_appointment_id`, opcional;
- `reconciled_source_hash`, opcional;
- `created_at`;
- restricción única por `(patient_id, version)`.

La versión permanente vigente será la de mayor número para el paciente. Guardar
desde el editor siempre creará una versión nueva; nunca actualizará ni eliminará
versiones anteriores.

La tabla `precheckins` seguirá siendo la copia inmutable de lo enviado por el
paciente. No se reutilizará como almacenamiento editable.

## Compatibilidad con datos actuales

Los campos resumidos existentes en `patients` no se eliminarán de la base en
esta entrega, para evitar pérdida de información y mantener compatibilidad con
expedientes anteriores.

Al crear la primera versión permanente:

- `patients.allergies` prellenará `allergies` si el cuestionario no tiene valor;
- `patients.birth_date` prellenará `identification.fechaNacimiento` si está
  vacío;
- `medical_background` y `family_background` permanecerán preservados en la
  base como notas legadas, aunque dejarán de mostrarse como campos editables.

No se intentará dividir automáticamente los textos libres legados en campos
estructurados, porque produciría inferencias clínicas no revisadas.

## Detección de cuestionario nuevo

El contenido del `precheckin` de tipo `medical-history` se normalizará y se
identificará mediante SHA-256.

Existe un cuestionario pendiente de conciliación cuando:

1. hay una versión permanente;
2. existe un `medical-history` para la cita;
3. su hash no coincide con `reconciled_source_hash` de la versión permanente
   vigente.

Si no existe versión permanente, el cuestionario del paciente será el borrador
inicial del editor y no se mostrará conciliación.

Si el hash ya fue conciliado, `Editar antecedentes` abrirá directamente la
última versión permanente.

## Reglas de fusión

La comparación será por ruta de campo dentro del JSON normalizado.

- Solo expediente con valor: conservar automáticamente.
- Solo cuestionario nuevo con valor: incorporar automáticamente.
- Ambos vacíos: omitir.
- Ambos con el mismo valor normalizado: conservar sin mostrar conflicto.
- Ambos con valores diferentes: exigir decisión del médico.

Para texto se comparará el valor recortado. Las listas de familiares se
compararán como conjuntos normalizados para evitar conflictos causados solo por
el orden. Cada propiedad estructurada de heredo-familiares se conciliará por
separado: familiares, tipo y notas.

La fusión automática se calculará antes de mostrar la conciliación, pero no se
guardará hasta que el médico complete el flujo y pulse guardar.

## Conciliación campo por campo

Cuando existan conflictos, se mostrará primero una vista en dos columnas:

- izquierda: `Expediente actual`;
- derecha: `Respuesta nueva del paciente`.

Cada fila mostrará la sección, la etiqueta del campo y dos acciones:

- `Conservar expediente`;
- `Usar respuesta nueva`.

Solo aparecerán campos con valores presentes y diferentes en ambas versiones.
Los datos fusionados automáticamente se resumirán en un aviso, sin pedir
decisiones redundantes.

Todas las filas deberán tener una decisión antes de continuar. La interfaz
mostrará progreso, por ejemplo `3 de 5 diferencias resueltas`.

Al resolver los conflictos, el botón `Revisar y editar resultado` abrirá el
formulario completo con la versión fusionada.

## Editor completo

El editor será un componente propio de desktop construido sobre el contrato
espejado en `medicalHistoryFormat.ts`. Ese contrato se ampliará para exponer:

- `kind`, opciones, límites y sufijos;
- bloques;
- audiencia;
- `onlyForSex`;
- `showWhen`;
- definiciones de antecedentes familiares.

El editor usará secciones clínicas con divisores, no una tarjeta por campo. Los
campos condicionales aparecerán y desaparecerán según sus respuestas, igual que
en el portal.

Acciones:

- `Cancelar`: descarta el borrador y no modifica el expediente;
- `Guardar nueva versión`: valida, persiste y vuelve a lectura;
- si el encuentro está firmado, la edición estará deshabilitada.

## Flujo completo

1. El médico abre Antecedentes.
2. La aplicación carga la última versión permanente y el cuestionario de esta
   cita.
3. Si hay un cuestionario nuevo y una versión previa:
   - se muestra una notificación;
   - `Editar antecedentes` abre la conciliación;
   - los campos nuevos se fusionan automáticamente;
   - el médico resuelve solo conflictos reales;
   - revisa el formulario completo;
   - guarda una versión permanente.
4. Si no hay conflictos, el editor abre directamente el resultado fusionado.
5. Si no hay cuestionario nuevo, el editor abre la última versión permanente.
6. El cuestionario original nunca se modifica.

## Backend local e IPC

Se añadirán operaciones locales para:

- obtener la versión permanente vigente;
- construir el estado de conciliación contra el cuestionario de la cita;
- guardar una nueva versión;
- listar metadatos básicos de versiones para auditoría.

Rust tratará `payload_json` como contenido clínico opaco, pero validará:

- que sea JSON;
- que el paciente exista;
- que la versión se incremente dentro de una transacción;
- que no se guarde sobre un encuentro firmado;
- que `reconciled_source_hash`, cuando exista, corresponda al cuestionario
  presentado durante la conciliación.

Cada guardado registrará una entrada en `clinical_audit` sin contenido clínico.

## Estados y errores

- Sin versión ni cuestionario: editor vacío con todos los campos disponibles.
- Cuestionario nuevo sin versión: editor prellenado, sin conciliación.
- Conflictos sin resolver: no permitir avanzar al editor final.
- Error de guardado: mantener el borrador visible y mostrar error inline.
- Guardado exitoso: recargar el detalle y mostrar la nueva versión.
- Cambio del cuestionario durante la conciliación: rechazar el guardado por hash
  obsoleto y pedir recargar.

## Verificación

### Pruebas unitarias TypeScript

- normalización de valores;
- detección de conflictos;
- fusión automática de campos nuevos;
- conservación de campos anteriores ausentes;
- igualdad de listas sin importar el orden;
- construcción del resultado final con decisiones.

### Pruebas Rust

- migración idempotente;
- primera versión por paciente;
- incremento de versiones;
- persistencia de fuente y hash;
- rechazo de paciente inexistente;
- rechazo de edición en encuentro firmado;
- cuestionario original intacto;
- auditoría sin contenido clínico.

### Verificación de interfaz

- desaparecen los cuatro campos resumidos;
- conciliación en dos columnas;
- solo se muestran conflictos con datos en ambas versiones;
- datos nuevos aparecen ya fusionados;
- formulario completo replica campos y condiciones del paciente;
- cancelar no guarda;
- guardar crea una versión nueva;
- tema claro, Cobalto Nocturno y ventana estrecha.
