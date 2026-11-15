// QR para compartir los enlaces de preconsulta (paso 32). Se genera aqui, en
// el equipo, sin servicios externos. Logica pura para probarla con node --test;
// el dibujo vive en QrCode.tsx.

import qrcode from "qrcode-generator";

/** Margen en modulos alrededor del codigo (la norma pide 4). */
export const QR_QUIET_ZONE = 4;

/**
 * Matriz de modulos (true = oscuro) con correccion de errores media, que
 * aguanta impresiones gastadas o una foto torcida sin crecer demasiado.
 */
export function qrMatrix(text: string): boolean[][] {
  const code = qrcode(0, "M");
  code.addData(text, "Byte");
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => code.isDark(row, col)));
}

/**
 * Trazo SVG de los modulos oscuros, una fila de rectangulos unidos por linea,
 * desplazado por el margen. Un solo `path` pesa poco y escala sin perder nitidez.
 */
export function qrPath(matrix: boolean[][], quietZone = QR_QUIET_ZONE): string {
  const parts: string[] = [];
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      parts.push(`M${start + quietZone} ${y + quietZone}h${x - start}v1h-${x - start}z`);
    }
  });
  return parts.join("");
}
