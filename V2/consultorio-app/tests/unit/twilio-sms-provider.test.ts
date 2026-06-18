import { describe, expect, it, vi } from "vitest";

import { createTwilioSmsProvider, createTwilioWhatsAppProvider } from "../../src/services/notifications/twilio-sms-provider";

describe("Twilio SMS provider", () => {
  it("sends SMS through Twilio Messages API using a messaging service", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ sid: "SM123", status: "queued" }), { status: 201 });
    });

    const provider = createTwilioSmsProvider({
      accountSid: "AC123",
      authToken: "auth-token",
      baseUrl: "https://api.twilio.com",
      messagingServiceSid: "MG123",
      fetchImpl: fetchMock
    });

    const result = await provider.sendSms({
      to: "+526141234567",
      body: "Recordatorio: tienes una cita el 20/06 a las 10:00. Ver detalles: https://midoc.example/s/abc"
    });

    expect(result).toEqual({
      provider: "TWILIO",
      providerMessageId: "SM123"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from("AC123:auth-token").toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        })
      })
    );

    const [, init] = fetchMock.mock.calls[0]!;
    if (!init) {
      throw new Error("Expected Twilio fetch options.");
    }
    const params = new URLSearchParams(init.body as string);
    expect(params.get("To")).toBe("+526141234567");
    expect(params.get("MessagingServiceSid")).toBe("MG123");
    expect(params.get("Body")).toContain("Recordatorio");
    expect(params.has("From")).toBe(false);
  });

  it("sends SMS with a configured from number when no messaging service is present", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ sid: "SM456" }), { status: 201 });
    });

    const provider = createTwilioSmsProvider({
      accountSid: "AC123",
      authToken: "auth-token",
      baseUrl: "https://api.twilio.com/",
      fromPhoneNumber: "+15551234567",
      fetchImpl: fetchMock
    });

    await provider.sendSms({ to: "+526141234567", body: "Recordatorio de cita." });

    const [, init] = fetchMock.mock.calls[0]!;
    if (!init) {
      throw new Error("Expected Twilio fetch options.");
    }
    const params = new URLSearchParams(init.body as string);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(params.get("From")).toBe("+15551234567");
    expect(params.has("MessagingServiceSid")).toBe(false);
  });

  it("requires either a messaging service or a from number", () => {
    expect(() =>
      createTwilioSmsProvider({
        accountSid: "AC123",
        authToken: "auth-token",
        baseUrl: "https://api.twilio.com"
      })
    ).toThrow(/TWILIO_MESSAGING_SERVICE_SID|TWILIO_FROM_PHONE_NUMBER/);
  });

  it("requires account credentials", () => {
    expect(() =>
      createTwilioSmsProvider({
        accountSid: "",
        authToken: "auth-token",
        baseUrl: "https://api.twilio.com",
        fromPhoneNumber: "+15551234567"
      })
    ).toThrow(/TWILIO_ACCOUNT_SID/);

    expect(() =>
      createTwilioSmsProvider({
        accountSid: "AC123",
        authToken: "",
        baseUrl: "https://api.twilio.com",
        fromPhoneNumber: "+15551234567"
      })
    ).toThrow(/TWILIO_AUTH_TOKEN/);
  });

  it("raises a concise provider error when Twilio rejects the message", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ code: 21608, message: "The number is unverified" }), { status: 400 });
    });

    const provider = createTwilioSmsProvider({
      accountSid: "AC123",
      authToken: "auth-token",
      baseUrl: "https://api.twilio.com",
      fromPhoneNumber: "+15551234567",
      fetchImpl: fetchMock
    });

    await expect(provider.sendSms({ to: "+526141234567", body: "Recordatorio de cita." })).rejects.toThrow(
      /Twilio SMS rejected \(400, code 21608\)/
    );
  });
});

describe("Twilio WhatsApp provider", () => {
  it("sends WhatsApp messages through Twilio Messages API using official whatsapp-prefixed addresses", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ sid: "SMwhatsapp123", status: "queued" }), { status: 201 });
    });

    const provider = createTwilioWhatsAppProvider({
      accountSid: "AC123",
      authToken: "auth-token",
      baseUrl: "https://api.twilio.com",
      fromPhoneNumber: "+14155238886",
      fetchImpl: fetchMock
    });

    const result = await provider.sendWhatsApp({
      to: "+526141234567",
      body: "Recordatorio: tienes una cita el 20/06 a las 10:00. Ver detalles: https://midoc.example/s/abc"
    });

    expect(result).toEqual({
      provider: "TWILIO_WHATSAPP",
      providerMessageId: "SMwhatsapp123"
    });

    const [, init] = fetchMock.mock.calls[0]!;
    if (!init) {
      throw new Error("Expected Twilio fetch options.");
    }
    const params = new URLSearchParams(init.body as string);
    expect(params.get("To")).toBe("whatsapp:+526141234567");
    expect(params.get("From")).toBe("whatsapp:+14155238886");
    expect(params.get("Body")).toContain("Recordatorio");
  });

  it("rejects non-phone destinations for WhatsApp instead of guessing", () => {
    const provider = createTwilioWhatsAppProvider({
      accountSid: "AC123",
      authToken: "auth-token",
      baseUrl: "https://api.twilio.com",
      fromPhoneNumber: "+14155238886"
    });

    expect(() => provider.formatAddress("614 123 4567")).toThrow(/E.164/);
  });
});
