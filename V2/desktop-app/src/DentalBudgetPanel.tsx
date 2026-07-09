import { useCallback, useEffect, useState } from "react";
import { call } from "./ipc";
import type { TreatmentPlanItem } from "./clinicalProfiles.ts";
import {
  BUDGET_STATUS_LABELS,
  createEmptyItemDraft,
  draftFromTreatmentPlan,
  draftToNewBudget,
  draftTotals,
  EMPTY_BUDGET_DRAFT,
  formatCents,
  ITEM_STATUS_OPTIONS,
  parseAmountToCents,
  validateBudgetDraft,
  type Budget,
  type BudgetDraft,
  type DentalBalance
} from "./dentalBudget.ts";
import { AutoGrowTextarea } from "./AutoGrowTextarea";

const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta" },
  { value: "TRANSFER", label: "Transferencia" }
];

interface AbonoForm {
  amountText: string;
  method: string;
}

export function DentalBudgetPanel({
  patientId,
  encounterId,
  treatmentPlan,
  disabled
}: {
  patientId: string;
  encounterId: string | null;
  treatmentPlan: TreatmentPlanItem[];
  disabled: boolean;
}) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [balance, setBalance] = useState<DentalBalance | null>(null);
  const [cashOpen, setCashOpen] = useState(false);
  const [builder, setBuilder] = useState<BudgetDraft | null>(null);
  const [abonos, setAbonos] = useState<Record<string, AbonoForm>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const [list, patientBalance, session] = await Promise.all([
      call<Budget[]>("dental_list_budgets", { patientId }),
      call<DentalBalance>("dental_patient_balance", { patientId }),
      call<{ id: string } | null>("get_open_cash_session")
    ]);
    setBudgets(list);
    setBalance(patientBalance);
    setCashOpen(Boolean(session));
  }, [patientId]);

  useEffect(() => {
    load().catch((err) => setError(String(err)));
  }, [load]);

  async function run(action: () => Promise<void>) {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setWorking(false);
    }
  }

  const planItems = draftFromTreatmentPlan(treatmentPlan);

  function openBuilder(items: BudgetDraft["items"]) {
    setBuilder({ ...EMPTY_BUDGET_DRAFT, items });
    setMessage(null);
    setError(null);
  }

  function updateBuilder(next: Partial<BudgetDraft>) {
    setBuilder((current) => (current ? { ...current, ...next } : current));
  }

  async function createBudget() {
    if (!builder) return;
    const problem = validateBudgetDraft(builder);
    if (problem) {
      setError(problem);
      return;
    }
    await run(async () => {
      // Los presupuestos creados en el mismo encuentro son alternativas entre
      // si: aceptar uno rechaza a los demas propuestos del grupo.
      await call<Budget>("dental_create_budget", {
        budget: draftToNewBudget(builder, patientId, encounterId, encounterId)
      });
      setBuilder(null);
      setMessage("Presupuesto propuesto. Registra la decision del paciente cuando la tengas.");
    });
  }

  async function registerAbono(budget: Budget) {
    const form = abonos[budget.id] ?? { amountText: "", method: "CASH" };
    const cents = parseAmountToCents(form.amountText);
    if (cents === null || cents <= 0) {
      setError("monto de abono invalido");
      return;
    }
    await run(async () => {
      const payment = await call<{ receipt_number: string }>("register_payment", {
        payment: {
          visit_id: null,
          appointment_id: null,
          patient_id: patientId,
          amount_cents: cents,
          method: form.method,
          kind: "PAYMENT",
          concept: `Abono dental — ${budget.label}`,
          budget_id: budget.id
        }
      });
      setAbonos((current) => ({ ...current, [budget.id]: { ...form, amountText: "" } }));
      setMessage(`Abono cobrado con recibo ${payment.receipt_number}.`);
    });
  }

  return (
    <section className="dental-section dental-budget-panel">
      <div className="panel-header">
        <h3>Presupuesto y saldo</h3>
        <p>
          Ponle precio al plan, registra la decision del paciente y cobra abonos por avance. Los
          cobros se asientan en la caja del dia.
        </p>
      </div>

      {balance && balance.accepted_budgets > 0 ? (
        <div className="budget-balance-summary">
          <span>
            Aceptado <strong>{formatCents(balance.accepted_total_cents)}</strong>
          </span>
          <span>
            Abonado <strong>{formatCents(balance.paid_cents)}</strong>
          </span>
          <span className={balance.balance_cents > 0 ? "budget-balance-due" : "budget-balance-clear"}>
            Saldo <strong>{formatCents(balance.balance_cents)}</strong>
          </span>
        </div>
      ) : null}

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {builder ? (
        <article className="list-row dental-inline-card budget-builder">
          <div className="dental-inline-grid">
            <label className="field compact-field">
              <span>Nombre del presupuesto</span>
              <input
                value={builder.label}
                placeholder="p. ej. Opcion resina"
                onChange={(event) => updateBuilder({ label: event.currentTarget.value })}
              />
            </label>
            <label className="field compact-field">
              <span>Descuento (MXN)</span>
              <input
                value={builder.discountText}
                placeholder="0"
                onChange={(event) => updateBuilder({ discountText: event.currentTarget.value })}
              />
            </label>
          </div>
          {builder.items.map((item, index) => (
            <div className="dental-inline-grid budget-item-grid" key={index}>
              <label className="field compact-field">
                <span>Pieza</span>
                <input
                  value={item.toothId}
                  onChange={(event) =>
                    updateBuilder({
                      items: builder.items.map((entry, i) =>
                        i === index ? { ...entry, toothId: event.currentTarget.value } : entry
                      )
                    })
                  }
                />
              </label>
              <label className="field compact-field grow-field">
                <span>Procedimiento</span>
                <input
                  value={item.procedure}
                  onChange={(event) =>
                    updateBuilder({
                      items: builder.items.map((entry, i) =>
                        i === index ? { ...entry, procedure: event.currentTarget.value } : entry
                      )
                    })
                  }
                />
              </label>
              <label className="field compact-field">
                <span>Precio (MXN)</span>
                <input
                  value={item.priceText}
                  placeholder="0.00"
                  onChange={(event) =>
                    updateBuilder({
                      items: builder.items.map((entry, i) =>
                        i === index ? { ...entry, priceText: event.currentTarget.value } : entry
                      )
                    })
                  }
                />
              </label>
              <button
                className="danger-button budget-item-remove"
                type="button"
                onClick={() =>
                  updateBuilder({ items: builder.items.filter((_, i) => i !== index) })
                }
              >
                Quitar
              </button>
            </div>
          ))}
          <label className="field compact-field grow-field">
            <span>Notas para el paciente</span>
            <AutoGrowTextarea
              rows={2}
              value={builder.notes}
              onChange={(event) => updateBuilder({ notes: event.currentTarget.value })}
            />
          </label>
          <div className="budget-builder-total">
            Total: <strong>{formatCents(draftTotals(builder).totalCents)}</strong>
          </div>
          <div className="button-row">
            <button
              className="ghost-button"
              type="button"
              onClick={() => updateBuilder({ items: [...builder.items, createEmptyItemDraft()] })}
            >
              Agregar partida
            </button>
            <button className="action-button" type="button" disabled={working} onClick={createBudget}>
              Proponer presupuesto
            </button>
            <button className="ghost-button" type="button" onClick={() => setBuilder(null)}>
              Cancelar
            </button>
          </div>
        </article>
      ) : !disabled ? (
        <div className="button-row">
          <button
            className="action-button"
            type="button"
            disabled={planItems.length === 0}
            title={planItems.length === 0 ? "El plan dental no tiene procedimientos" : undefined}
            onClick={() => openBuilder(planItems)}
          >
            Presupuesto desde el plan ({planItems.length})
          </button>
          <button className="ghost-button" type="button" onClick={() => openBuilder([createEmptyItemDraft()])}>
            Presupuesto en blanco
          </button>
        </div>
      ) : null}

      {budgets.map((budget) => (
        <article className="list-row dental-inline-card budget-card" key={budget.id}>
          <div className="budget-card-header">
            <strong>{budget.label}</strong>
            <span className={`budget-status budget-status-${budget.status.toLowerCase()}`}>
              {BUDGET_STATUS_LABELS[budget.status] ?? budget.status}
            </span>
            <span className="budget-card-total">{formatCents(budget.total_cents)}</span>
          </div>
          <table className="budget-items-table">
            <thead>
              <tr>
                <th>Pieza</th>
                <th>Procedimiento</th>
                <th>Precio</th>
                <th>Avance</th>
              </tr>
            </thead>
            <tbody>
              {budget.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.tooth_id}</td>
                  <td>{item.procedure}</td>
                  <td>{formatCents(item.price_cents)}</td>
                  <td>
                    {budget.status === "ACCEPTED" && !disabled ? (
                      <select
                        value={item.status}
                        disabled={working}
                        onChange={(event) => {
                          const status = event.currentTarget.value;
                          void run(async () => {
                            await call<Budget>("dental_set_item_status", {
                              itemId: item.id,
                              status
                            });
                          });
                        }}
                      >
                        {ITEM_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ITEM_STATUS_OPTIONS.find((option) => option.value === item.status)?.label ??
                      item.status
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {budget.discount_cents > 0 ? (
            <p className="budget-discount-note">
              Incluye descuento de {formatCents(budget.discount_cents)}.
            </p>
          ) : null}
          {budget.status === "PROPOSED" && !disabled ? (
            <div className="button-row">
              <button
                className="action-button"
                type="button"
                disabled={working}
                onClick={() =>
                  void run(async () => {
                    await call<Budget>("dental_decide_budget", {
                      budgetId: budget.id,
                      status: "ACCEPTED"
                    });
                    setMessage("Presupuesto aceptado. Ya puedes registrar avance y abonos.");
                  })
                }
              >
                Paciente acepta
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={working}
                onClick={() =>
                  void run(async () => {
                    await call<Budget>("dental_decide_budget", {
                      budgetId: budget.id,
                      status: "REJECTED"
                    });
                  })
                }
              >
                Paciente rechaza
              </button>
            </div>
          ) : null}
          {budget.status === "ACCEPTED" ? (
            <div className="budget-payment-row">
              <span>
                Abonado <strong>{formatCents(budget.paid_cents)}</strong> · Saldo{" "}
                <strong>{formatCents(budget.balance_cents)}</strong>
              </span>
              {budget.balance_cents > 0 && !disabled ? (
                <div className="budget-abono-form">
                  <input
                    placeholder="Monto"
                    value={abonos[budget.id]?.amountText ?? ""}
                    onChange={(event) => {
                      const amountText = event.currentTarget.value;
                      setAbonos((current) => ({
                        ...current,
                        [budget.id]: {
                          method: current[budget.id]?.method ?? "CASH",
                          amountText
                        }
                      }));
                    }}
                  />
                  <select
                    value={abonos[budget.id]?.method ?? "CASH"}
                    onChange={(event) => {
                      const method = event.currentTarget.value;
                      setAbonos((current) => ({
                        ...current,
                        [budget.id]: {
                          amountText: current[budget.id]?.amountText ?? "",
                          method
                        }
                      }));
                    }}
                  >
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="action-button"
                    type="button"
                    disabled={working || !cashOpen}
                    title={!cashOpen ? "Abre la caja del dia en Recepcion y caja" : undefined}
                    onClick={() => void registerAbono(budget)}
                  >
                    Cobrar abono
                  </button>
                  {!cashOpen ? (
                    <span className="budget-cash-hint">
                      Abre la caja del dia en Recepcion y caja para cobrar.
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
      {budgets.length === 0 && !builder ? (
        <p className="odontogram-empty-hint">
          Sin presupuestos para este paciente. Crea uno desde el plan dental de la nota.
        </p>
      ) : null}
    </section>
  );
}
