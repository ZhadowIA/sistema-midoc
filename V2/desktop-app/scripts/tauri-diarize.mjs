// Corre `tauri dev|build` con la diarizacion local (sherpa-onnx) usando binarios
// VERIFICADOS. El build script del crate `sherpa-onnx-sys` baja de GitHub el
// archivo precompilado sin revisar su hash; aqui se baja una sola vez, se compara
// con el SHA-256 fijado y se le pasa al build con `SHERPA_ONNX_ARCHIVE_DIR`. Las
// DLL que lleva el instalador (`tauri.diarize.conf.json`) salen de ese mismo
// archivo, no de `target/`.
//
//   node scripts/tauri-diarize.mjs build --features "whisper-local diarization-local"

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Debe coincidir con la version de `sherpa-onnx` en src-tauri/Cargo.toml.
const SHERPA_VERSION = "2.0.1";
const ARCHIVES = {
  win32: {
    name: `sherpa-onnx-v${SHERPA_VERSION}-win-x64-shared-MT-Release-lib.tar.bz2`,
    sha256: "afa4de3ca4ab0afd53bb4aab40d28ee15608364b549ffc0fe0caf6489bfc39a5",
    dlls: [
      "onnxruntime.dll",
      "onnxruntime_providers_shared.dll",
      "sherpa-onnx-c-api.dll",
      "sherpa-onnx-cxx-api.dll",
    ],
  },
};

const archive = ARCHIVES[process.platform];
if (!archive) {
  console.error(`No hay archivo de sherpa-onnx con hash fijado para ${process.platform}.`);
  process.exit(1);
}

const cacheDir = join(process.cwd(), "src-tauri", ".sherpa-onnx");
const archivePath = join(cacheDir, archive.name);
const libDir = join(cacheDir, "lib");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function ensureArchive() {
  if (existsSync(archivePath) && sha256(archivePath) === archive.sha256) return;
  mkdirSync(cacheDir, { recursive: true });
  const url = `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VERSION}/${archive.name}`;
  console.log(`Bajando ${archive.name}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`no se pudo bajar ${url}: HTTP ${response.status}`);
  const partial = `${archivePath}.part`;
  writeFileSync(partial, Buffer.from(await response.arrayBuffer()));
  const actual = sha256(partial);
  if (actual !== archive.sha256) {
    rmSync(partial);
    throw new Error(`SHA-256 de ${archive.name} no coincide: ${actual}`);
  }
  renameSync(partial, archivePath);
}

// Saca las DLL del archivo verificado a `.sherpa-onnx/lib/` (las toma el instalador).
function extractDlls() {
  rmSync(libDir, { recursive: true, force: true });
  mkdirSync(libDir, { recursive: true });
  const stem = archive.name.replace(/\.tar\.bz2$/, "");
  const members = archive.dlls.map((dll) => `${stem}/lib/${dll}`);
  // Rutas relativas: el tar de GNU (Git Bash) lee `C:\...` como `host:ruta`.
  const result = spawnSync(
    "tar",
    ["-xjf", archive.name, "-C", "lib", "--strip-components=2", ...members],
    { stdio: "inherit", cwd: cacheDir },
  );
  if (result.status !== 0) throw new Error("no se pudieron extraer las DLL de sherpa-onnx");
  for (const dll of archive.dlls) {
    if (!existsSync(join(libDir, dll))) throw new Error(`falta ${dll} en el archivo`);
  }
}

try {
  await ensureArchive();
  extractDlls();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const [command = "build", ...rest] = process.argv.slice(2);
const tauriCli = join(process.cwd(), "node_modules", "@tauri-apps", "cli", "tauri.js");
const args = [tauriCli, command, "--config", "src-tauri/tauri.diarize.conf.json", ...rest];
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, SHERPA_ONNX_ARCHIVE_DIR: cacheDir },
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
