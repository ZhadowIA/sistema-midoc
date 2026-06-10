"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PASSWORD_RULE =
  "Minimo 12 caracteres con mayuscula, minuscula, numero y simbolo.";

function passwordMeetsPolicy(password: string) {
  return (
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export function RegistroClient() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    professionalName: "",
    specialty: "GENERAL_MEDICINE",
    password: ""
  });
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const passwordInvalid = passwordTouched && !passwordMeetsPolicy(form.password);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit() {
    if (!passwordMeetsPolicy(form.password)) {
      setPasswordTouched(true);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          phone: form.phone || undefined
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear la cuenta.");
      }

      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password })
      });

      if (!login.ok) {
        router.push("/medico/login");
        return;
      }

      router.push("/medico/configuracion");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "No se pudo crear la cuenta."
      );
      setBusy(false);
    }
  }

  return (
    <section className="auth-shell">
      <article className="auth-card">
        <header>
          <h1>Registra tu consultorio</h1>
          <p>Crea tu cuenta de medico para publicar tu agenda en linea.</p>
        </header>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label htmlFor="reg-first-name">Nombre</label>
            <input
              id="reg-first-name"
              autoComplete="given-name"
              required
              value={form.firstName}
              onChange={(event) => update("firstName", event.currentTarget.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="reg-last-name">Apellidos</label>
            <input
              id="reg-last-name"
              autoComplete="family-name"
              required
              value={form.lastName}
              onChange={(event) => update("lastName", event.currentTarget.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="reg-professional-name">Nombre profesional</label>
            <input
              id="reg-professional-name"
              placeholder="Dra. Ana Ramirez"
              required
              value={form.professionalName}
              onChange={(event) => update("professionalName", event.currentTarget.value)}
            />
            <p className="field-hint">Asi te veran tus pacientes en el perfil publico.</p>
          </div>

          <div className="field">
            <label htmlFor="reg-specialty">Especialidad</label>
            <select
              id="reg-specialty"
              value={form.specialty}
              onChange={(event) => update("specialty", event.currentTarget.value)}
            >
              <option value="GENERAL_MEDICINE">Medicina general / familiar</option>
              <option value="ODONTOLOGY">Odontologia</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="reg-email">Correo electronico</label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(event) => update("email", event.currentTarget.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="reg-phone">Telefono (opcional)</label>
            <input
              id="reg-phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(event) => update("phone", event.currentTarget.value)}
            />
          </div>

          <div className={passwordInvalid ? "field has-error" : "field"}>
            <label htmlFor="reg-password">Contrasena</label>
            <input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              required
              aria-describedby="reg-password-rule"
              value={form.password}
              onBlur={() => setPasswordTouched(true)}
              onChange={(event) => update("password", event.currentTarget.value)}
            />
            {passwordInvalid ? (
              <p className="field-error" id="reg-password-rule">
                {PASSWORD_RULE}
              </p>
            ) : (
              <p className="field-hint" id="reg-password-rule">
                {PASSWORD_RULE}
              </p>
            )}
          </div>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <p className="field-hint">
            Al crear tu cuenta aceptas los terminos de servicio y el aviso de privacidad
            vigentes.
          </p>

          <button className="action-button" type="submit" disabled={busy}>
            {busy ? "Creando cuenta…" : "Crear cuenta"}
          </button>
        </form>

        <p className="auth-footer">
          ¿Ya tienes cuenta? <a href="/medico/login">Inicia sesion</a>
        </p>
      </article>
    </section>
  );
}
