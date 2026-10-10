// Utilidades puras de texto para los PDF del expediente (paso 28, rebanada 4).
// Las fuentes estandar de PDF (Helvetica) usan WinAnsi: cubren el espanol
// (acentos, ñ, ¿¡, °) pero no cualquier caracter. Lo que no cabe se traduce a
// un equivalente o a "?", en vez de que la exportacion falle.

const REPLACEMENTS: Record<string, string> = {
  "≤": "<=",
  "≥": ">=",
  "→": "->",
  "←": "<-",
  "×": "x",
  "−": "-",
  "‑": "-",
  " ": " ",
  " ": " ",
  " ": " ",
  "\t": "    "
};

// Caracteres fuera de Latin-1 que WinAnsi si tiene.
const WIN_ANSI_EXTRA = new Set([..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"]);

function isWinAnsi(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(char);
}

/** Texto de una linea apto para la fuente estandar del PDF. */
export function toPdfSafe(text: string): string {
  let out = "";
  for (const char of text.normalize("NFC")) {
    const replaced = REPLACEMENTS[char];
    if (replaced !== undefined) out += replaced;
    else if (char === "\n" || char === "\r") out += " ";
    else if (isWinAnsi(char)) out += char;
    else out += "?";
  }
  return out;
}

/**
 * Parte un texto en lineas que caben en `maxWidth` segun `measure`. Respeta los
 * saltos de linea del medico y corta palabras mas largas que la linea.
 */
export function wrapText(text: string, maxWidth: number, measure: (line: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = toPdfSafe(paragraph).split(" ").filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      // Palabra que no cabe sola (una URL, una clave larga): se corta a mano.
      let rest = word;
      while (measure(rest) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    }
    lines.push(current);
  }
  // Sin lineas vacias al final.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Huella corta para el pie: los primeros y ultimos caracteres. */
export function shortHash(hash: string | null): string {
  if (!hash) return "";
  return hash.length > 20 ? `${hash.slice(0, 12)}…${hash.slice(-6)}` : hash;
}
