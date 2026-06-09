"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { TextArea } from "@/components/TextArea";
import { toast } from "sonner";

type HistoryAppointment = {
  id: string;
  startTime: string;
  doctor: { name: string };
};

type HistoryResponse = {
  appointments: HistoryAppointment[];
};

export default function PreCheckinPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<HistoryAppointment[]>([]);
  const [appointmentId, setAppointmentId] = useState("");
  const [attendanceConfirmed, setAttendanceConfirmed] = useState(false);
  const [demographicsConfirmed, setDemographicsConfirmed] = useState(false);
  const [pendingPaymentsAcknowledged, setPendingPaymentsAcknowledged] = useState(false);
  const [notes, setNotes] = useState("");
  const [docName, setDocName] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [arcoType, setArcoType] = useState("ACCESS");
  const [arcoText, setArcoText] = useState("");

  useEffect(() => {
    fetch("/api/auth/patient/history", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: HistoryResponse) => {
        const upcoming = (data.appointments || []).filter((item) => new Date(item.startTime).getTime() > Date.now());
        setAppointments(upcoming);
        if (upcoming[0]) setAppointmentId(upcoming[0].id);
      })
      .catch(() => undefined);
  }, []);

  const savePrecheckin = async () => {
    const res = await fetch("/api/auth/patient/precheckin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointmentId: appointmentId || undefined,
        attendanceConfirmed,
        demographicsConfirmed,
        pendingPaymentsAcknowledged,
        checklist: [
          attendanceConfirmed ? "attendance_confirmed" : null,
          demographicsConfirmed ? "demographics_confirmed" : null,
          pendingPaymentsAcknowledged ? "payments_acknowledged" : null,
        ].filter(Boolean),
        notes,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "No se pudo guardar pre-check-in");
      return;
    }
    toast.success("Pre-check-in guardado");
  };

  const uploadDocument = async () => {
    const res = await fetch("/api/auth/patient/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointmentId: appointmentId || undefined,
        category: "STUDY",
        fileName: docName,
        fileUrl: docUrl,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "No se pudo registrar documento");
      return;
    }
    toast.success("Documento registrado");
    setDocName("");
    setDocUrl("");
  };

  const acceptConsent = async () => {
    const res = await fetch("/api/auth/patient/consents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointmentId: appointmentId || undefined,
        consentType: "SENSITIVE_DATA_PROCESSING",
        version: "v1.0",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "No se pudo registrar consentimiento");
      return;
    }
    toast.success("Consentimiento registrado");
  };

  const createArco = async () => {
    const res = await fetch("/api/auth/patient/arco", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: arcoType,
        requestText: arcoText,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "No se pudo crear solicitud ARCO");
      return;
    }
    toast.success("Solicitud ARCO enviada");
    setArcoText("");
  };

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pre-check-in del paciente</h1>
        <Button variant="secondary" onClick={() => router.push("/paciente/historial")}>Volver</Button>
      </div>

      <section className="rounded-md border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Checklist previo a consulta</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={attendanceConfirmed} onChange={(e) => setAttendanceConfirmed(e.target.checked)} /> Confirmo asistencia</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={demographicsConfirmed} onChange={(e) => setDemographicsConfirmed(e.target.checked)} /> Confirmo mis datos demográficos</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pendingPaymentsAcknowledged} onChange={(e) => setPendingPaymentsAcknowledged(e.target.checked)} /> Reconozco pagos pendientes</label>
        <div>
          <label className="text-sm text-muted-foreground">Cita</label>
          <select className="w-full mt-1 rounded-md border border-border bg-background p-2" value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)}>
            {appointments.map((item) => (
              <option key={item.id} value={item.id}>{new Date(item.startTime).toLocaleString("es-MX")} · {item.doctor.name}</option>
            ))}
          </select>
        </div>
        <TextArea label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button onClick={savePrecheckin}>Guardar pre-check-in</Button>
      </section>

      <section className="rounded-md border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Carga documental</h2>
        <Input label="Nombre del documento" value={docName} onChange={(e) => setDocName(e.target.value)} />
        <Input label="URL del documento" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} />
        <Button onClick={uploadDocument}>Registrar documento</Button>
      </section>

      <section className="rounded-md border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Consentimientos digitales</h2>
        <p className="text-sm text-muted-foreground">Acepta consentimiento para tratamiento de datos sensibles.</p>
        <Button onClick={acceptConsent}>Aceptar consentimiento</Button>
      </section>

      <section className="rounded-md border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Solicitud ARCO</h2>
        <select className="w-full rounded-md border border-border bg-background p-2" value={arcoType} onChange={(e) => setArcoType(e.target.value)}>
          <option value="ACCESS">Acceso</option>
          <option value="RECTIFICATION">Rectificación</option>
          <option value="CANCELLATION">Cancelación</option>
          <option value="OPPOSITION">Oposición</option>
        </select>
        <TextArea label="Describe tu solicitud" value={arcoText} onChange={(e) => setArcoText(e.target.value)} />
        <Button onClick={createArco}>Enviar solicitud ARCO</Button>
      </section>
    </div>
  );
}