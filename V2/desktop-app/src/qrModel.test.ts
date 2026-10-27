import assert from "node:assert/strict";
import test from "node:test";
import { qrMatrix, qrPath } from "./qrModel.ts";

const url = "https://midoc.mx/preconsulta/0123456789abcdef0123456789abcdef0123456789abcdef";

test("genera una matriz cuadrada con los tres patrones de posicion", () => {
  const matrix = qrMatrix(url);
  const size = matrix.length;
  assert.ok(size >= 21 && (size - 17) % 4 === 0, `tamano de QR invalido: ${size}`);
  assert.ok(matrix.every((row) => row.length === size));
  // Esquinas de los patrones de posicion: oscuras en las tres esquinas.
  for (const [row, col] of [
    [0, 0],
    [0, size - 1],
    [size - 1, 0]
  ]) {
    assert.equal(matrix[row]![col], true);
  }
  // Separador blanco junto al patron superior izquierdo.
  assert.equal(matrix[7]![0], false);
});

test("el mismo enlace da el mismo codigo y otro enlace uno distinto", () => {
  assert.deepEqual(qrMatrix(url), qrMatrix(url));
  assert.notDeepEqual(qrMatrix(url), qrMatrix(`${url}x`));
});

test("traza los modulos oscuros por tramos, con margen", () => {
  assert.equal(
    qrPath(
      [
        [true, true, false, true],
        [false, false, false, false]
      ],
      4
    ),
    "M4 4h2v1h-2zM7 4h1v1h-1z"
  );
  assert.equal(qrPath([[false]]), "");
});
