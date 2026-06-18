"use client";

import { useMemo, useState } from "react";

import { sealEnvelope } from "../../../../../lib/seal-envelope";
import {
  BIOLOGICAL_SEX,
  FAMILY_CONDITIONS,
  FAMILY_RELATIVES,
  MEDICAL_HISTORY_ENVELOPE_KIND,
  groupFields,
  medicalHistorySchema,
  patientGroups,
  type BiologicalSex,
  type BlockDef,
  type FieldDef,
  type GroupDef
} from "../../../../../lib/medical-history";

type MedicalHistoryFormProps = {
  token: string;
  /** Llave publica del dispositivo del medico para sellar (sealed box). */
  publicKey: string;
  onSaved: () => void;
};

type GroupValues = Record<string, Record<string, string>>;
type FamilyEntry = { relatives: string[]; type?: string };
type FamilyValues = Record<string, FamilyEntry>;

const SEX_LABELS: Record<BiologicalSex, string> = {
  "": "Prefiero no decir",
  F: "Femenino",
  M: "Masculino"
};

const FAMILY_HISTORY_KEY = "familyHistory";

export function MedicalHistoryForm({ token, publicKey, onSaved }: MedicalHistoryFormProps) {
  const [sex, setSex] = useState<BiologicalSex>("");
  const [groups, setGroups] = useState<GroupValues>({});
  const [family, setFamily] = useState<FamilyValues>({});
  const [allergies, setAllergies] = useState("");
  const [currentMedications, setCurrentMedications] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Gineco-obstetricos se muestran segun el sexo biologico capturado.
  const visibleGroups = useMemo(() => patientGroups(sex), [sex]);

  function setField(groupKey: string, fieldKey: string, value: string) {
    setGroups((current) => ({
      ...current,
      [groupKey]: { ...(current[groupKey] ?? {}), [fieldKey]: value }
    }));
  }

  // Un campo con `showWhen` solo aparece si su disparador tiene el valor pedido.
  function isFieldVisible(groupKey: string, field: FieldDef): boolean {
    if (!field.showWhen) return true;
    const trigger = groups[groupKey]?.[field.showWhen.field] ?? "";
    const equals = field.showWhen.equals;
    return Array.isArray(equals) ? equals.includes(trigger) : trigger === equals;
  }

  function toggleRelative(conditionKey: string, relative: string) {
    setFamily((current) => {
      const entry = current[conditionKey] ?? { relatives: [] };
      const relatives = entry.relatives.includes(relative)
        ? entry.relatives.filter((value) => value !== relative)
        : [...entry.relatives, relative];
      return { ...current, [conditionKey]: { ...entry, relatives } };
    });
  }

  function setFamilyType(conditionKey: string, type: string) {
    setFamily((current) => ({
      ...current,
      [conditionKey]: { relatives: current[conditionKey]?.relatives ?? [], type }
    }));
  }

  function toggleCondition(conditionKey: string, present: boolean) {
    setFamily((current) => {
      const next = { ...current };
      if (present) next[conditionKey] = current[conditionKey] ?? { relatives: [] };
      else delete next[conditionKey];
      return next;
    });
  }

  function buildFamilyPayload(): Record<string, FamilyEntry> {
    const result: Record<string, FamilyEntry> = {};
    for (const condition of FAMILY_CONDITIONS) {
      const entry = family[condition.key];
      if (!entry) continue;
      const relatives = entry.relatives.filter(Boolean);
      const type = entry.type?.trim();
      if (relatives.length === 0 && !type) continue;
      result[condition.key] = type ? { relatives, type } : { relatives };
    }
    return result;
  }

  function buildPayload() {
    const payload: Record<string, unknown> = { sex: sex || undefined };
    for (const group of visibleGroups) {
      if (group.key === FAMILY_HISTORY_KEY) {
        const fam = buildFamilyPayload();
        if (Object.keys(fam).length > 0) payload[group.key] = fam;
        continue;
      }
      const values = groups[group.key];
      if (!values) continue;
      const collected: Record<string, string> = {};
      for (const field of groupFields(group)) {
        if (!isFieldVisible(group.key, field)) continue;
        const value = values[field.key]?.trim();
        if (value) collected[field.key] = value;
      }
      if (Object.keys(collected).length > 0) payload[group.key] = collected;
    }
    if (allergies.trim()) payload.allergies = allergies;
    if (currentMedications.trim()) payload.currentMedications = currentMedications;
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

  function renderField(groupKey: string, field: FieldDef) {
    if (!isFieldVisible(groupKey, field)) return null;
    const value = groups[groupKey]?.[field.key] ?? "";
    const onChange = (next: string) => setField(groupKey, field.key, next);
    const fullWidth = field.kind === "textarea";
    return (
      <label className={fullWidth ? "field field-full" : "field"} key={field.key}>
        <span>
          {field.label}
          {field.suffix ? <em className="mh-suffix"> ({field.suffix})</em> : null}
        </span>
        {renderControl(field, value, onChange)}
      </label>
    );
  }

  function renderControl(field: FieldDef, value: string, onChange: (next: string) => void) {
    switch (field.kind) {
      case "textarea":
        return (
          <textarea
            rows={2}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case "number":
        return (
          <input
            type="number"
            inputMode="numeric"
            min={field.min}
            max={field.max}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case "date":
        return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
      case "yesno":
        return (
          <select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">Sin responder</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        );
      case "select":
        return (
          <select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">Sin responder</option>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      default:
        return (
          <input
            type="text"
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  }

  function renderGroupBody(group: GroupDef) {
    if (group.key === FAMILY_HISTORY_KEY) return renderFamilyHistory();
    const blocks: BlockDef[] = group.blocks
      ? group.blocks.filter((block) => !block.onlyForSex || block.onlyForSex === sex)
      : [{ title: "", fields: group.fields ?? [] }];
    return blocks.map((block, index) => (
      <div className="mh-block" key={block.title || index}>
        {block.title ? <h4 className="mh-block-title">{block.title}</h4> : null}
        <div className="mh-grid">
          {block.fields.map((field) => renderField(group.key, field))}
        </div>
      </div>
    ));
  }

  function renderFamilyHistory() {
    return (
      <div className="mh-family">
        <p className="field-hint">
          Marca los padecimientos presentes en tu familia y selecciona en quién.
        </p>
        {FAMILY_CONDITIONS.map((condition) => {
          const entry = family[condition.key];
          const present = Boolean(entry);
          return (
            <div className="mh-family-row" key={condition.key}>
              <label className="mh-family-check">
                <input
                  type="checkbox"
                  checked={present}
                  onChange={(e) => toggleCondition(condition.key, e.target.checked)}
                />
                <span>{condition.label}</span>
              </label>
              {present ? (
                <div className="mh-family-detail">
                  <div className="mh-family-relatives">
                    {FAMILY_RELATIVES.map((relative) => (
                      <label className="mh-relative" key={relative.value}>
                        <input
                          type="checkbox"
                          checked={entry.relatives.includes(relative.value)}
                          onChange={() => toggleRelative(condition.key, relative.value)}
                        />
                        <span>{relative.label}</span>
                      </label>
                    ))}
                  </div>
                  {condition.hasType ? (
                    <label className="field field-full">
                      <span>Tipo (ej. mama, colon, próstata)</span>
                      <input
                        type="text"
                        value={entry.type ?? ""}
                        onChange={(e) => setFamilyType(condition.key, e.target.value)}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <form className="booking-form medical-history-form" onSubmit={handleSubmit}>
      <p className="field-hint">
        Te recomendamos mucho contestar esta historia clínica para agilizar tu consulta, pero
        todo es opcional. Tus respuestas se cifran en este dispositivo antes de enviarse: solo tu
        médico puede abrirlas; nuestros servidores nunca ven su contenido.
      </p>

      <fieldset className="mh-group">
        <legend>Datos generales</legend>
        <div className="mh-grid">
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
        </div>
      </fieldset>

      {visibleGroups.map((group) => (
        <fieldset className="mh-group" key={group.key}>
          <legend>{group.title}</legend>
          {renderGroupBody(group)}
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
