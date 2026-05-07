"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Copy, Shield, ShieldCheck } from "lucide-react";
import { DoctorLayout } from "@/components/DoctorLayout";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

type TwoFactorStatus = {
  required: boolean;
  enabled: boolean;
  pending: boolean;
  recoveryCodesCount?: number;
};

export default function SecurityPage() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [manualKey, setManualKey] = useState("");
  const [otpAuthUri, setOtpAuthUri] = useState("");
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/security/2fa", { cache: "no-store" });
      const data = (await response.json()) as TwoFactorStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar seguridad.");
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar seguridad.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const startSetup = async () => {
    setProcessing("setup");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/security/2fa", { method: "POST" });
      const data = (await response.json()) as { error?: string; manualEntryKey?: string; otpauthUri?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo iniciar configuración.");
      setManualKey(data.manualEntryKey || "");
      setOtpAuthUri(data.otpauthUri || "");
      setMessage("Llave generada. Regístrala en tu app autenticadora y confirma con un código.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar configuración.");
    } finally {
      setProcessing(null);
    }
  };

  const enableTwoFactor = async () => {
    setProcessing("enable");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/security/2fa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json()) as { error?: string; recoveryCodes?: string[] };
      if (!response.ok) throw new Error(data.error || "No se pudo activar 2FA.");
      setCode("");
      setManualKey("");
      setOtpAuthUri("");
      setRecoveryCodes(data.recoveryCodes || []);
      setMessage("2FA activado correctamente.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo activar 2FA.");
    } finally {
      setProcessing(null);
    }
  };

  const disableTwoFactor = async () => {
    setProcessing("disable");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/security/2fa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo desactivar 2FA.");
      setDisableCode("");
      setMessage("2FA desactivado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo desactivar 2FA.");
    } finally {
      setProcessing(null);
    }
  };

  const rotateRecoveryCodes = async () => {
    setProcessing("recovery");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/security/2fa/recovery-codes", { method: "POST" });
      const data = (await response.json()) as { error?: string; recoveryCodes?: string[] };
      if (!response.ok) throw new Error(data.error || "No se pudieron regenerar los recovery codes.");
      setRecoveryCodes(data.recoveryCodes || []);
      setMessage("Recovery codes regenerados. Guarda esta nueva lista de inmediato.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron regenerar los recovery codes.");
    } finally {
      setProcessing(null);
    }
  };

  const copyValue = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setMessage("Copiado al portapapeles.");
  };

  return (
    <DoctorLayout>
      <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <header className="border-b border-border pb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Seguridad</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Autenticación de dos factores</h1>
            <p className="mt-2 max-w-[70ch] text-sm leading-6 text-muted-foreground">
              Protege las cuentas administrativas con códigos TOTP desde una app autenticadora.
            </p>
          </header>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-success">
              {message}
            </div>
          )}

          {loading ? (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Cargando estado de seguridad...
            </div>
          ) : !status?.required ? (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Esta cuenta no requiere 2FA administrado desde esta superficie.
            </div>
          ) : (
            <>
              <section className="rounded-xl border border-border bg-card p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Estado</p>
                    <div className="mt-2 flex items-center gap-2">
                      {status.enabled ? (
                        <>
                          <ShieldCheck className="h-5 w-5 text-success" />
                          <span className="text-sm font-semibold text-success">2FA activo</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-5 w-5 text-warning" />
                          <span className="text-sm font-semibold text-warning">2FA no activo</span>
                        </>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {status.enabled
                        ? "Tu login administrativo ya requiere un código adicional."
                        : "Actívalo cuanto antes. ADMIN y CLINIC_ADMIN son superficies de alto impacto."}
                    </p>
                  </div>

                  {!status.enabled && (
                    <Button onClick={() => void startSetup()} loading={processing === "setup"}>
                      <Shield className="h-4 w-4" />
                      Generar llave
                    </Button>
                  )}
                </div>
              </section>

              {(status.pending || manualKey) && !status.enabled && (
                <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Paso 1 · Registra la llave</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Abre Google Authenticator, 1Password, Authy o similar y agrega una cuenta TOTP manualmente.
                      </p>
                    </div>

                    <div className="rounded-lg border border-border bg-background p-4">
                      <p className="text-xs font-medium text-muted-foreground">Llave manual</p>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="block flex-1 break-all text-sm font-semibold text-foreground">{manualKey || "Genera una llave nueva"}</code>
                        {manualKey && (
                          <button
                            type="button"
                            onClick={() => void copyValue(manualKey)}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold text-foreground hover:bg-secondary"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copiar
                          </button>
                        )}
                      </div>
                    </div>

                    {otpAuthUri && (
                      <div className="rounded-lg border border-border bg-background p-4">
                        <p className="text-xs font-medium text-muted-foreground">URI otpauth</p>
                        <div className="mt-2 flex items-center gap-2">
                          <code className="block flex-1 break-all text-xs text-foreground">{otpAuthUri}</code>
                          <button
                            type="button"
                            onClick={() => void copyValue(otpAuthUri)}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold text-foreground hover:bg-secondary"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copiar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Paso 2 · Confirma el código</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Escribe el código de 6 dígitos que muestra tu app para activar la protección.
                      </p>
                    </div>

                    <Input
                      label="Código TOTP"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="123456"
                      inputMode="numeric"
                    />

                    <Button fullWidth onClick={() => void enableTwoFactor()} loading={processing === "enable"}>
                      Activar 2FA
                    </Button>
                  </div>
                </section>
              )}

              {status.enabled && (
                <section className="rounded-xl border border-border bg-card p-6 space-y-4">
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Recovery codes</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Sirven para entrar si pierdes el dispositivo autenticador. Cada código funciona una sola vez.
                        </p>
                      </div>
                      <Button variant="secondary" onClick={() => void rotateRecoveryCodes()} loading={processing === "recovery"}>
                        Regenerar códigos
                      </Button>
                    </div>

                    {recoveryCodes.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {recoveryCodes.map((recoveryCode) => (
                          <code key={recoveryCode} className="rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground">
                            {recoveryCode}
                          </code>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {status.recoveryCodesCount && status.recoveryCodesCount > 0
                          ? `Ya existen ${status.recoveryCodesCount} recovery codes guardados. Regénéralos si necesitas una nueva copia visible.`
                          : "Aún no hay recovery codes visibles en esta sesión."}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-foreground">Desactivar 2FA</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Solo hazlo si estás rotando dispositivo o resolviendo una contingencia administrativa.
                    </p>
                  </div>

                  <div className="max-w-sm">
                    <Input
                      label="Código actual"
                      value={disableCode}
                      onChange={(event) => setDisableCode(event.target.value)}
                      placeholder="123456 o recovery code"
                    />
                  </div>

                  <Button variant="destructive" onClick={() => void disableTwoFactor()} loading={processing === "disable"}>
                    Desactivar 2FA
                  </Button>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </DoctorLayout>
  );
}
