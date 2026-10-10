"use client";

import { useState } from "react";

import type { PrescriberProfile } from "../../../services/doctor/prescriber-profile-service";

// Datos que exige la receta (Reglamento de Insumos para la Salud). Se editan
// aqui o en la app de escritorio; el portal guarda solo si nadie los cambio
// desde que se cargaron (regla 4.6).

type Draft = Omit<PrescriberProfile, "updatedAt">;

const FIELDS: { key: keyof Draft; label: string; hint?: string; required?: boolean; full?: boolean }[] = [
  { key: "professionalName", label: "Nombre profesional", required: true, full: true },
  { key: "licenseNumber", label: "Cedula profesional", required: true },
  { key: "degreeInstitution", label: "Institucion que expidio el titulo" },
  { key: "specialtyTitle", label: "Especialidad", hint: "Dejalo vacio si no ejerces una especialidad." },
  { key: "specialtyLicenseNumber", label: "Cedula de especialidad" },
  { key: "addressLine1", label: "Domicilio del consultorio", full: true },
  { key: "addressLine2", label: "Interior, colonia u otra referencia", full: true },
  { key: "city", label: "Ciudad" },
  { key: "state", label: "Estado" },
  { key: "postalCode", label: "Codigo postal" }
];

function toDraft(profile: PrescriberProfile): Draft {
  return Object.fromEntries(FIELDS.map(({ key }) => [key, profile[key]])) as Draft;
}

export function PrescriberForm({ initial }: { initial: PrescriberProfile }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<Draft>(toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);

  const dirty = FIELDS.some(({ key }) => (draft[key] ?? "") !== (saved[key] ?? ""));

  async function save() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/profile/prescriber", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, expectedUpdatedAt: saved.updatedAt })
      });
      const data = await response.json();
      if (response.status === 409) {
        setStale(true);
      }
      if (!response.ok) {
        throw new Error(data.error || "No se pudieron guardar tus datos.");
      }
      setSaved(data.prescriber);
      setDraft(toDraft(data.prescriber));
      setStale(false);
      setMessage("Datos guardados. La app los toma en su proxima sincronizacion.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudieron guardar tus datos.");
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/profile/prescriber");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No se pudieron leer tus datos.");
      }
      setSaved(data.prescriber);
      setDraft(toDraft(data.prescriber));
      setStale(false);
      setMessage("Se cargo la version actual.");
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : "No se pudieron leer tus datos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {FIELDS.map(({ key, label, hint, required, full }) => (
        <div className={full ? "field field-full" : "field"} key={key}>
          <label htmlFor={`prescriber-${key}`}>{label}</label>
          <input
            id={`prescriber-${key}`}
            value={draft[key] ?? ""}
            // La especialidad declarada exige su cedula, igual que el servidor.
            required={required || (key === "specialtyLicenseNumber" && Boolean(draft.specialtyTitle?.trim()))}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDraft((current) => ({ ...current, [key]: value }));
            }}
          />
          {hint ? <small>{hint}</small> : null}
        </div>
      ))}
      {error ? (
        <p className="form-error field-full" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="form-success field-full" role="status">
          {message}
        </p>
      ) : null}
      <div className="button-row field-full">
        {stale ? (
          <button className="action-button" type="button" disabled={busy} onClick={() => void reload()}>
            Cargar version actual
          </button>
        ) : null}
        <button className="action-button" type="submit" disabled={busy || !dirty || stale}>
          {busy ? "Guardando…" : "Guardar datos"}
        </button>
      </div>
    </form>
  );
}
