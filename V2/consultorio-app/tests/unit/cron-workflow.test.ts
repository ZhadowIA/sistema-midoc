import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Prueba de contrato entre el cron de GitHub Actions y las rutas internas del
// portal. En 2026-09 el workflow apuntaba a rutas que no existian y a cabeceras
// que ninguna ruta leia: en produccion la cola de notificaciones no se
// procesaba y el buzon nunca se purgaba. Esta prueba falla si vuelve a pasar.

const portalRoot = process.cwd();
const workflowPath = resolve(portalRoot, "..", "..", ".github", "workflows", "cron-jobs.yml");

function readWorkflow() {
  return readFileSync(workflowPath, "utf8");
}

function referencedApiPaths(workflow: string) {
  const matches = workflow.matchAll(/\/api\/[A-Za-z0-9_\-/[\]]+/g);
  return [...new Set([...matches].map((match) => match[0]))];
}

describe("cron workflow contract", () => {
  it("references only routes that exist and accept POST", () => {
    const workflow = readWorkflow();
    const paths = referencedApiPaths(workflow);

    expect(paths.length).toBeGreaterThan(0);

    for (const apiPath of paths) {
      // `resolve` trataria "/api/..." como ruta absoluta: se quita la barra inicial.
      const routeFile = resolve(portalRoot, "src", "app", apiPath.slice(1), "route.ts");
      expect(existsSync(routeFile), `${apiPath} no tiene route.ts`).toBe(true);
      expect(readFileSync(routeFile, "utf8")).toMatch(/export async function POST/);
    }
  });

  it("schedules both the notification dispatcher and the mailbox maintenance", () => {
    const paths = referencedApiPaths(readWorkflow());

    expect(paths).toContain("/api/internal/notifications/dispatch");
    expect(paths).toContain("/api/internal/maintenance/cleanup");
  });

  it("authenticates every call with the bearer secret the routes expect", () => {
    const workflow = readWorkflow();
    const curlBlocks = workflow.split(/curl\s/).slice(1);

    expect(curlBlocks.length).toBe(referencedApiPaths(workflow).length);
    for (const block of curlBlocks) {
      expect(block).toMatch(/Authorization: Bearer \$\{\{ secrets\.NOTIFICATION_CRON_SECRET \}\}/);
    }

    expect(workflow).not.toMatch(/x-notification-secret|x-cron-secret/);
  });
});
