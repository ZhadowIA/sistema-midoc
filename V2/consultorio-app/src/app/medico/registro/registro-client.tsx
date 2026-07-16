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

function normalizePhoneForSubmit(phone: string) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (!trimmed) {
    return undefined;
  }

  if (digits.length === 10) {
    return `+52${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("52")) {
    return `+${digits}`;
  }

  return trimmed;
}

export function RegistroClient() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    personalPhone: "",
    patientContactPhone: "",
    professionalName: "",
    licenseNumber: "",
    specialty: "GENERAL_MEDICINE",
    password: "",
    passwordConfirmation: ""
  });
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmationTouched, setConfirmationTouched] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const passwordInvalid = passwordTouched && !passwordMeetsPolicy(form.password);
  const confirmationInvalid =
    confirmationTouched && form.passwordConfirmation !== form.password;

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit() {
    if (!passwordMeetsPolicy(form.password)) {
      setPasswordTouched(true);
      return;
    }
    if (form.passwordConfirmation !== form.password) {
      setConfirmationTouched(true);
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
          firstName: form.firstName.trim().replace(/\s+/g, " "),
          lastName: form.lastName.trim().replace(/\s+/g, " "),
          professionalName: form.professionalName.trim().replace(/\s+/g, " "),
          licenseNumber: form.licenseNumber.trim().replace(/\s+/g, " "),
          personalPhone: normalizePhoneForSubmit(form.personalPhone),
          patientContactPhone: normalizePhoneForSubmit(form.patientContactPhone)
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
            <label htmlFor="reg-license">Cedula profesional</label>
            <input
              id="reg-license"
              required
              placeholder="1234567"
              value={form.licenseNumber}
              onChange={(event) => update("licenseNumber", event.currentTarget.value)}
            />
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
            <label htmlFor="reg-personal-phone">Teléfono personal (opcional)</label>
            <input
              id="reg-personal-phone"
              type="tel"
              autoComplete="tel"
              value={form.personalPhone}
              onChange={(event) => update("personalPhone", event.currentTarget.value)}
            />
            <p className="field-hint">Lo usamos para recuperar tu cuenta y comunicarnos contigo.</p>
          </div>

          <div className="field">
            <label htmlFor="reg-patient-contact-phone">Teléfono para pacientes (opcional)</label>
            <input
              id="reg-patient-contact-phone"
              type="tel"
              autoComplete="tel"
              value={form.patientContactPhone}
              onChange={(event) => update("patientContactPhone", event.currentTarget.value)}
            />
            <p className="field-hint">Será el número de contacto en tu perfil público; puede ser el mismo.</p>
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

          <div className={confirmationInvalid ? "field has-error" : "field"}>
            <label htmlFor="reg-password-confirmation">Confirmar contrasena</label>
            <input
              id="reg-password-confirmation"
              type="password"
              autoComplete="new-password"
              required
              value={form.passwordConfirmation}
              onBlur={() => setConfirmationTouched(true)}
              onChange={(event) => update("passwordConfirmation", event.currentTarget.value)}
            />
            {confirmationInvalid ? (
              <p className="field-error" role="alert">
                La confirmacion no coincide.
              </p>
            ) : null}
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
