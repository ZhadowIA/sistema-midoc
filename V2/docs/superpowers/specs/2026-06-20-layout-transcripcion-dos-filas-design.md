# Diseño: layout de transcripción en dos filas

Fecha: 2026-06-20

Ámbito: `V2/desktop-app`

Paso relacionado: 15 — Transcripción local real

## Objetivo

Evitar que una transcripción larga prolongue verticalmente las áreas de captura
y configuración. La transcripción debe disponer del ancho completo del espacio
de trabajo para facilitar la lectura y corrección de los turnos.

## Composición aprobada

El espacio interno de `Transcripción consulta` se organiza en dos filas:

1. La fila superior contiene `Captura` y `Configuración`.
2. La fila inferior contiene `Transcripción` y ocupa el ancho conjunto de las
   dos columnas superiores.

En escritorio, la fila superior usa una proporción `1.1fr / 0.9fr`: Captura
queda ligeramente más ancha que Configuración. La Transcripción cruza ambas
columnas mediante el grid existente.

En anchos de hasta `1180px`, las tres áreas vuelven a una sola columna, en este
orden:

1. Captura.
2. Configuración.
3. Transcripción.

## Comportamiento

- No cambia el flujo de grabación, carga de WAV, consentimiento ni selección de
  proveedor.
- No cambia la edición, revisión o descarte de la transcripción.
- Una transcripción larga solo aumenta la altura de su propia fila.
- No se introduce desplazamiento horizontal.
- Se conservan las etiquetas semánticas y el orden actual del DOM.

## Implementación

El cambio se limita a los estilos de `.transcription-workspace` y
`.transcription-review` en `V2/desktop-app/src/App.css`:

- el grid pasa de tres columnas a dos;
- `.transcription-review` ocupa todas las columnas;
- el breakpoint existente conserva el apilado de una sola columna.

No se requieren cambios en React ni nuevas dependencias.

## Verificación

- Prueba estructural del contrato CSS: dos columnas superiores y transcripción
  a ancho completo.
- Pruebas existentes del proyecto de escritorio.
- Compilación TypeScript y build de Vite.
- Inspección visual en escritorio y en el breakpoint responsivo.
