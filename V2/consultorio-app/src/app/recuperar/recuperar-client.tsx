"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const PASSWORD_RULE =
  "Minimo 12 caracteres con mayuscula, minuscula, numero y simbolo.";

function RequestForm() {
  const [email, setEmail] = useState("");
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
        body: JSON.stringify({ email })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo procesar la solicitud.");
      }

      setMessage(data.message);
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

  return (
    <article className="auth-card">
      <header>
        <h1>Recupera tu cuenta</h1>
        <p>
          Escribe el correo con el que te registraste y te enviaremos un enlace para
          restablecer tu contrasena.
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
          {busy ? "Enviando…" : "Enviar instrucciones"}
        </button>
      </form>

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
