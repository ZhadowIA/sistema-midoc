# Separación visual de preconsulta y antecedentes en desktop

## Objetivo

Mejorar la lectura rápida de la preconsulta IA y del cuestionario de antecedentes
en la Estación Clínica. El médico debe distinguir preguntas, respuestas y cambios
de sección sin llenar la interfaz de tarjetas ni alterar los datos clínicos.

## Dirección aprobada

Se implementará la opción C, **Jerarquía clínica híbrida**:

- encabezados de sección con una línea superior cobalto;
- título de sección y conteo de respuestas;
- filas separadas por líneas neutras;
- preguntas de la entrevista IA numeradas;
- valores con mayor contraste que sus etiquetas;
- compatibilidad completa con Cobalto Nocturno mediante los tokens existentes.

## Preconsulta IA

La información se dividirá visualmente en:

1. **Motivo de consulta**, con el campo Motivo.
2. **Entrevista guiada**, con cada pregunta y respuesta en una fila numerada.

Los formatos legados que no tengan `conversation` seguirán usando la lista
genérica, pero recibirán los mismos divisores y ritmo vertical.

## Antecedentes

Cada `MedicalHistoryGroup` será una sección clínica independiente:

- encabezado con el nombre del grupo;
- conteo singular o plural de respuestas;
- campos dispuestos en dos columnas cuando exista espacio;
- etiqueta a la izquierda y valor a la derecha;
- colapso a una columna en ventanas estrechas.

No se agregarán tarjetas por campo. La separación dependerá de jerarquía
tipográfica, espacio negativo y divisores.

## Componentes y estilos

- `Atencion.tsx` distinguirá las filas de motivo y conversación para producir
  semántica específica de preconsulta.
- `MedicalHistoryGroups` añadirá conteos y clases de presentación sin modificar
  el contrato de `medicalHistoryFormat.ts`.
- `App.css` incorporará estilos acotados para secciones, filas, numeración,
  respuesta y comportamiento adaptable.
- El panel lateral de contexto conservará su formato compacto; el rediseño
  completo se aplicará solamente al contenido principal de Preconsulta y
  Antecedentes.

## Accesibilidad y adaptación

- Se conservarán `dl`, `dt`, `dd`, `section` y encabezados para mantener la
  relación semántica entre etiqueta y valor.
- La numeración será visual y no sustituirá el texto de la pregunta.
- No se dependerá exclusivamente del color para separar contenido.
- En anchos reducidos las filas pasarán a una columna sin desplazamiento
  horizontal.

## Verificación

- Compilación TypeScript y Vite mediante `npm run build`.
- Revisión visual de Preconsulta y Antecedentes en tema claro.
- Revisión visual en Cobalto Nocturno.
- Revisión de una ventana estrecha para confirmar el colapso a una columna.
- Confirmación de que el panel lateral compacto no cambia.
