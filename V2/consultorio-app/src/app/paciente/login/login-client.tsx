"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PatientLoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/patient/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo iniciar sesion.");
      }
      router.push("/paciente");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo iniciar sesion.");
      setBusy(false);
    }
  }

  return (
    <section className="auth-shell">
      <article className="auth-card">
        <header>
          <h1>Portal del paciente</h1>
          <p>Consulta tus citas y los resumenes que tu medico autorizo.</p>
        </header>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label htmlFor="patient-email">Correo electronico</label>
            <input
              id="patient-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="patient-password">Contrasena</label>
            <input
              id="patient-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
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
          ¿Aun no tienes cuenta? <a href="/paciente/registro">Crea tu cuenta</a>
        </p>
      </article>
    </section>
  );
}
