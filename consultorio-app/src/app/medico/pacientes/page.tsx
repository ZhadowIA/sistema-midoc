"use client";

import { useState, useEffect } from "react";
import { DoctorLayout } from "@/components/DoctorLayout";
import { Search, User, Plus, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Input } from "@/components/Input";
import { toast } from "sonner";
import { formatPatientName } from "@/lib/patientName";

type PatientAppointmentSummary = {
  startTime: string;
  appointmentType: string;
};

type PatientDirectoryItem = {
  id: string;
  firstName?: string | null;
  lastNamePaternal?: string | null;
  lastNameMaternal?: string | null;
  dateOfBirth: string;
  phone: string;
  appointmentCount?: number;
  appointments?: PatientAppointmentSummary[];
};

function calculateAge(dateOfBirth: string): number {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function getLastAppointment(appointments?: PatientAppointmentSummary[]): string {
  if (!appointments || appointments.length === 0) return "Nunca";
  const sorted = [...appointments].sort((a, b) =>
    new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );
  return new Date(sorted[0].startTime).toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", year: "numeric"
  });
}

export default function PatientsDirectoryPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<PatientDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    firstName: "",
    lastNamePaternal: "",
    lastNameMaternal: "",
    phone: "",
    email: "",
    dateOfBirth: "",
  });
  const [creatingEncounterPatientId, setCreatingEncounterPatientId] = useState<string | null>(null);

  const loadPatients = async () => {
    const res = await fetch("/api/clinical/admin/patients");
    const data = await res.json();
    if (Array.isArray(data)) setPatients(data);
  };

  useEffect(() => {
    loadPatients()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleCreatePatient = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/clinical/admin/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: createForm.firstName,
          lastNamePaternal: createForm.lastNamePaternal,
          lastNameMaternal: createForm.lastNameMaternal || undefined,
          phone: createForm.phone,
          email: createForm.email,
          dateOfBirth: createForm.dateOfBirth,
        }),
      });
      const data = await res.json() as { error?: string; patient?: { id: string } };
      if (!res.ok) throw new Error(data.error || "No se pudo crear el paciente");

      setCreateOpen(false);
      setCreateForm({
        firstName: "",
        lastNamePaternal: "",
        lastNameMaternal: "",
        phone: "",
        email: "",
        dateOfBirth: "",
      });
      await loadPatients();

      if (data.patient?.id) {
        router.push(`/medico/pacientes/${data.patient.id}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateStandaloneEncounter = async (patientId: string) => {
    setCreatingEncounterPatientId(patientId);
    try {
      const res = await fetch("/api/clinical/admin/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          source: "STANDALONE",
        }),
      });
      const data = await res.json() as { error?: string; encounter?: { id: string } };
      if (!res.ok || !data.encounter?.id) {
        throw new Error(data.error || "No se pudo abrir el expediente standalone");
      }

      router.push(`/medico/expedientes/encounters/${data.encounter.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setCreatingEncounterPatientId(null);
    }
  };

  const filtered = patients.filter(p =>
    formatPatientName(p).toLowerCase().includes(search.toLowerCase()) ||
    p.phone.includes(search)
  );

  return (
    <DoctorLayout>
      <div className="p-6 lg:p-8 w-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Directorio de Pacientes</h1>
              <p className="text-muted-foreground text-sm mt-1">Gestiona los expedientes de tus pacientes</p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo paciente
            </Button>
          </div>
        </div>

        {/* Search bar */}
        <div className="bg-card border border-border rounded-2xl p-4 mb-6 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="w-full pl-10 pr-4 py-2 bg-input-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Buscar por nombre o teléfono..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Patients grid */}
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-12 animate-pulse">Cargando pacientes...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center shadow-sm">
            <p className="text-muted-foreground">No se encontraron pacientes</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(patient => {
              const age = calculateAge(patient.dateOfBirth);
              const count = patient.appointmentCount ?? patient.appointments?.length ?? 0;
              const last = getLastAppointment(patient.appointments);
              return (
                <div
                  key={patient.id}
                  onClick={() => router.push(`/medico/pacientes/${patient.id}`)}
                  className="bg-card border border-border rounded-2xl p-6 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
                >
                  {/* Avatar + name */}
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-6 h-6 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-foreground truncate">{formatPatientName(patient)}</h3>
                      <p className="text-sm text-muted-foreground">{age} años</p>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Teléfono</span>
                      <span className="text-foreground">{patient.phone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total citas</span>
                      <span className="text-foreground font-medium">{count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Última cita</span>
                      <span className="text-foreground">{last}</span>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-border flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCreateStandaloneEncounter(patient.id);
                      }}
                      disabled={creatingEncounterPatientId === patient.id}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      {creatingEncounterPatientId === patient.id ? "Abriendo..." : "Abrir expediente"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Crear paciente"
        description="Este paciente se agregará a tu directorio para poder asignarle citas."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Nombre(s)"
              value={createForm.firstName}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, firstName: e.target.value }))}
            />
            <Input
              label="Apellido paterno"
              value={createForm.lastNamePaternal}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, lastNamePaternal: e.target.value }))}
            />
          </div>
          <Input
            label="Apellido materno (opcional)"
            value={createForm.lastNameMaternal}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, lastNameMaternal: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Teléfono"
              value={createForm.phone}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
            <Input
              label="Correo (opcional)"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <Input
            label="Fecha de nacimiento (opcional)"
            type="date"
            value={createForm.dateOfBirth}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
          />

          <Button
            fullWidth
            onClick={handleCreatePatient}
            disabled={creating || !createForm.firstName || !createForm.lastNamePaternal || !createForm.phone}
          >
            {creating ? "Creando..." : "Guardar paciente"}
          </Button>
        </div>
      </Modal>
    </DoctorLayout>
  );
}

