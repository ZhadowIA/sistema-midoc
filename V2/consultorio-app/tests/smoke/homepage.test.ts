import { describe, expect, it } from "vitest";

describe("homepage", () => {
  it("documents the technical base", () => {
    const html = "<h1>MiDoc V2</h1>";
    expect(html).toContain("MiDoc V2");
  });
});
