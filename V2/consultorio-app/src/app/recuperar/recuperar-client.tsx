"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const PASSWORD_RULE =
  "Minimo 12 caracteres con mayuscula, minuscula, numero y simbolo.";

function RequestForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<"EMAIL" | "SMS">("EMAIL");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/password-recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, channel })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo procesar la solicitud.");
      }

      setMessage(data.message);
      setCodeSent(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo procesar la solicitud."
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetWithCode() {
    if (password !== confirm) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password-recovery/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "CODE",
          email,
          code,
          newPassword: password
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo restablecer la contrasena.");
      }

      router.push("/medico/login");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo restablecer la contrasena."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="auth-card">
      <header>
        <h1>Recupera tu cuenta</h1>
        <p>
          Escribe el correo con el que te registraste y elige como recibir tu codigo.
        </p>
      </header>

      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="field">
          <label htmlFor="recovery-email">Correo electronico</label>
          <input
            id="recovery-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
        </div>

        <div className="field">
          <label>Enviar codigo por</label>
          <div className="booking-for-toggle" role="radiogroup" aria-label="Canal de recuperacion">
            <button
              type="button"
              className={channel === "EMAIL" ? "toggle-option toggle-active" : "toggle-option"}
              aria-pressed={channel === "EMAIL"}
              onClick={() => setChannel("EMAIL")}
            >
              Correo
            </button>
            <button
              type="button"
              className={channel === "SMS" ? "toggle-option toggle-active" : "toggle-option"}
              aria-pressed={channel === "SMS"}
              onClick={() => setChannel("SMS")}
            >
              SMS
            </button>
          </div>
        </div>

        {message ? (
          <p className="form-success" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="action-button" type="submit" disabled={busy}>
          {busy ? "Enviando…" : "Enviar codigo"}
        </button>
      </form>

      {codeSent ? (
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void resetWithCode();
          }}
        >
          <div className="field">
            <label htmlFor="recovery-code">Codigo de verificacion</label>
            <input
              id="recovery-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>

          <div className="field">
            <label htmlFor="code-reset-password">Contrasena nueva</label>
            <input
              id="code-reset-password"
              type="password"
              autoComplete="new-password"
              required
              aria-describedby="code-reset-password-rule"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            <p className="field-hint" id="code-reset-password-rule">
              {PASSWORD_RULE}
            </p>
          </div>

          <div className="field">
            <label htmlFor="code-reset-confirm">Confirma la contrasena</label>
            <input
              id="code-reset-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(event) => setConfirm(event.currentTarget.value)}
            />
          </div>

          <button className="action-button" type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Guardando…" : "Cambiar contrasena"}
          </button>
        </form>
      ) : null}

      <p className="auth-footer">
        <a href="/medico/login">Volver a iniciar sesion</a>
      </p>
    </article>
  );
}

function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (password !== confirm) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password-recovery/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo restablecer la contrasena.");
      }

      router.push("/medico/login");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo restablecer la contrasena."
      );
      setBusy(false);
    }
  }

  return (
    <article className="auth-card">
      <header>
        <h1>Crea una contrasena nueva</h1>
        <p>El enlace es valido por 15 minutos y solo puede usarse una vez.</p>
      </header>

      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="field">
          <label htmlFor="reset-password">Contrasena nueva</label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            aria-describedby="reset-password-rule"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
          <p className="field-hint" id="reset-password-rule">
            {PASSWORD_RULE}
          </p>
        </div>

        <div className="field">
          <label htmlFor="reset-confirm">Confirma la contrasena</label>
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.currentTarget.value)}
          />
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="action-button" type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar contrasena nueva"}
        </button>
      </form>

      <p className="auth-footer">
        ¿El enlace expiro? <a href="/recuperar">Solicita uno nuevo</a>
      </p>
    </article>
  );
}

export function RecuperarClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  return (
    <section className="auth-shell">
      {token ? <ResetForm token={token} /> : <RequestForm />}
    </section>
  );
}
