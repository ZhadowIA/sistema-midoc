import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

type Csp = Record<string, string>;

const tauriConfig = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8")
) as { app: { security: { csp: Csp | null; devCsp?: Csp } } };

const csp = tauriConfig.app.security.csp;

// El webview tiene acceso a todos los comandos del expediente: un XSS en texto
// renderizado (transcripcion, salida de IA, documento) no debe poder cargar
// codigo ajeno ni sacar datos por la red. La red sale por Rust, no por la pagina.
test("el webview corre con CSP y sin scripts externos ni en linea", () => {
  assert.ok(csp, "tauri.conf.json no debe volver a csp: null");
  assert.equal(csp["default-src"], "'self'");
  assert.equal(csp["script-src"], "'self'");
  assert.equal(csp["object-src"], "'none'");
  assert.equal(csp["frame-ancestors"], "'none'");
  assert.equal(csp["form-action"], "'none'");
  assert.equal(csp["base-uri"], "'self'");
});

test("la pagina solo habla con Rust por el canal IPC", () => {
  assert.ok(csp);
  const sources = csp["connect-src"].split(/\s+/);
  assert.deepEqual(sources.sort(), ["http://ipc.localhost", "ipc:"]);
});

test("ninguna directiva de produccion admite eval, en linea ni comodines", () => {
  assert.ok(csp);
  for (const [directive, value] of Object.entries(csp)) {
    assert.doesNotMatch(value, /unsafe-eval|unsafe-inline|\*|https?:\/\/(?!ipc\.localhost)/, directive);
  }
});
