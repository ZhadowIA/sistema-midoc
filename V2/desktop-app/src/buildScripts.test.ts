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
  assert.equal(
    packageManifest.scripts["tauri:dev"],
    "tauri dev --features whisper-local"
  );
  assert.equal(
    packageManifest.scripts["tauri:build"],
    "tauri build --features whisper-local"
  );
});
