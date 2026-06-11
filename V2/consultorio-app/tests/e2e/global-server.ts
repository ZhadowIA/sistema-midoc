import { spawn, type ChildProcess } from "node:child_process";

import { loadTestEnv } from "../load-test-env";

// Vitest globalSetup: boots a single `next dev` instance shared by every E2E
// file, then tears it down once at the end. Test files compute the same base
// URL from E2E_PORT and only make HTTP requests — they never manage the server.

const PORT = Number(process.env.E2E_PORT ?? 3123);
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;
const READY_TIMEOUT_MS = 120_000;

let serverProcess: ChildProcess | undefined;
let serverLog = "";

async function waitForServer(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (serverProcess?.exitCode != null) {
      throw new Error(`Dev server exited early (code ${serverProcess.exitCode}).\n${serverLog}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not accepting connections yet; retry until the deadline.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Dev server did not become ready within ${timeoutMs}ms.\n${serverLog}`);
}

async function stopServer() {
  const child = serverProcess;
  if (!child || child.pid == null) {
    return;
  }

  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());

    if (process.platform === "win32") {
      // Kill the whole shell + next dev worker tree on Windows.
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    } else {
      child.kill("SIGTERM");
    }

    // Safety net if the process never emits exit.
    setTimeout(resolve, 10_000);
  });
}

export async function setup() {
  // The spawned server inherits this process's env, so it must be complete
  // (the EMAIL_* mock defaults) before we spawn.
  loadTestEnv();

  serverProcess = spawn(`npx next dev --port ${PORT} --hostname ${HOST}`, {
    cwd: process.cwd(),
    env: { ...process.env },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  serverProcess.stdout?.on("data", (chunk) => {
    serverLog += chunk.toString();
  });
  serverProcess.stderr?.on("data", (chunk) => {
    serverLog += chunk.toString();
  });

  await waitForServer(`${BASE_URL}/api/health`, READY_TIMEOUT_MS);
}

export async function teardown() {
  await stopServer();
}
