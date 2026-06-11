import {
  createEmptyMouthCondition,
  createEmptyTreatmentPlanItem,
  DENTAL_TOOTH_IDS,
  type DentalPayload,
  getDefaultDentalToothRecord,
  getDefaultPeriodontogramRecord,
  MOUTH_CONDITION_OPTIONS,
  TOOTH_FACES,
  TOOTH_STATUS_OPTIONS,
  TREATMENT_PRIORITY_OPTIONS,
  TREATMENT_STATUS_OPTIONS,
  type ToothFace,
  SURFACE_STATUS_OPTIONS
} from "./clinicalProfiles";

const UPPER_TEETH = DENTAL_TOOTH_IDS.slice(0, 16);
const LOWER_TEETH = DENTAL_TOOTH_IDS.slice(16);
const PERIODONTAL_LABELS = ["MB", "B", "DB", "ML", "L", "DL"];

function ToothCard({
  toothId,
  payload,
  disabled,
  onChange
}: {
  toothId: string;
  payload: DentalPayload;
  disabled: boolean;
  onChange: (next: DentalPayload) => void;
}) {
  const tooth = payload.odontogram[toothId] ?? getDefaultDentalToothRecord();

  function updateTooth(nextTooth: typeof tooth) {
    onChange({
      ...payload,
      odontogram: {
        ...payload.odontogram,
        [toothId]: nextTooth
      }
    });
  }

  return (
    <article className="tooth-card">
      <div className="tooth-card-header">
        <strong>Pieza {toothId}</strong>
        <span className="meta">Pieza y superficies</span>
      </div>
      <label className="field compact-field">
        <span>Estado</span>
        <select
          value={tooth.status}
          disabled={disabled}
          onChange={(event) =>
            updateTooth({
              ...tooth,
              status: event.currentTarget.value as typeof tooth.status
            })
          }
        >
          {TOOTH_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="surface-grid">
        {TOOTH_FACES.map((face) => (
          <label className="field compact-field" key={face}>
            <span>{face}</span>
            <select
              value={tooth.surfaces[face] ?? "HEALTHY"}
              disabled={disabled}
              onChange={(event) =>
                updateTooth({
                  ...tooth,
                  surfaces: {
                    ...tooth.surfaces,
                    [face]: event.currentTarget.value as (typeof tooth.surfaces)[ToothFace]
                  }
                })
              }
            >
              {SURFACE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="field compact-field">
        <span>Notas</span>
        <textarea
          rows={2}
          value={tooth.notes}
          disabled={disabled}
          onChange={(event) =>
            updateTooth({
              ...tooth,
              notes: event.currentTarget.value
            })
          }
        />
      </label>
    </article>
  );
}

function PeriodontogramArch({
  title,
  teeth,
  payload,
  disabled,
  onChange
}: {
  title: string;
  teeth: readonly string[];
  payload: DentalPayload;
  disabled: boolean;
  onChange: (next: DentalPayload) => void;
}) {
  function updateTooth(toothId: string, updater: (record: ReturnType<typeof getDefaultPeriodontogramRecord>) => ReturnType<typeof getDefaultPeriodontogramRecord>) {
    const current = payload.periodontogram[toothId] ?? getDefaultPeriodontogramRecord();
    onChange({
      ...payload,
      periodontogram: {
        ...payload.periodontogram,
        [toothId]: updater(current)
      }
    });
  }

  return (
    <div className="periodontogram-block">
      <div className="panel-header">
        <h4>{title}</h4>
        <p>Sondaje, recesion, sangrado, movilidad y furcacion.</p>
      </div>
      <div className="periodontogram-scroll">
        <table className="periodontogram-table">
          <thead>
            <tr>
              <th>Pieza</th>
              {PERIODONTAL_LABELS.map((label) => (
                <th key={label}>PD {label}</th>
              ))}
              {PERIODONTAL_LABELS.map((label) => (
                <th key={`rec-${label}`}>REC {label}</th>
              ))}
              {PERIODONTAL_LABELS.map((label) => (
                <th key={`bleed-${label}`}>B {label}</th>
              ))}
              <th>Mov</th>
              <th>Furc</th>
            </tr>
          </thead>
          <tbody>
            {teeth.map((toothId) => {
              const record = payload.periodontogram[toothId] ?? getDefaultPeriodontogramRecord();
              return (
                <tr key={toothId}>
                  <th>{toothId}</th>
                  {record.pocketDepth.map((value, index) => (
                    <td key={`pd-${toothId}-${index}`}>
                      <input
                        className="periodontal-input"
                        type="number"
                        min={0}
                        max={15}
                        value={value}
                        disabled={disabled}
                        onChange={(event) =>
                          updateTooth(toothId, (current) => {
                            const next = [...current.pocketDepth] as typeof current.pocketDepth;
                            next[index] = Number(event.currentTarget.value || 0);
                            return { ...current, pocketDepth: next };
                          })
                        }
                      />
                    </td>
                  ))}
                  {record.recession.map((value, index) => (
                    <td key={`rec-${toothId}-${index}`}>
                      <input
                        className="periodontal-input"
                        type="number"
                        min={0}
                        max={15}
                        value={value}
                        disabled={disabled}
                        onChange={(event) =>
                          updateTooth(toothId, (current) => {
                            const next = [...current.recession] as typeof current.recession;
                            next[index] = Number(event.currentTarget.value || 0);
                            return { ...current, recession: next };
                          })
                        }
                      />
                    </td>
                  ))}
                  {record.bleeding.map((value, index) => (
                    <td key={`bleed-${toothId}-${index}`}>
                      <input
                        className="periodontal-checkbox"
                        type="checkbox"
                        checked={value}
                        disabled={disabled}
                        onChange={(event) =>
                          updateTooth(toothId, (current) => {
                            const next = [...current.bleeding] as typeof current.bleeding;
                            next[index] = event.currentTarget.checked;
                            return { ...current, bleeding: next };
                          })
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <select
                      value={record.mobility}
                      disabled={disabled}
                      onChange={(event) =>
                        updateTooth(toothId, (current) => ({
                          ...current,
                          mobility: Number(event.currentTarget.value) as typeof current.mobility
                        }))
                      }
                    >
                      {[0, 1, 2, 3].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={record.furcation}
                      disabled={disabled}
                      onChange={(event) =>
                        updateTooth(toothId, (current) => ({
                          ...current,
                          furcation: Number(event.currentTarget.value) as typeof current.furcation
                        }))
                      }
                    >
                      {[0, 1, 2, 3].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DentalNoteEditor({
  payload,
  disabled,
  onChange
}: {
  payload: DentalPayload;
  disabled: boolean;
  onChange: (next: DentalPayload) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  function addCondition() {
    onChange({
      ...payload,
      mouthConditions: [...payload.mouthConditions, createEmptyMouthCondition(today)]
    });
  }

  function addTreatmentItem() {
    onChange({
      ...payload,
      treatmentPlan: [...payload.treatmentPlan, createEmptyTreatmentPlanItem()]
    });
  }

  return (
    <div className="stack">
      <section className="dental-section">
        <div className="panel-header">
          <h3>Odontograma</h3>
          <p>Hallazgos por pieza y superficie para una consulta dental completa.</p>
        </div>
        <div className="odontogram-arches">
          <div className="stack">
            <h4>Arcada superior</h4>
            <div className="tooth-grid">
              {UPPER_TEETH.map((toothId) => (
                <ToothCard
                  key={toothId}
                  toothId={toothId}
                  payload={payload}
                  disabled={disabled}
                  onChange={onChange}
                />
              ))}
            </div>
          </div>
          <div className="stack">
            <h4>Arcada inferior</h4>
            <div className="tooth-grid">
              {LOWER_TEETH.map((toothId) => (
                <ToothCard
                  key={toothId}
                  toothId={toothId}
                  payload={payload}
                  disabled={disabled}
                  onChange={onChange}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="dental-section">
        <div className="panel-header">
          <h3>Periodontograma</h3>
          <p>Captura periodontal por pieza en seis sitios, con sangrado y movilidad.</p>
        </div>
        <PeriodontogramArch
          title="Arcada superior"
          teeth={UPPER_TEETH}
          payload={payload}
          disabled={disabled}
          onChange={onChange}
        />
        <PeriodontogramArch
          title="Arcada inferior"
          teeth={LOWER_TEETH}
          payload={payload}
          disabled={disabled}
          onChange={onChange}
        />
      </section>

      <section className="dental-section">
        <div className="panel-header">
          <h3>Condiciones bucales</h3>
          <p>Registra bruxismo, maloclusion, enfermedad periodontal y otros hallazgos generales.</p>
        </div>
        <div className="stack">
          {payload.mouthConditions.map((entry) => (
            <article key={entry.id} className="list-row dental-inline-card">
              <div className="dental-inline-grid">
                <label className="field compact-field">
                  <span>Condicion</span>
                  <select
                    value={entry.condition}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        ...payload,
                        mouthConditions: payload.mouthConditions.map((condition) =>
                          condition.id === entry.id
                            ? {
                                ...condition,
                                condition: event.currentTarget.value as typeof condition.condition
                              }
                            : condition
                        )
                      })
                    }
                  >
                    {MOUTH_CONDITION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field compact-field">
                  <span>Fecha</span>
                  <input
                    type="date"
                    value={entry.date}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        ...payload,
                        mouthConditions: payload.mouthConditions.map((condition) =>
                          condition.id === entry.id
                            ? { ...condition, date: event.currentTarget.value }
                            : condition
                        )
                      })
                    }
                  />
                </label>
                <label className="field compact-field">
                  <span>Severidad</span>
                  <select
                    value={entry.severity ?? ""}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        ...payload,
                        mouthConditions: payload.mouthConditions.map((condition) =>
                          condition.id === entry.id
                            ? {
                                ...condition,
                                severity:
                                  event.currentTarget.value === ""
                                    ? undefined
                                    : (event.currentTarget.value as NonNullable<typeof condition.severity>)
                              }
                            : condition
                        )
                      })
                    }
                  >
                    <option value="">Sin clasificar</option>
                    <option value="MILD">Leve</option>
                    <option value="MODERATE">Moderada</option>
                    <option value="SEVERE">Severa</option>
                  </select>
                </label>
                <label className="field compact-field">
                  <span>Resuelta</span>
                  <select
                    value={entry.resolved ? "yes" : "no"}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        ...payload,
                        mouthConditions: payload.mouthConditions.map((condition) =>
                          condition.id === entry.id
                            ? { ...condition, resolved: event.currentTarget.value === "yes" }
                            : condition
                        )
                      })
                    }
                  >
                    <option value="no">Activa</option>
                    <option value="yes">Resuelta</option>
                  </select>
                </label>
              </div>
              <label className="field compact-field grow-field">
                <span>Notas</span>
                <textarea
                  rows={2}
                  value={entry.notes ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...payload,
                      mouthConditions: payload.mouthConditions.map((condition) =>
                        condition.id === entry.id
                          ? { ...condition, notes: event.currentTarget.value || undefined }
                          : condition
                      )
                    })
                  }
                />
              </label>
              {!disabled ? (
                <div className="button-row">
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() =>
                      onChange({
                        ...payload,
                        mouthConditions: payload.mouthConditions.filter(
                          (condition) => condition.id !== entry.id
                        )
                      })
                    }
                  >
                    Quitar condicion
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {!disabled ? (
            <div className="button-row">
              <button className="ghost-button" type="button" onClick={addCondition}>
                Agregar condicion bucal
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="dental-section">
        <div className="panel-header">
          <h3>Plan dental</h3>
          <p>Procedimientos por pieza o generales, con prioridad, estado y fecha sugerida.</p>
        </div>
        <div className="stack">
          {payload.treatmentPlan.map((item) => (
            <article key={item.id} className="list-row dental-inline-card">
              <div className="dental-inline-grid plan-grid">
                <label className="field compact-field">
                  <span>Pieza</span>
                  <input
                    value={item.toothId}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        ...payload,
                        treatmentPlan: payload.treatmentPlan.map((plan) =>
                          plan.id === item.id ? { ...plan, toothId: event.currentTarget.value } : plan
                        )
                      })
                    }
                  />
                </label>
                <label className="field compact-field">
                  <span>Procedimiento</span>
                  <input
                    value={item.procedure}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        ...payload,
                        treatmentPlan: payload.treatmentPlan.map((plan) =>
                          plan.id === item.id
                            ? { ...plan, procedure: event.currentTarget.value }
                            : plan
                        )
                      })
                    }
                  />
                </label>
                <label className="field compact-field">
                  <span>Prioridad</span>
                  <select
                    value={item.priority}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        ...payload,
                        treatmentPlan: payload.treatmentPlan.map((plan) =>
                          plan.id === item.id
                            ? { ...plan, priority: event.currentTarget.value as typeof plan.priority }
                            : plan
                        )
                      })
                    }
                  >
                    {TREATMENT_PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field compact-field">
                  <span>Estado</span>
                  <select
                    value={item.status}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        ...payload,
                        treatmentPlan: payload.treatmentPlan.map((plan) =>
                          plan.id === item.id
                            ? { ...plan, status: event.currentTarget.value as typeof plan.status }
                            : plan
                        )
                      })
                    }
                  >
                    {TREATMENT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field compact-field">
                  <span>Fecha sugerida</span>
                  <input
                    type="date"
                    value={item.sessionDate}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        ...payload,
                        treatmentPlan: payload.treatmentPlan.map((plan) =>
                          plan.id === item.id
                            ? { ...plan, sessionDate: event.currentTarget.value }
                            : plan
                        )
                      })
                    }
                  />
                </label>
              </div>
              <label className="field compact-field grow-field">
                <span>Notas</span>
                <textarea
                  rows={2}
                  value={item.notes}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...payload,
                      treatmentPlan: payload.treatmentPlan.map((plan) =>
                        plan.id === item.id ? { ...plan, notes: event.currentTarget.value } : plan
                      )
                    })
                  }
                />
              </label>
              {!disabled ? (
                <div className="button-row">
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() =>
                      onChange({
                        ...payload,
                        treatmentPlan: payload.treatmentPlan.filter((plan) => plan.id !== item.id)
                      })
                    }
                  >
                    Quitar procedimiento
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {!disabled ? (
            <div className="button-row">
              <button className="ghost-button" type="button" onClick={addTreatmentItem}>
                Agregar procedimiento
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="dental-section dental-summary-grid">
        <label className="field">
          <span>Plan de higiene</span>
          <textarea
            rows={3}
            value={payload.hygienePlan}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...payload,
                hygienePlan: event.currentTarget.value
              })
            }
          />
        </label>
        <label className="field">
          <span>Proxima revision</span>
          <input
            type="date"
            value={payload.nextRevision}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...payload,
                nextRevision: event.currentTarget.value
              })
            }
          />
        </label>
      </section>
    </div>
  );
}
