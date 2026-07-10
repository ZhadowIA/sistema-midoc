import { useCallback, useEffect, useState } from "react";
import { call } from "./ipc";
import {
  draftToNewLabOrder,
  EMPTY_LAB_ORDER_DRAFT,
  isLabOrderOverdue,
  LAB_STATUS_LABELS,
  nextLabActions,
  validateLabOrderDraft,
  type LabOrder,
  type LabOrderDraft
} from "./dentalLab.ts";
import { formatCents } from "./dentalBudget.ts";
import { AutoGrowTextarea } from "./AutoGrowTextarea";

// Ordenes de laboratorio dental (paso 26 rebanada 4): alta y seguimiento por
// paciente. Todo OPERATIVO local; los pendientes globales se ven en
// Recepcion y caja para que ningun trabajo se pierda entre sesiones.

export function DentalLabPanel({
  patientId,
  encounterId,
  disabled
}: {
  patientId: string;
  encounterId: string | null;
  disabled: boolean;
}) {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [draft, setDraft] = useState<LabOrderDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setOrders(await call<LabOrder[]>("dental_list_lab_orders", { patientId }));
  }, [patientId]);

  useEffect(() => {
    load().catch((cause) => setError(String(cause)));
  }, [load]);

  async function run(action: () => Promise<void>) {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setWorking(false);
    }
  }

  function updateDraft(next: Partial<LabOrderDraft>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }

  async function createOrder() {
    if (!draft) return;
    const problem = validateLabOrderDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    await run(async () => {
      await call<LabOrder>("dental_create_lab_order", {
        order: draftToNewLabOrder(draft, patientId, encounterId)
      });
      setDraft(null);
      setMessage("Orden de laboratorio registrada. Marcala enviada cuando salga del consultorio.");
    });
  }

  return (
    <section className="dental-section dental-lab-panel">
      <div className="panel-header">
        <h3>Laboratorio dental</h3>
        <p>
          Coronas, protesis y guardas que salen a laboratorio: registra la orden, su fecha
          prometida y avanza su estado hasta entregarla al paciente.
        </p>
      </div>

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {draft ? (
        <article className="list-row dental-inline-card">
          <div className="dental-inline-grid">
            <label className="field compact-field">
              <span>Tipo de trabajo</span>
              <input
                value={draft.workType}
                placeholder="p. ej. Corona de zirconia"
                onChange={(event) => updateDraft({ workType: event.currentTarget.value })}
              />
            </label>
            <label className="field compact-field">
              <span>Laboratorio</span>
              <input
                value={draft.labName}
                placeholder="Laboratorio destino"
                onChange={(event) => updateDraft({ labName: event.currentTarget.value })}
              />
            </label>
            <label className="field compact-field">
              <span>Pieza</span>
              <input
                value={draft.toothId}
                onChange={(event) => updateDraft({ toothId: event.currentTarget.value })}
              />
            </label>
            <label className="field compact-field">
              <span>Fecha prometida</span>
              <input
                type="date"
                value={draft.promisedAt}
                onChange={(event) => updateDraft({ promisedAt: event.currentTarget.value })}
              />
            </label>
            <label className="field compact-field">
              <span>Costo (MXN)</span>
              <input
                value={draft.costText}
                placeholder="0.00"
                onChange={(event) => updateDraft({ costText: event.currentTarget.value })}
              />
            </label>
          </div>
          <label className="field compact-field grow-field">
            <span>Notas para el laboratorio</span>
            <AutoGrowTextarea
              rows={2}
              value={draft.notes}
              onChange={(event) => updateDraft({ notes: event.currentTarget.value })}
            />
          </label>
          <div className="button-row">
            <button className="action-button" type="button" disabled={working} onClick={() => void createOrder()}>
              Registrar orden
            </button>
            <button className="ghost-button" type="button" onClick={() => setDraft(null)}>
              Cancelar
            </button>
          </div>
        </article>
      ) : !disabled ? (
        <div className="button-row">
          <button
            className="action-button"
            type="button"
            onClick={() => setDraft({ ...EMPTY_LAB_ORDER_DRAFT })}
          >
            Nueva orden de laboratorio
          </button>
        </div>
      ) : null}

      {orders.map((order) => {
        const overdue = isLabOrderOverdue(order, today);
        return (
          <article
            className={`list-row dental-inline-card lab-order-card${overdue ? " lab-order-overdue" : ""}`}
            key={order.id}
          >
            <div className="budget-card-header">
              <strong>{order.work_type}</strong>
              <span className={`budget-status lab-status-${order.status.toLowerCase()}`}>
                {LAB_STATUS_LABELS[order.status] ?? order.status}
              </span>
              {overdue ? <span className="lab-overdue-chip">Vencida</span> : null}
              <span className="budget-card-total">
                {order.cost_cents > 0 ? formatCents(order.cost_cents) : null}
              </span>
            </div>
            <p className="lab-order-meta">
              {order.lab_name} · pieza {order.tooth_id}
              {order.promised_at ? ` · promete ${order.promised_at.slice(0, 10)}` : ""}
              {order.sent_at ? ` · enviada ${order.sent_at.slice(0, 10)}` : ""}
              {order.received_at ? ` · recibida ${order.received_at.slice(0, 10)}` : ""}
              {order.delivered_at ? ` · entregada ${order.delivered_at.slice(0, 10)}` : ""}
            </p>
            {order.notes ? <p className="lab-order-notes">{order.notes}</p> : null}
            {!disabled && nextLabActions(order.status).length > 0 ? (
              <div className="button-row">
                {nextLabActions(order.status).map((action) => (
                  <button
                    key={action.status}
                    className={action.status === "CANCELLED" ? "danger-button" : "action-button"}
                    type="button"
                    disabled={working}
                    onClick={() =>
                      void run(async () => {
                        await call<LabOrder>("dental_set_lab_order_status", {
                          orderId: order.id,
                          status: action.status
                        });
                      })
                    }
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
      {orders.length === 0 && !draft ? (
        <p className="odontogram-empty-hint">Sin ordenes de laboratorio para este paciente.</p>
      ) : null}
    </section>
  );
}
