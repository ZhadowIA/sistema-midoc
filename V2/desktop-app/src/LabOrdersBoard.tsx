import { useCallback, useEffect, useState } from "react";

import { isLabOrderOverdue, LAB_STATUS_LABELS, nextLabActions, type PendingLabOrder } from "./dentalLab.ts";
import { call } from "./ipc";

interface Props {
  onOpenPatient: (patientId: string) => void;
  /** Avisa que cambio el conteo de pendientes (para la navegacion). */
  onChanged: () => void;
}

/**
 * Trabajos de laboratorio fuera del consultorio de todos los pacientes, los mas
 * proximos a su fecha prometida primero. Antes vivia en Recepcion, que quedo
 * congelada con el reenfoque; aqui el medico los sigue sin abrir cada expediente.
 */
export function LabOrdersBoard({ onOpenPatient, onChanged }: Props) {
  const [orders, setOrders] = useState<PendingLabOrder[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    call<PendingLabOrder[]>("dental_pending_lab_orders")
      .then((next) => {
        setOrders(next);
        setError("");
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function advance(order: PendingLabOrder, status: string, label: string) {
    if (status === "CANCELLED" && !window.confirm(`¿Cancelar la orden de ${order.work_type} de ${order.patient_name}?`)) {
      return;
    }
    setBusy(order.id);
    setError("");
    try {
      await call("dental_set_lab_order_status", { orderId: order.id, status });
      load();
      onChanged();
    } catch (e) {
      setError(`${label}: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="directory">
      <div className="page-heading">
        <div>
          <h1>Laboratorio</h1>
          <p>Trabajos por enviar o enviados al laboratorio, los mas proximos a su fecha prometida primero.</p>
        </div>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {orders === null ? null : orders.length === 0 ? (
        <div className="empty-state">
          <strong>Sin trabajos pendientes</strong>
          <p>Las ordenes se crean desde el modulo odontologico de la consulta.</p>
        </div>
      ) : (
        <div className="directory-list">
          {orders.map((order) => {
            const overdue = isLabOrderOverdue(order, today);
            return (
              <div className={`directory-item lab-pending-row${overdue ? " lab-order-overdue" : ""}`} key={order.id}>
                <div className="directory-info">
                  <strong>
                    {order.work_type} · pieza {order.tooth_id}
                  </strong>
                  <span className="meta">
                    {order.patient_name} · {order.lab_name}
                    {order.promised_at ? ` · promete ${order.promised_at.slice(0, 10)}` : ""}
                  </span>
                </div>
                <div className="lab-pending-status">
                  <span className={`budget-status lab-status-${order.status.toLowerCase()}`}>
                    {LAB_STATUS_LABELS[order.status] ?? order.status}
                  </span>
                  {overdue ? <span className="lab-overdue-chip">Vencida</span> : null}
                </div>
                <div className="row-actions">
                  <button className="ghost-button" type="button" onClick={() => onOpenPatient(order.patient_id)}>
                    Expediente
                  </button>
                  {nextLabActions(order.status).map((action) => (
                    <button
                      key={action.status}
                      type="button"
                      className={action.status === "CANCELLED" ? "ghost-button" : "action-button"}
                      disabled={busy === order.id}
                      onClick={() => void advance(order, action.status, action.label)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
