import { useCallback, useEffect, useState } from "react";
import {
  isLabOrderOverdue,
  LAB_STATUS_LABELS,
  type PendingLabOrder
} from "./dentalLab.ts";
import { call } from "./ipc";
import {
  PatientResolution,
  type PatientMatch,
  type ResolutionPatient
} from "./PatientResolution";

interface WalkInInput {
  patient_name: string;
  patient_phone: string | null;
  reason: string | null;
}

type AttendOutcome =
  | { kind: "encounter"; encounter_id: string }
  | {
      kind: "needs_resolution";
      appointment_patient: ResolutionPatient;
      candidates: PatientMatch[];
    };

type WalkInOutcome =
  | { kind: "visit"; visit: Visit }
  | { kind: "needs_resolution"; candidates: PatientMatch[] };

type PendingResolution =
  | { kind: "visit"; visitId: string; patient: ResolutionPatient; candidates: PatientMatch[] }
  | { kind: "walkin"; input: WalkInInput; patient: ResolutionPatient; candidates: PatientMatch[] };

function splitName(fullName: string): { first_name: string; last_name: string } {
  const trimmed = fullName.trim();
  const space = trimmed.indexOf(" ");
  return space === -1
    ? { first_name: trimmed, last_name: "" }
    : { first_name: trimmed.slice(0, space), last_name: trimmed.slice(space + 1) };
}

/**
 * Operacion presencial (paso 10): recepcion, lista de espera, consulta sin
 * cita, recursos, caja diaria, cobros y recibos. Todo vive en la base cifrada
 * local; este modulo extiende el nucleo cita-expediente sin modificarlo.
 */

export interface Visit {
  id: string;
  appointment_id: string | null;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string | null;
  reason: string | null;
  service_name: string | null;
  state: string;
  priority: number;
  resource_id: string | null;
  resource_name: string | null;
  encounter_id: string | null;
  arrived_at: string;
  started_at: string | null;
  ended_at: string | null;
}

interface Resource {
  id: string;
  name: string;
  kind: string;
  active: boolean;
}

interface CashSession {
  id: string;
  opened_at: string;
  opening_float_cents: number;
  closed_at: string | null;
  closing_counted_cents: number | null;
  notes: string | null;
}

interface MethodTotal {
  method: string;
  total_cents: number;
}

interface CashSummary {
  session: CashSession;
  payment_count: number;
  net_total_cents: number;
  by_method: MethodTotal[];
  expected_cash_cents: number;
}

interface Payment {
  id: string;
  cash_session_id: string;
  visit_id: string | null;
  patient_id: string | null;
  amount_cents: number;
  method: string;
  kind: string;
  concept: string | null;
  receipt_number: string;
  created_at: string;
}

interface AppointmentRow {
  id: string;
  status: string;
  scheduled_start: string;
  service_name: string | null;
  patient_name: string;
}

const timeFormatter = new Intl.DateTimeFormat("es-MX", { timeStyle: "short" });
const moneyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN"
});

const VISIT_STATE_LABELS: Record<string, string> = {
  WAITING: "En espera",
  IN_PROGRESS: "En consulta",
  DONE: "Atendida",
  CANCELLED: "Cancelada"
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia"
};

const KIND_LABELS: Record<string, string> = {
  PAYMENT: "Cobro",
  DEPOSIT: "Anticipo",
  REFUND: "Reembolso"
};

const money = (cents: number) => moneyFormatter.format(cents / 100);
const pesosToCents = (value: string) => Math.round(Number(value) * 100);

export function Recepcion({
  onOpenEncounter
}: {
  onOpenEncounter: (encounterId: string) => void;
}) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [session, setSession] = useState<CashSession | null>(null);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resolution, setResolution] = useState<PendingResolution | null>(null);
  const [labPending, setLabPending] = useState<PendingLabOrder[]>([]);
  const today = new Date().toISOString().slice(0, 10);

  const refresh = useCallback(async () => {
    try {
      const [visitRows, resourceRows, appts, openSession, pendingLab] = await Promise.all([
        call<Visit[]>("list_active_visits"),
        call<Resource[]>("list_resources"),
        call<AppointmentRow[]>("list_appointments"),
        call<CashSession | null>("get_open_cash_session"),
        call<PendingLabOrder[]>("dental_pending_lab_orders")
      ]);
      setVisits(visitRows);
      setResources(resourceRows);
      setAppointments(appts);
      setSession(openSession);
      setLabPending(pendingLab);
      if (openSession) {
        const [cashSummary, sessionPayments] = await Promise.all([
          call<CashSummary>("cash_summary", { sessionId: openSession.id }),
          call<Payment[]>("list_session_payments", { sessionId: openSession.id })
        ]);
        setSummary(cashSummary);
        setPayments(sessionPayments);
      } else {
        setSummary(null);
        setPayments([]);
      }
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(action: () => Promise<void>, ok?: string) {
    setError("");
    setMessage("");
    try {
      await action();
      if (ok) setMessage(ok);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function attend(visit: Visit) {
    setError("");
    setMessage("");
    try {
      const outcome = await call<AttendOutcome>("start_visit_encounter", { visitId: visit.id });
      if (outcome.kind === "encounter") {
        onOpenEncounter(outcome.encounter_id);
      } else {
        setResolution({
          kind: "visit",
          visitId: visit.id,
          patient: outcome.appointment_patient,
          candidates: outcome.candidates
        });
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function registerWalkIn(input: WalkInInput) {
    setError("");
    setMessage("");
    try {
      const outcome = await call<WalkInOutcome>("register_walk_in", {
        walkIn: input,
        linkPatientId: null,
        forceNew: false
      });
      if (outcome.kind === "visit") {
        setMessage("Consulta sin cita registrada.");
        await refresh();
      } else {
        setResolution({
          kind: "walkin",
          input,
          patient: { ...splitName(input.patient_name), phone: input.patient_phone, email: null },
          candidates: outcome.candidates
        });
      }
    } catch (e) {
      setError(String(e));
    }
  }

  // Resuelve la pendiente vinculando a un expediente existente o creando uno
  // nuevo, segun el origen (atender una visita con cita o registrar walk-in).
  async function resolvePending(choice: { linkPatientId?: string; forceNew?: boolean }) {
    if (!resolution) return;
    setError("");
    setMessage("");
    try {
      if (resolution.kind === "visit") {
        const outcome = await call<AttendOutcome>("start_visit_encounter", {
          visitId: resolution.visitId,
          linkPatientId: choice.linkPatientId ?? null,
          forceNew: choice.forceNew ?? false
        });
        setResolution(null);
        if (outcome.kind === "encounter") {
          onOpenEncounter(outcome.encounter_id);
        }
      } else {
        await call<WalkInOutcome>("register_walk_in", {
          walkIn: resolution.input,
          linkPatientId: choice.linkPatientId ?? null,
          forceNew: choice.forceNew ?? false
        });
        setResolution(null);
        setMessage("Consulta sin cita registrada.");
        await refresh();
      }
    } catch (e) {
      setError(String(e));
    }
  }

  const checkedInAppointmentIds = new Set(
    visits.map((v) => v.appointment_id).filter((id): id is string => id !== null)
  );
  const arrivableAppointments = appointments.filter(
    (a) => a.status !== "CANCELLED" && !checkedInAppointmentIds.has(a.id)
  );

  return (
    <div className="content">
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {resolution ? (
        <>
          <PatientResolution
            patient={resolution.patient}
            candidates={resolution.candidates}
            busy={false}
            onOpenRecord={(patientId) => void resolvePending({ linkPatientId: patientId })}
            onCreateNew={() => void resolvePending({ forceNew: true })}
            onClose={() => setResolution(null)}
            closeLabel="Cancelar"
          />
        </>
      ) : null}

      <div hidden={resolution !== null}>
      <WaitingRoom
        visits={visits}
        resources={resources}
        onAttend={attend}
        onSetState={(visitId, state) =>
          run(
            () => call("set_visit_state", { visitId, visitState: state }),
            state === "DONE" ? "Visita marcada como atendida." : undefined
          )
        }
        onAssignResource={(visitId, resourceId) =>
          run(() => call("assign_resource", { visitId, resourceId: resourceId || null }))
        }
      />

      <Reception
        arrivableAppointments={arrivableAppointments}
        onCheckIn={(appointmentId) =>
          run(() => call("check_in_appointment", { appointmentId }), "Llegada registrada.")
        }
        onWalkIn={(walkIn) => void registerWalkIn(walkIn)}
      />

      <ResourcesPanel
        resources={resources}
        onCreate={(name, kind) =>
          run(() => call("create_resource", { resource: { name, kind } }), "Recurso agregado.")
        }
        onToggle={(resourceId, active) =>
          run(() => call("set_resource_active", { resourceId, active }))
        }
      />

      <CashRegister
        session={session}
        summary={summary}
        payments={payments}
        visits={visits}
        onOpen={(cents) =>
          run(() => call("open_cash_session", { openingFloatCents: cents }), "Caja abierta.")
        }
        onClose={(cents, notes) =>
          run(
            () => call("close_cash_session", { countedCashCents: cents, notes: notes || null }),
            "Caja cerrada."
          )
        }
        onPay={(payment) =>
          run(() => call("register_payment", { payment }), "Cobro registrado.")
        }
      />

      {labPending.length > 0 ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Laboratorio: pendientes por recibir</h2>
            <p>Trabajos fuera del consultorio, los mas proximos a su fecha prometida primero.</p>
          </div>
          <div className="stack">
            {labPending.map((order) => {
              const overdue = isLabOrderOverdue(order, today);
              return (
                <article
                  className={`list-row lab-pending-row${overdue ? " lab-order-overdue" : ""}`}
                  key={order.id}
                >
                  <div>
                    <strong>{order.work_type}</strong>
                    <span className="meta">
                      {" "}
                      · {order.patient_name} · pieza {order.tooth_id} · {order.lab_name}
                    </span>
                  </div>
                  <div className="lab-pending-status">
                    <span className={`budget-status lab-status-${order.status.toLowerCase()}`}>
                      {LAB_STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    {order.promised_at ? (
                      <span className="meta">promete {order.promised_at.slice(0, 10)}</span>
                    ) : null}
                    {overdue ? <span className="lab-overdue-chip">Vencida</span> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      </div>
    </div>
  );
}

function WaitingRoom({
  visits,
  resources,
  onAttend,
  onSetState,
  onAssignResource
}: {
  visits: Visit[];
  resources: Resource[];
  onAttend: (visit: Visit) => void;
  onSetState: (visitId: string, state: string) => void;
  onAssignResource: (visitId: string, resourceId: string) => void;
}) {
  const activeResources = resources.filter((r) => r.active);
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Lista de espera</h2>
        <p>Pacientes presentes hoy, por prioridad y orden de llegada.</p>
      </div>
      {visits.length === 0 ? (
        <div className="empty-state">
          <strong>Sala vacia</strong>
          <p>Registra una llegada o una consulta sin cita para iniciar el dia.</p>
        </div>
      ) : (
        <ul className="appointment-list">
          {visits.map((visit) => (
            <li key={visit.id} className="list-row">
              <div className="list-row-main">
                <strong>{visit.patient_name}</strong>
                <span className="meta">
                  Llego {timeFormatter.format(new Date(visit.arrived_at))}
                  {visit.service_name ? ` · ${visit.service_name}` : ""}
                  {visit.appointment_id ? " · con cita" : " · sin cita"}
                  {visit.reason ? ` · ${visit.reason}` : ""}
                </span>
                <span className="meta">
                  <select
                    value={visit.resource_id ?? ""}
                    onChange={(e) => onAssignResource(visit.id, e.currentTarget.value)}
                    aria-label="Asignar recurso"
                  >
                    <option value="">Sin asignar</option>
                    {activeResources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </span>
              </div>
              <div className="row-actions">
                <span
                  className={
                    visit.state === "IN_PROGRESS" ? "pill pill-success" : "pill pill-primary"
                  }
                >
                  {VISIT_STATE_LABELS[visit.state] ?? visit.state}
                </span>
                <button className="action-button" onClick={() => onAttend(visit)}>
                  {visit.encounter_id ? "Continuar" : "Atender"}
                </button>
                <button className="ghost-button" onClick={() => onSetState(visit.id, "DONE")}>
                  Cerrar
                </button>
                <button
                  className="ghost-button"
                  onClick={() => onSetState(visit.id, "CANCELLED")}
                >
                  Cancelar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Reception({
  arrivableAppointments,
  onCheckIn,
  onWalkIn
}: {
  arrivableAppointments: AppointmentRow[];
  onCheckIn: (appointmentId: string) => void;
  onWalkIn: (walkIn: {
    patient_name: string;
    patient_phone: string | null;
    reason: string | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");

  function submitWalkIn(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onWalkIn({
      patient_name: name.trim(),
      patient_phone: phone.trim() || null,
      reason: reason.trim() || null
    });
    setName("");
    setPhone("");
    setReason("");
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Recepcion</h2>
        <p>Registra la llegada de una cita o una consulta sin cita previa.</p>
      </div>

      {arrivableAppointments.length > 0 && (
        <ul className="appointment-list">
          {arrivableAppointments.map((appointment) => (
            <li key={appointment.id} className="list-row">
              <div className="list-row-main">
                <strong>{appointment.patient_name}</strong>
                <span className="meta">
                  {timeFormatter.format(new Date(appointment.scheduled_start))} ·{" "}
                  {appointment.service_name ?? "Consulta"}
                </span>
              </div>
              <div className="row-actions">
                <button className="ghost-button" onClick={() => onCheckIn(appointment.id)}>
                  Registrar llegada
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="stack" onSubmit={submitWalkIn}>
        <h3 className="meta">Consulta sin cita</h3>
        <label className="field">
          <span>Nombre del paciente</span>
          <input value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </label>
        <div className="button-row">
          <label className="field grow-field">
            <span>Telefono (opcional)</span>
            <input value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />
          </label>
          <label className="field grow-field">
            <span>Motivo (opcional)</span>
            <input value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
          </label>
        </div>
        <div className="button-row">
          <button className="action-button" type="submit" disabled={!name.trim()}>
            Registrar sin cita
          </button>
        </div>
      </form>
    </section>
  );
}

function ResourcesPanel({
  resources,
  onCreate,
  onToggle
}: {
  resources: Resource[];
  onCreate: (name: string, kind: string) => void;
  onToggle: (resourceId: string, active: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("ROOM");

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Recursos fisicos</h2>
        <p>Consultorios y equipos que asignas a cada visita.</p>
      </div>
      {resources.length > 0 && (
        <ul className="appointment-list">
          {resources.map((r) => (
            <li key={r.id} className="list-row">
              <div className="list-row-main">
                <strong>{r.name}</strong>
                <span className="meta">{r.kind === "ROOM" ? "Consultorio" : r.kind === "EQUIPMENT" ? "Equipo" : "Otro"}</span>
              </div>
              <div className="row-actions">
                <span className={r.active ? "pill pill-success" : "pill pill-muted"}>
                  {r.active ? "Activo" : "Inactivo"}
                </span>
                <button className="ghost-button" onClick={() => onToggle(r.id, !r.active)}>
                  {r.active ? "Desactivar" : "Activar"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="button-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onCreate(name.trim(), kind);
          setName("");
        }}
      >
        <label className="field grow-field">
          <span>Nombre</span>
          <input value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </label>
        <label className="field">
          <span>Tipo</span>
          <select value={kind} onChange={(e) => setKind(e.currentTarget.value)}>
            <option value="ROOM">Consultorio</option>
            <option value="EQUIPMENT">Equipo</option>
            <option value="OTHER">Otro</option>
          </select>
        </label>
        <button className="ghost-button" type="submit" disabled={!name.trim()}>
          Agregar
        </button>
      </form>
    </section>
  );
}

function CashRegister({
  session,
  summary,
  payments,
  visits,
  onOpen,
  onClose,
  onPay
}: {
  session: CashSession | null;
  summary: CashSummary | null;
  payments: Payment[];
  visits: Visit[];
  onOpen: (cents: number) => void;
  onClose: (cents: number, notes: string) => void;
  onPay: (payment: {
    visit_id: string | null;
    patient_id: string | null;
    amount_cents: number;
    method: string;
    kind: string;
    concept: string | null;
  }) => void;
}) {
  const [opening, setOpening] = useState("0");
  const [counted, setCounted] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [kind, setKind] = useState("PAYMENT");
  const [concept, setConcept] = useState("");
  const [visitId, setVisitId] = useState("");

  if (!session) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>Caja del dia</h2>
          <p>Abre la caja con el fondo inicial para empezar a cobrar.</p>
        </div>
        <form
          className="button-row"
          onSubmit={(e) => {
            e.preventDefault();
            onOpen(pesosToCents(opening || "0"));
          }}
        >
          <label className="field grow-field">
            <span>Fondo inicial (MXN)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={opening}
              onChange={(e) => setOpening(e.currentTarget.value)}
            />
          </label>
          <button className="action-button" type="submit">
            Abrir caja
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Caja del dia</h2>
        <p>
          Abierta {timeFormatter.format(new Date(session.opened_at))} · fondo{" "}
          {money(session.opening_float_cents)}
        </p>
      </div>

      {summary && (
        <div className="cash-summary">
          <div className="cash-summary-grid">
            <span className="meta">Movimientos: {summary.payment_count}</span>
            <span className="meta">Total neto: {money(summary.net_total_cents)}</span>
            <span className="meta">
              Efectivo esperado: {money(summary.expected_cash_cents)}
            </span>
            {summary.by_method.map((m) => (
              <span key={m.method} className="meta">
                {METHOD_LABELS[m.method] ?? m.method}: {money(m.total_cents)}
              </span>
            ))}
          </div>
        </div>
      )}

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const cents = pesosToCents(amount);
          if (!Number.isFinite(cents) || cents <= 0) return;
          const selected = visits.find((v) => v.id === visitId) ?? null;
          onPay({
            visit_id: selected?.id ?? null,
            patient_id: selected?.patient_id ?? null,
            amount_cents: cents,
            method,
            kind,
            concept: concept.trim() || null
          });
          setAmount("");
          setConcept("");
          setVisitId("");
        }}
      >
        <h3 className="meta">Registrar cobro</h3>
        <div className="button-row">
          <label className="field">
            <span>Monto (MXN)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
            />
          </label>
          <label className="field">
            <span>Metodo</span>
            <select value={method} onChange={(e) => setMethod(e.currentTarget.value)}>
              <option value="CASH">Efectivo</option>
              <option value="CARD">Tarjeta</option>
              <option value="TRANSFER">Transferencia</option>
            </select>
          </label>
          <label className="field">
            <span>Tipo</span>
            <select value={kind} onChange={(e) => setKind(e.currentTarget.value)}>
              <option value="PAYMENT">Cobro</option>
              <option value="DEPOSIT">Anticipo</option>
              <option value="REFUND">Reembolso</option>
            </select>
          </label>
        </div>
        <div className="button-row">
          <label className="field grow-field">
            <span>Paciente (opcional)</span>
            <select value={visitId} onChange={(e) => setVisitId(e.currentTarget.value)}>
              <option value="">Sin asociar</option>
              {visits.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.patient_name}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow-field">
            <span>Concepto (opcional)</span>
            <input value={concept} onChange={(e) => setConcept(e.currentTarget.value)} />
          </label>
        </div>
        <div className="button-row">
          <button className="action-button" type="submit" disabled={pesosToCents(amount || "0") <= 0}>
            Registrar cobro
          </button>
        </div>
      </form>

      {payments.length > 0 && (
        <ul className="history-list">
          {payments.map((p) => (
            <li key={p.id} className="list-row">
              <div className="list-row-main">
                <strong>
                  {p.receipt_number} · {money(p.amount_cents)}
                </strong>
                <span className="meta">
                  {KIND_LABELS[p.kind] ?? p.kind} · {METHOD_LABELS[p.method] ?? p.method}
                  {p.concept ? ` · ${p.concept}` : ""} ·{" "}
                  {timeFormatter.format(new Date(p.created_at))}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onClose(pesosToCents(counted || "0"), closeNotes);
        }}
      >
        <h3 className="meta">Cerrar caja</h3>
        <div className="button-row">
          <label className="field grow-field">
            <span>Efectivo contado (MXN)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={counted}
              onChange={(e) => setCounted(e.currentTarget.value)}
            />
          </label>
          <label className="field grow-field">
            <span>Notas (opcional)</span>
            <input value={closeNotes} onChange={(e) => setCloseNotes(e.currentTarget.value)} />
          </label>
        </div>
        <div className="button-row">
          <button className="danger-button" type="submit">
            Cerrar caja del dia
          </button>
        </div>
      </form>
    </section>
  );
}
