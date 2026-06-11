"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PatientRegisterClient() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: ""
  });
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(field: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [field]: event.currentTarget.value }));
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/patient/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone || undefined,
          password: form.password,
          acceptedTerms: accepted,
          acceptedPrivacy: accepted
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear la cuenta.");
      }
      router.push("/paciente");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo crear la cuenta.");
      setBusy(false);
    }
  }

  return (
    <section className="auth-shell">
      <article className="auth-card">
        <header>
          <h1>Crea tu cuenta</h1>
          <p>Usa el mismo correo con el que agendaste para ver tus citas.</p>
        </header>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label htmlFor="reg-first">Nombre</label>
            <input id="reg-first" required value={form.firstName} onChange={update("firstName")} />
          </div>
          <div className="field">
            <label htmlFor="reg-last">Apellidos</label>
            <input id="reg-last" required value={form.lastName} onChange={update("lastName")} />
          </div>
          <div className="field">
            <label htmlFor="reg-email">Correo electronico</label>
            <input id="reg-email" type="email" autoComplete="email" required value={form.email} onChange={update("email")} />
          </div>
          <div className="field">
            <label htmlFor="reg-phone">Telefono (opcional)</label>
            <input id="reg-phone" type="tel" autoComplete="tel" value={form.phone} onChange={update("phone")} />
          </div>
          <div className="field">
            <label htmlFor="reg-password">Contrasena</label>
            <input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              required
              value={form.password}
              onChange={update("password")}
            />
            <p className="field-hint">
              Minimo 12 caracteres, con mayuscula, minuscula, numero y simbolo.
            </p>
          </div>

          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.currentTarget.checked)}
            />
            <span>Acepto los terminos y el aviso de privacidad.</span>
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="action-button" type="submit" disabled={busy || !accepted}>
            {busy ? "Creando…" : "Crear cuenta"}
          </button>
        </form>

        <p className="auth-footer">
          ¿Ya tienes cuenta? <a href="/paciente/login">Inicia sesion</a>
        </p>
      </article>
    </section>
  );
}
