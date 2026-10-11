import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_PORTAL_URL, parsePortalUrl } from "./portalConfig.ts";

test("sin variable usa el portal local de desarrollo", () => {
  assert.equal(parsePortalUrl(undefined), DEFAULT_PORTAL_URL);
  assert.equal(parsePortalUrl("   "), DEFAULT_PORTAL_URL);
});

test("acepta una URL https y le quita la diagonal final", () => {
  assert.equal(parsePortalUrl(" https://midoc-pruebas.vercel.app/ "), "https://midoc-pruebas.vercel.app");
});

test("una URL invalida o sin http(s) cae al portal local en lugar de romper el vinculo", () => {
  assert.equal(parsePortalUrl("midoc-pruebas.vercel.app"), DEFAULT_PORTAL_URL);
  assert.equal(parsePortalUrl("ftp://midoc.example.com"), DEFAULT_PORTAL_URL);
});
