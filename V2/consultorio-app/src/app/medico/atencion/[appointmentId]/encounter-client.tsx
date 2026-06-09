"use client";

import { useEffect, useState } from "react";

type EncounterWorkspace = {
  appointment: {
    id: string;
    status: string;
    scheduledStart: string;
    reason: string | null;
  };
  patient: {
    id: string;
    firstName: string;
    lastName: string;
  };
  clinicalRecord: {
    id: string;
    summary: unknown;
    alerts: unknown;
    lastEncounterAt: string | null;
  };
  encounter: {
    id: string;
    status: string;
  };
  clinicalNote: {
    status: string;
    currentVersion: number;
    subjective: unknown;
    objective: unknown;
    assessment: unknown;
    plan: unknown;
  } | null;
  prescription: {
    diagnosis: string | null;
    notes: string | null;
    items: Array<{
      medicationName: string;
      dosage: string | null;
      frequency: string | null;
      duration: string | null;
      instructions: string | null;
    }>;
  } | null;
  instructions: Array<{
    title: string;
    body: string;
  }>;
  precheckin: {
    status: string;
    responses: unknown;
  } | null;
} | null;

type EncounterClientProps = {
  appointmentId: string;
};

function jsonText(input: unknown, key: string) {
  if (input && typeof input === "object" && key in (input as Record<string, unknown>)) {
    const value = (input as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  }

  return "";
}

export function EncounterClient({ appointmentId }: EncounterClientProps) {
  const [workspace, setWorkspace] = useState<EncounterWorkspace>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    summary: "",
    alerts: "",
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
    diagnosis: "",
    prescriptionNotes: "",
    medicationName: "",
    dosage: "",
    frequency: "",
    duration: "",
    medicationInstructions: "",
    instructionTitle: "",
    instructionBody: "",
    closingSummary: ""
  });

  useEffect(() => {
    async function loadWorkspace() {
      const response = await fetch(`/api/admin/appointments/${appointmentId}/encounter`);
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "No fue posible cargar la atencion.");
        return;
      }

      const nextWorkspace = data.workspace as EncounterWorkspace;
      setWorkspace(nextWorkspace);

      if (nextWorkspace) {
        setForm({
          summary: JSON.stringify(nextWorkspace.clinicalRecord.summary ?? {}, null, 2),
          alerts: JSON.stringify(nextWorkspace.clinicalRecord.alerts ?? {}, null, 2),
          subjective: jsonText(nextWorkspace.clinicalNote?.subjective, "text"),
          objective: jsonText(nextWorkspace.clinicalNote?.objective, "text"),
          assessment: jsonText(nextWorkspace.clinicalNote?.assessment, "text"),
          plan: jsonText(nextWorkspace.clinicalNote?.plan, "text"),
          diagnosis: nextWorkspace.prescription?.diagnosis ?? "",
          prescriptionNotes: nextWorkspace.prescription?.notes ?? "",
          medicationName: nextWorkspace.prescription?.items[0]?.medicationName ?? "",
          dosage: nextWorkspace.prescription?.items[0]?.dosage ?? "",
          frequency: nextWorkspace.prescription?.items[0]?.frequency ?? "",
          duration: nextWorkspace.prescription?.items[0]?.duration ?? "",
          medicationInstructions: nextWorkspace.prescription?.items[0]?.instructions ?? "",
          instructionTitle: nextWorkspace.instructions[0]?.title ?? "",
          instructionBody: nextWorkspace.instructions[0]?.body ?? "",
          closingSummary: ""
        });
      }
    }

    void loadWorkspace();
  }, [appointmentId]);

  async function openEncounter() {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/appointments/${appointmentId}/encounter`, {
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No fue posible abrir la atencion.");
      }

      setWorkspace(data.workspace);
      setMessage("Atencion abierta.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible abrir la atencion.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEncounter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspace?.encounter.id) {
      setMessage("Primero abre la atencion.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/encounters/${workspace.encounter.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clinicalRecord: {
            summary: form.summary ? JSON.parse(form.summary) : {},
            alerts: form.alerts ? JSON.parse(form.alerts) : {}
          },
          note: {
            subjective: form.subjective,
            objective: form.objective,
            assessment: form.assessment,
            plan: form.plan
          },
          prescription: {
            diagnosis: form.diagnosis,
            notes: form.prescriptionNotes,
            items: form.medicationName
              ? [
                  {
                    medicationName: form.medicationName,
                    dosage: form.dosage,
                    frequency: form.frequency,
                    duration: form.duration,
                    instructions: form.medicationInstructions
                  }
                ]
              : []
          },
          instructions: form.instructionTitle && form.instructionBody
            ? [
                {
                  title: form.instructionTitle,
                  body: form.instructionBody
                }
              ]
            : []
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No fue posible guardar la atencion.");
      }

      setMessage("Atencion guardada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible guardar la atencion.");
    } finally {
      setBusy(false);
    }
  }

  async function closeCurrentEncounter() {
    if (!workspace?.encounter.id) {
      setMessage("Primero abre la atencion.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/encounters/${workspace.encounter.id}/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          closingSummary: form.closingSummary
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No fue posible cerrar la atencion.");
      }

      setWorkspace((current) =>
        current
          ? {
              ...current,
              encounter: {
                ...current.encounter,
                status: "CLOSED"
              }
            }
          : current
      );
      setMessage("Atencion cerrada y nota firmada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cerrar la atencion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="public-shell">
      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Atencion clinica</span>
          <h2>
            {workspace?.patient.firstName ?? "Paciente"} {workspace?.patient.lastName ?? ""}
          </h2>
        </div>

        <div className="appointment-summary">
          <p><strong>Estado cita:</strong> {workspace?.appointment.status ?? "PENDIENTE"}</p>
          <p><strong>Estado atencion:</strong> {workspace?.encounter.status ?? "NO ABIERTA"}</p>
          <p><strong>Motivo:</strong> {workspace?.appointment.reason || "Sin motivo capturado."}</p>
          <p><strong>Precheckin:</strong> {workspace?.precheckin?.status ?? "SIN RESPUESTAS"}</p>
        </div>

        <button className="action-button" disabled={busy || Boolean(workspace?.encounter)} onClick={openEncounter}>
          {workspace?.encounter ? "Atencion abierta" : busy ? "Abriendo..." : "Abrir atencion"}
        </button>
      </article>

      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Registro</span>
          <h2>SOAP, receta e indicaciones</h2>
        </div>

        <form className="booking-form" onSubmit={saveEncounter}>
          <label className="field field-full">
            <span>Resumen expediente (JSON simple)</span>
            <textarea rows={4} value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} />
          </label>
          <label className="field field-full">
            <span>Alertas (JSON simple)</span>
            <textarea rows={4} value={form.alerts} onChange={(event) => setForm((current) => ({ ...current, alerts: event.target.value }))} />
          </label>
          <label className="field field-full">
            <span>Subjetivo</span>
            <textarea rows={3} value={form.subjective} onChange={(event) => setForm((current) => ({ ...current, subjective: event.target.value }))} />
          </label>
          <label className="field field-full">
            <span>Objetivo</span>
            <textarea rows={3} value={form.objective} onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))} />
          </label>
          <label className="field field-full">
            <span>Evaluacion</span>
            <textarea rows={3} value={form.assessment} onChange={(event) => setForm((current) => ({ ...current, assessment: event.target.value }))} />
          </label>
          <label className="field field-full">
            <span>Plan</span>
            <textarea rows={3} value={form.plan} onChange={(event) => setForm((current) => ({ ...current, plan: event.target.value }))} />
          </label>
          <label className="field">
            <span>Diagnostico receta</span>
            <input value={form.diagnosis} onChange={(event) => setForm((current) => ({ ...current, diagnosis: event.target.value }))} />
          </label>
          <label className="field">
            <span>Medicamento</span>
            <input value={form.medicationName} onChange={(event) => setForm((current) => ({ ...current, medicationName: event.target.value }))} />
          </label>
          <label className="field">
            <span>Dosis</span>
            <input value={form.dosage} onChange={(event) => setForm((current) => ({ ...current, dosage: event.target.value }))} />
          </label>
          <label className="field">
            <span>Frecuencia</span>
            <input value={form.frequency} onChange={(event) => setForm((current) => ({ ...current, frequency: event.target.value }))} />
          </label>
          <label className="field">
            <span>Duracion</span>
            <input value={form.duration} onChange={(event) => setForm((current) => ({ ...current, duration: event.target.value }))} />
          </label>
          <label className="field field-full">
            <span>Instrucciones del medicamento</span>
            <textarea rows={2} value={form.medicationInstructions} onChange={(event) => setForm((current) => ({ ...current, medicationInstructions: event.target.value }))} />
          </label>
          <label className="field field-full">
            <span>Notas receta</span>
            <textarea rows={2} value={form.prescriptionNotes} onChange={(event) => setForm((current) => ({ ...current, prescriptionNotes: event.target.value }))} />
          </label>
          <label className="field">
            <span>Titulo indicacion</span>
            <input value={form.instructionTitle} onChange={(event) => setForm((current) => ({ ...current, instructionTitle: event.target.value }))} />
          </label>
          <label className="field field-full">
            <span>Indicaciones al paciente</span>
            <textarea rows={3} value={form.instructionBody} onChange={(event) => setForm((current) => ({ ...current, instructionBody: event.target.value }))} />
          </label>

          <button className="action-button" disabled={busy || !workspace?.encounter.id} type="submit">
            {busy ? "Guardando..." : "Guardar atencion"}
          </button>
        </form>

        <label className="field field-full">
          <span>Resumen de cierre</span>
          <textarea rows={3} value={form.closingSummary} onChange={(event) => setForm((current) => ({ ...current, closingSummary: event.target.value }))} />
        </label>
        <button className="action-button" disabled={busy || !workspace?.encounter.id} onClick={closeCurrentEncounter}>
          {busy ? "Cerrando..." : "Cerrar y firmar nota"}
        </button>

        {message ? <p className="status-copy">{message}</p> : null}
      </article>
    </section>
  );
}
