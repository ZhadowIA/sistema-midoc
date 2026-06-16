"use client";

import { useMemo, useState } from "react";

import { sealEnvelope } from "../../../../../lib/seal-envelope";
import {
  BIOLOGICAL_SEX,
  MEDICAL_HISTORY_ENVELOPE_KIND,
  MEDICAL_HISTORY_GROUPS,
  medicalHistorySchema,
  type BiologicalSex,
  type MedicalHistoryPayload
} from "../../../../../lib/medical-history";

type MedicalHistoryFormProps = {
  token: string;
  /** Llave publica del dispositivo del medico para sellar (sealed box). */
  publicKey: string;
  onSaved: () => void;
};

type GroupValues = Record<string, Record<string, string>>;

const SEX_LABELS: Record<BiologicalSex, string> = {
  "": "Prefiero no decir",
  F: "Femenino",
  M: "Masculino"
};

export function MedicalHistoryForm({ token, publicKey, onSaved }: MedicalHistoryFormProps) {
  const [sex, setSex] = useState<BiologicalSex>("");
  const [groups, setGroups] = useState<GroupValues>({});
  const [allergies, setAllergies] = useState("");
  const [currentMedications, setCurrentMedications] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Gineco/andrologicos se muestran segun el sexo biologico capturado.
  const visibleGroups = useMemo(
    () => MEDICAL_HISTORY_GROUPS.filter((group) => !group.onlyForSex || group.onlyForSex === sex),
    [sex]
  );

  function setField(groupKey: string, fieldKey: string, value: string) {
    setGroups((current) => ({
      ...current,
      [groupKey]: { ...(current[groupKey] ?? {}), [fieldKey]: value }
    }));
  }

  function buildPayload(): MedicalHistoryPayload {
    // Solo se incluyen los grupos visibles: si el paciente cambia de sexo, no se
    // arrastran respuestas de la rama oculta.
    const payload: Record<string, unknown> = { sex: sex || undefined };
    for (const group of visibleGroups) {
      const values = groups[group.key];
      if (values) {
        payload[group.key] = values;
      }
    }
    if (allergies.trim()) {
      payload.allergies = allergies;
    }
    if (currentMedications.trim()) {
      payload.currentMedications = currentMedications;
    }
    return medicalHistorySchema.parse(payload);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const payload = buildPayload();
      const body = new TextEncoder().encode(JSON.stringify(payload));
      const ciphertext = await sealEnvelope(
        publicKey,
        { kind: MEDICAL_HISTORY_ENVELOPE_KIND },
        body
      );

      const response = await fetch(`/api/public/appointments/${token}/medical-history`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ciphertext })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No fue posible guardar tus antecedentes.");
      }

      onSaved();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "No fue posible guardar tus antecedentes."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="booking-form medical-history-form" onSubmit={handleSubmit}>
      <p className="field-hint">
        Tus antecedentes se cifran en este dispositivo antes de enviarse. Solo tu médico puede
        abrirlos; nuestros servidores nunca ven su contenido. Todo es opcional.
      </p>

      <fieldset className="mh-group">
        <legend>Datos generales</legend>
        <label className="field">
          <span>Sexo biológico</span>
          <select value={sex} onChange={(e) => setSex(e.target.value as BiologicalSex)}>
            {BIOLOGICAL_SEX.map((value) => (
              <option key={value || "none"} value={value}>
                {SEX_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      {visibleGroups.map((group) => (
        <fieldset className="mh-group" key={group.key}>
          <legend>{group.title}</legend>
          <div className="mh-grid">
            {group.fields.map((field) => {
              const value = groups[group.key]?.[field.key] ?? "";
              return (
                <label
                  className={field.kind === "textarea" ? "field field-full" : "field"}
                  key={field.key}
                >
                  <span>{field.label}</span>
                  {field.kind === "textarea" ? (
                    <textarea
                      rows={2}
                      value={value}
                      placeholder={field.placeholder}
                      onChange={(e) => setField(group.key, field.key, e.target.value)}
                    />
                  ) : (
                    <input
                      type="text"
                      value={value}
                      placeholder={field.placeholder}
                      onChange={(e) => setField(group.key, field.key, e.target.value)}
                    />
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <fieldset className="mh-group">
        <legend>Alergias y medicamentos</legend>
        <label className="field field-full">
          <span>Alergias (una por línea)</span>
          <textarea rows={3} value={allergies} onChange={(e) => setAllergies(e.target.value)} />
        </label>
        <label className="field field-full">
          <span>Medicamentos crónicos actuales (uno por línea)</span>
          <textarea
            rows={3}
            value={currentMedications}
            onChange={(e) => setCurrentMedications(e.target.value)}
          />
        </label>
      </fieldset>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="action-button" type="submit" disabled={busy}>
        {busy ? "Cifrando y enviando…" : "Enviar antecedentes de forma segura"}
      </button>
    </form>
  );
}
