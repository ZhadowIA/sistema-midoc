import { describe, expect, it, vi } from "vitest";

import { createResendEmailProvider } from "../../src/services/notifications/resend-email-provider";

describe("Resend email provider", () => {
  it("sends transactional email through the Resend API", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    });

    const provider = createResendEmailProvider({
      apiKey: "re_test",
      baseUrl: "https://api.resend.com",
      from: "MiDoc <notificaciones@midoc.test>",
      fetchImpl: fetchMock
    });

    const result = await provider.sendEmail({
      to: "paciente@example.com",
      subject: "Codigo de recuperacion",
      body: "Tu codigo MiDoc es 123456."
    });

    expect(result).toEqual({
      provider: "RESEND",
      providerMessageId: "email_123"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test",
          "Content-Type": "application/json"
        })
      })
    );

    const [, init] = fetchMock.mock.calls[0]!;
    if (!init) {
      throw new Error("Expected Resend fetch options.");
    }
    const payload = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(payload.from).toBe("MiDoc <notificaciones@midoc.test>");
    expect(payload.to).toEqual(["paciente@example.com"]);
    expect(payload.subject).toBe("Codigo de recuperacion");
    expect(payload.text).toContain("123456");
    expect(payload.html).toContain("123456");
  });

  it("raises a concise provider error when Resend rejects the email", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ name: "validation_error", message: "Invalid `from` field" }), {
        status: 400
      });
    });

    const provider = createResendEmailProvider({
      apiKey: "re_test",
      baseUrl: "https://api.resend.com",
      from: "notificaciones@midoc.test",
      fetchImpl: fetchMock
    });

    await expect(
      provider.sendEmail({
        to: "paciente@example.com",
        subject: "Codigo",
        body: "Tu codigo MiDoc es 123456."
      })
    ).rejects.toThrow(/Resend rejected \(400, validation_error\)/);
  });
});
