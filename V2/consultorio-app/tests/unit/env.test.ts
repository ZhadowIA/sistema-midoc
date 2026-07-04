import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("environment validation", () => {
  it("accepts a display-name email sender for provider From headers", () => {
    const tsxCli = resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
    const result = spawnSync(
      process.execPath,
      [tsxCli, "--env-file=.env", "--env-file=.env.local", "src/lib/env.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          EMAIL_FROM: "MiDoc <no-reply@midocapp.com.mx>"
        },
        encoding: "utf8"
      }
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
