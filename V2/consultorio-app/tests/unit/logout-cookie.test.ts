import { describe, expect, it } from "vitest";

import { POST as logoutPOST } from "../../src/app/api/auth/logout/route";
import { env } from "../../src/lib/env";
import { SESSION_COOKIE_NAME } from "../../src/lib/auth/session-cookie";

// El logout debe borrar la cookie con los mismos atributos con los que se creo
// la sesion; si difieren (p. ej. `Secure`), el navegador puede conservarla.
describe("logout cookie", () => {
  it("clears the session cookie with the same attributes used at login", async () => {
    const response = await logoutPOST(
      new Request("http://localhost/api/auth/logout", { method: "POST" })
    );

    expect(response.status).toBe(200);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970/);

    const expectsSecure = env.APP_BASE_URL.startsWith("https://");
    expect(/;\s*Secure/i.test(setCookie)).toBe(expectsSecure);
  });
});
