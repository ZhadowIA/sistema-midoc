import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

type PackageManifest = {
  scripts: Record<string, string>;
};

const packageJsonUrl = new URL("../package.json", import.meta.url);
const packageManifest = JSON.parse(
  readFileSync(packageJsonUrl, "utf8")
) as PackageManifest;

test("los comandos de producto compilan Whisper local", () => {
  // Dev usa un wrapper local para preparar PATH en Windows antes de invocar
  // Tauri; conserva las mismas features de producto.
  assert.equal(
    packageManifest.scripts["tauri:dev"],
    "node ./scripts/tauri-dev.mjs --features whisper-local"
  );
  // El build por defecto es CPU-only: respaldo seguro para maquinas sin la
  // cadena nativa de GPU. La aceleracion va en los builds por SO de la matriz.
  assert.equal(
    packageManifest.scripts["tauri:build"],
    "tauri build --features whisper-local"
  );
});

test("la matriz de distribucion empaca el backend de aceleracion por SO", () => {
  // Windows/Linux: Vulkan universal (GPU integrada y dedicada) + OpenBLAS (CPU).
  assert.equal(
    packageManifest.scripts["tauri:build:vulkan"],
    "node ./scripts/tauri-diarize.mjs build --features \"whisper-local whisper-vulkan whisper-openblas diarization-local\""
  );
  // macOS: Metal.
  assert.equal(
    packageManifest.scripts["tauri:build:metal"],
    "node ./scripts/tauri-diarize.mjs build --features \"whisper-local whisper-metal diarization-local\""
  );
  // NVIDIA optimizado: CUDA (alternativa a Vulkan en equipos con NVIDIA).
  assert.equal(
    packageManifest.scripts["tauri:build:cuda"],
    "node ./scripts/tauri-diarize.mjs build --features \"whisper-cuda diarization-local\""
  );
});

test("todo comando con diarizacion usa los binarios verificados de sherpa-onnx", () => {
  // El build script del crate baja sherpa-onnx sin revisar su hash; el
  // envoltorio lo verifica y pone las DLL en el instalador.
  for (const [name, cmd] of Object.entries(packageManifest.scripts)) {
    if (!cmd.includes("diarization-local")) continue;
    assert.ok(
      cmd.startsWith("node ./scripts/tauri-diarize.mjs "),
      `${name} deberia pasar por scripts/tauri-diarize.mjs: ${cmd}`
    );
  }
});

test("los comandos dev con backend nativo evitan mezclar CRT Debug y Release", () => {
  // Whisper/sherpa con backends nativos deben compilarse en --release para no
  // mezclar el CRT Debug del binario con el Release de las libs nativas.
  for (const name of [
    "tauri:dev:diarize",
    "tauri:dev:openblas",
    "tauri:dev:vulkan",
    "tauri:dev:metal",
    "tauri:dev:cuda"
  ]) {
    const cmd = packageManifest.scripts[name];
    assert.ok(cmd, `falta el script ${name}`);
    assert.ok(
      cmd.includes("--release"),
      `${name} deberia compilar en --release: ${cmd}`
    );
  }
});
