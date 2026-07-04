import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

const postgresBin = "C:\\Program Files\\PostgreSQL\\17\\bin";
const env = { ...process.env };
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path";
const currentPath = env[pathKey] ?? env.PATH ?? env.Path ?? "";

if (process.platform === "win32" && existsSync(postgresBin)) {
  env[pathKey] = `${postgresBin};${currentPath}`;
}

const tauriCli = join(process.cwd(), "node_modules", "@tauri-apps", "cli", "tauri.js");
const tauriBin = process.execPath;
const args = [tauriCli, "dev", ...process.argv.slice(2)];

const child = spawn(tauriBin, args, {
  stdio: "inherit",
  env,
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
