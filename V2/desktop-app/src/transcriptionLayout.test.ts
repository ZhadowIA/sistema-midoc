import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const appCss = readFileSync(new URL("./App.css", import.meta.url), "utf8");

test("organiza captura y configuración arriba y la transcripción a ancho completo", () => {
  assert.match(
    appCss,
    /\.transcription-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.05fr\)\s+minmax\(320px,\s*0\.95fr\);/s
  );
  assert.match(
    appCss,
    /\.transcription-review\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s
  );
});
