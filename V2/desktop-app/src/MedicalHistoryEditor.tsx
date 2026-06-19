import {
  FAMILY_CONDITIONS,
  FAMILY_HISTORY_KEY,
  FAMILY_RELATIVES,
  patientMedicalHistoryGroups,
  type FieldDef
} from "./medicalHistoryFormat";
import type { MedicalHistoryPayload } from "./medicalHistoryReconciliation";

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function MedicalHistoryEditor({
  value,
  busy,
  onChange,
  onSave,
  onCancel
}: {
  value: MedicalHistoryPayload;
  busy: boolean;
  onChange: (value: MedicalHistoryPayload) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const sex = String(value.sex ?? "");
  const groups = patientMedicalHistoryGroups(sex);

  function setTopLevel(key: string, next: string) {
    onChange({ ...value, [key]: next });
  }

  function setField(groupKey: string, fieldKey: string, next: string) {
    onChange({
      ...value,
      [groupKey]: {
        ...objectValue(value[groupKey]),
        [fieldKey]: next
      }
    });
  }

  function isVisible(groupKey: string, field: FieldDef): boolean {
    if (!field.showWhen) return true;
    const trigger = String(objectValue(value[groupKey])[field.showWhen.field] ?? "");
    const equals = field.showWhen.equals;
    return Array.isArray(equals) ? equals.includes(trigger) : trigger === equals;
  }

  function renderControl(groupKey: string, field: FieldDef) {
    const current = String(objectValue(value[groupKey])[field.key] ?? "");
    const update = (next: string) => setField(groupKey, field.key, next);
    if (field.kind === "textarea") {
      return <textarea rows={2} value={current} onChange={(event) => update(event.target.value)} />;
    }
    if (field.kind === "yesno") {
      return (
        <select value={current} onChange={(event) => update(event.target.value)}>
          <option value="">Sin responder</option>
          <option value="si">Sí</option>
          <option value="no">No</option>
        </select>
      );
    }
    if (field.kind === "select") {
      return (
        <select value={current} onChange={(event) => update(event.target.value)}>
          <option value="">Sin responder</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
        min={field.min}
        max={field.max}
        value={current}
        onChange={(event) => update(event.target.value)}
      />
    );
  }

  function toggleFamilyCondition(conditionKey: string, checked: boolean) {
    const family = objectValue(value[FAMILY_HISTORY_KEY]);
    const next = { ...family };
    if (checked) next[conditionKey] = objectValue(family[conditionKey]);
    else delete next[conditionKey];
    onChange({ ...value, [FAMILY_HISTORY_KEY]: next });
  }

  function toggleRelative(conditionKey: string, relative: string) {
    const family = objectValue(value[FAMILY_HISTORY_KEY]);
    const condition = objectValue(family[conditionKey]);
    const relatives = Array.isArray(condition.relatives) ? [...condition.relatives] : [];
    const nextRelatives = relatives.includes(relative)
      ? relatives.filter((item) => item !== relative)
      : [...relatives, relative];
    onChange({
      ...value,
      [FAMILY_HISTORY_KEY]: {
        ...family,
        [conditionKey]: { ...condition, relatives: nextRelatives }
      }
    });
  }

  function setFamilyText(conditionKey: string, key: "type" | "notes", next: string) {
    const family = objectValue(value[FAMILY_HISTORY_KEY]);
    const condition = objectValue(family[conditionKey]);
    onChange({
      ...value,
      [FAMILY_HISTORY_KEY]: {
        ...family,
        [conditionKey]: { ...condition, [key]: next }
      }
    });
  }

  return (
    <div className="medical-history-workflow">
      <div className="panel-header">
        <strong>Editar antecedentes completos</strong>
        <p>Cada guardado crea una versión permanente nueva del expediente.</p>
      </div>

      <section className="medical-history-edit-group">
        <h4>Datos generales</h4>
        <div className="medical-history-edit-grid">
          <label className="field">
            <span>Sexo biológico</span>
            <select value={sex} onChange={(event) => setTopLevel("sex", event.target.value)}>
              <option value="">Sin responder</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </select>
          </label>
          <label className="field">
            <span>Alergias</span>
            <textarea
              rows={2}
              value={String(value.allergies ?? "")}
              onChange={(event) => setTopLevel("allergies", event.target.value)}
            />
          </label>
          <label className="field">
            <span>Medicamentos actuales</span>
            <textarea
              rows={2}
              value={String(value.currentMedications ?? "")}
              onChange={(event) => setTopLevel("currentMedications", event.target.value)}
            />
          </label>
        </div>
      </section>

      {groups.map((group) => (
        <section className="medical-history-edit-group" key={group.key}>
          <h4>{group.title}</h4>
          {group.key === FAMILY_HISTORY_KEY ? (
            <div className="medical-history-family-edit">
              {FAMILY_CONDITIONS.map((condition) => {
                const family = objectValue(value[FAMILY_HISTORY_KEY]);
                const entry = objectValue(family[condition.key]);
                const present = Object.prototype.hasOwnProperty.call(family, condition.key);
                const relatives = Array.isArray(entry.relatives) ? entry.relatives : [];
                return (
                  <div className="medical-history-family-row" key={condition.key}>
                    <label className="medical-history-family-check">
                      <input
                        type="checkbox"
                        checked={present}
                        onChange={(event) =>
                          toggleFamilyCondition(condition.key, event.target.checked)
                        }
                      />
                      <span>{condition.label}</span>
                    </label>
                    {present ? (
                      <div className="medical-history-family-detail">
                        <div className="medical-history-relative-grid">
                          {Object.entries(FAMILY_RELATIVES).map(([key, label]) => (
                            <label key={key}>
                              <input
                                type="checkbox"
                                checked={relatives.includes(key)}
                                onChange={() => toggleRelative(condition.key, key)}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                        {condition.hasType ? (
                          <input
                            placeholder="Tipo"
                            value={String(entry.type ?? "")}
                            onChange={(event) =>
                              setFamilyText(condition.key, "type", event.target.value)
                            }
                          />
                        ) : null}
                        <input
                          placeholder="Notas"
                          value={String(entry.notes ?? "")}
                          onChange={(event) =>
                            setFamilyText(condition.key, "notes", event.target.value)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="medical-history-edit-grid">
              {group.fields.filter((field) => isVisible(group.key, field)).map((field) => (
                <label
                  className={field.kind === "textarea" ? "field field-full" : "field"}
                  key={field.key}
                >
                  <span>
                    {field.label}
                    {field.suffix ? ` (${field.suffix})` : ""}
                  </span>
                  {renderControl(group.key, field)}
                </label>
              ))}
            </div>
          )}
        </section>
      ))}

      <div className="button-row">
        <button type="button" className="ghost-button" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="action-button" disabled={busy} onClick={onSave}>
          {busy ? "Guardando…" : "Guardar nueva versión"}
        </button>
      </div>
    </div>
  );
}
