"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo iniciar sesion.");
      }

      const setup = await fetch("/api/auth/setup-status").then((r) => r.json());
      const next =
        setup.nextStep === "DASHBOARD" ? "/medico/agenda" : "/medico/configuracion";
      router.push(next);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "No se pudo iniciar sesion."
      );
      setBusy(false);
    }
  }

  return (
    <section className="auth-shell">
      <article className="auth-card">
        <header>
          <h1>Inicia sesion</h1>
          <p>Accede a tu agenda y configuracion de consultorio.</p>
        </header>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label htmlFor="login-email">Correo electronico</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="login-password">Contrasena</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            <p className="field-hint">
              <a className="link-button" href="/recuperar">
                Olvide mi contrasena
              </a>
            </p>
          </div>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="action-button" type="submit" disabled={busy}>
            {busy ? "Entrando…" : "Iniciar sesion"}
          </button>
        </form>

        <p className="auth-footer">
          ¿Aun no tienes cuenta? <a href="/medico/registro">Registra tu consultorio</a>
        </p>
      </article>
    </section>
  );
}
