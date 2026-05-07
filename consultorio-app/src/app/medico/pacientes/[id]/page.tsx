"use client";

import { useState, useEffect, use, useCallback } from "react";
import { DoctorLayout } from "@/components/DoctorLayout";
import { ArrowLeft, User, HeartPulse, Activity, AlertTriangle, FileText, Save, Clock, Link2, UserCheck, Copy, Stethoscope } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/Card";
import { Button } from "@/components/Button";
import { TextArea } from "@/components/TextArea";
import { Input } from "@/components/Input";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/Badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatPatientName } from "@/lib/patientName";

type MedicalRecordData = {
  bloodType: string | null;
  allergies: string | null;
  chronicConditions: string | null;
  familyHistory: string | null;
};

type TimelineSoap = {
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
};

type TimelineEntry = {
  id: string;
  status: string;
  source: string;
  appointmentType: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  questionnaireAnswered: boolean;
  questionnaireAnsweredAt: string | null;
  hasClinicalNote: boolean;
  soap: TimelineSoap | null;
  soapCompletion: {
    completedSections: number;
    totalSections: number;
    pct: number;
  };
  notificationSummary: {
    total: number;
    sent: number;
    failed: number;
    pending: number;
  };
};

type PatientSummary = {
  totalAppointments: number;
  completedAppointments: number;
  appointmentsWithSoap: number;
  questionnairesAnswered: number;
};

type PatientDetail = {
  id: string;
  firstName?: string | null;
  lastNamePaternal?: string | null;
  lastNameMaternal?: string | null;
  phone: string;
  dateOfBirth: string;
  email?: string | null;
  userId?: string | null;
  linkedAccount?: {
    id: string;
    name: string;
    email: string;
  } | null;
  medicalRecord: MedicalRecordData | null;
  timeline: TimelineEntry[];
  summary: PatientSummary;
};

type MergeCandidate = {
  id: string;
  firstName?: string | null;
  lastNamePaternal?: string | null;
  lastNameMaternal?: string | null;
  phone: string;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  RESCHEDULED: "Reagendada",
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-700 border border-amber-400/30",
  CONFIRMED: "bg-blue-500/15 text-blue-700 border border-blue-400/30",
  COMPLETED: "bg-emerald-500/15 text-emerald-700 border border-emerald-400/30",
  CANCELLED: "bg-red-500/15 text-red-700 border border-red-400/30",
  RESCHEDULED: "bg-purple-500/15 text-purple-700 border border-purple-400/30",
};

function calculateAge(dateOfBirth: string): number | null {
  const date = new Date(dateOfBirth);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const birthdayPassed =
    today.getMonth() > date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() >= date.getDate());
  if (!birthdayPassed) age -= 1;
  return age >= 0 ? age : null;
}

function truncateText(value: string | null | undefined, maxLength = 180): string {
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

export default function PatientProfilePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRecord, setSavingRecord] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkingAccount, setLinkingAccount] = useState(false);
  const [copyingInvite, setCopyingInvite] = useState(false);
  const [creatingStandaloneEncounter, setCreatingStandaloneEncounter] = useState(false);
  
  // Merge state
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [selectedMergeId, setSelectedMergeId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  
  // Expediente state editable
  const [record, setRecord] = useState({
    bloodType: "",
    allergies: "",
    chronicConditions: "",
    familyHistory: ""
  });

  const loadPatientDetail = useCallback(async () => {
    const res = await fetch(`/api/clinical/admin/patients/${params.id}`);
    const data = await res.json() as { error?: string } & Partial<PatientDetail>;
    if (data.error || !data.id || !Array.isArray(data.timeline) || !data.summary) return;

    const typedPatient = data as PatientDetail;
    setPatient(typedPatient);
    setLinkEmail(typedPatient.linkedAccount?.email || typedPatient.email || "");
    if (typedPatient.medicalRecord) {
      setRecord({
        bloodType: typedPatient.medicalRecord.bloodType || "",
        allergies: typedPatient.medicalRecord.allergies || "",
        chronicConditions: typedPatient.medicalRecord.chronicConditions || "",
        familyHistory: typedPatient.medicalRecord.familyHistory || ""
      });
    }
  }, [params.id]);

  useEffect(() => {
    loadPatientDetail()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [loadPatientDetail]);

  const handleSaveRecord = async () => {
    setSavingRecord(true);
    try {
      const res = await fetch(`/api/clinical/admin/patients/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record)
      });
      if (!res.ok) throw new Error("Error guardando el expediente");
      toast.success("Expediente clínico actualizado exitosamente.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setSavingRecord(false);
    }
  };

  const handleLinkAccount = async () => {
    const email = linkEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Ingresa un correo para vincular.");
      return;
    }

    setLinkingAccount(true);
    try {
      const res = await fetch(`/api/clinical/admin/patients/${params.id}/link-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo vincular la cuenta");

      await loadPatientDetail();
      toast.success("Cuenta vinculada correctamente.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado al vincular cuenta";
      toast.error(message);
    } finally {
      setLinkingAccount(false);
    }
  };

  const handleCopyInvite = async () => {
    const email = linkEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Primero captura un correo para generar la invitación.");
      return;
    }

    setCopyingInvite(true);
    try {
      const inviteUrl = `${window.location.origin}/agendar?auth=register&inviteEmail=${encodeURIComponent(email)}`;
      const message =
        `Hola ${patient ? formatPatientName(patient) : "paciente"}, para vincular tu cuenta con tu expediente médico ` +
        `regístrate o inicia sesión con este correo (${email}) en: ${inviteUrl}`;
      await navigator.clipboard.writeText(message);
      toast.success("Invitación copiada. Ya puedes enviarla al paciente.");
    } catch {
      toast.error("No fue posible copiar la invitación.");
    } finally {
      setCopyingInvite(false);
    }
  };

  const handleOpenStandaloneEncounter = async () => {
    setCreatingStandaloneEncounter(true);
    try {
      // Reuse existing open standalone encounter if one exists
      const existing = await fetch(`/api/clinical/admin/encounters?patientId=${params.id}&status=OPEN`);
      const existingData = await existing.json() as { encounters?: { id: string; source: string }[] };
      const openStandalone = existingData.encounters?.find(e => e.source === "STANDALONE");
      if (openStandalone) {
        router.push(`/medico/expedientes/encounters/${openStandalone.id}`);
        return;
      }

      const res = await fetch("/api/clinical/admin/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: params.id,
          source: "STANDALONE",
        }),
      });
      const data = await res.json() as { error?: string; encounter?: { id: string } };
      if (!res.ok || !data.encounter?.id) {
        throw new Error(data.error || "No se pudo abrir el expediente standalone");
      }

      router.push(`/medico/expedientes/encounters/${data.encounter.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado al abrir expediente";
      toast.error(message);
    } finally {
      setCreatingStandaloneEncounter(false);
    }
  };

  useEffect(() => {
     if (mergeSearch.length > 2) {
       fetch("/api/clinical/admin/patients")
         .then(res => res.json())
         .then((data: unknown) => {
            const candidates = Array.isArray(data) ? data as MergeCandidate[] : [];
            const filtered = candidates.filter((p) => 
               p.id !== params.id && 
              formatPatientName(p).toLowerCase().includes(mergeSearch.toLowerCase())
            );
            setMergeCandidates(filtered);
         });
     } else {
       setMergeCandidates([]);
     }
  }, [mergeSearch, params.id]);

  const handleMerge = async () => {
     if (!selectedMergeId) return;
     
     setMerging(true);
     try {
       const res = await fetch("/api/clinical/admin/patients/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            primaryPatientId: params.id,
            secondaryPatientId: selectedMergeId
          })
       });
       const data = await res.json() as {
         error?: string;
         message?: string;
         primaryPatientId?: string;
         mergeReason?: "requested_primary" | "account_priority";
       };
       if (!res.ok) throw new Error(data.error || "Error al fusionar pacientes");

       if (!data.primaryPatientId) throw new Error("Respuesta inválida de fusión");
       setMergeModalOpen(false);
       setMergeSearch("");
       setSelectedMergeId(null);

       if (data.mergeReason === "account_priority") {
         toast.success("Fusión completada: se priorizó el expediente con cuenta vinculada.");
       } else {
         toast.success(data.message || "Pacientes unificados correctamente.");
       }

       router.push(`/medico/pacientes/${data.primaryPatientId}`);
     } catch (err: unknown) {
       const message = err instanceof Error ? err.message : "Error inesperado al fusionar pacientes";
       toast.error(message);
     } finally {
       setMerging(false);
     }
  };

  if (loading) return <DoctorLayout><div className="p-8 text-center text-muted-foreground">Cargando expediente...</div></DoctorLayout>;
  if (!patient) return <DoctorLayout><div className="p-8 text-center text-destructive">Paciente no encontrado o no autorizado.</div></DoctorLayout>;
  const patientAge = calculateAge(patient.dateOfBirth);

  return (
    <DoctorLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <button
          onClick={() => router.push('/medico/pacientes')}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Volver a Directorio</span>
        </button>

        {/* Top Header Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="bg-primary text-primary-foreground rounded-3xl p-8 relative overflow-hidden shadow-lg">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm border border-white/30 shrink-0">
                  <User className="w-10 h-10 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">{formatPatientName(patient)}</h1>
                  <p className="text-primary-foreground/80 mt-1 flex items-center gap-4">
                    <span>{patientAge !== null ? `${patientAge} años` : "Edad no disponible"}</span>
                    <span className="w-1 h-1 bg-white/50 rounded-full" />
                    <span>{patient.phone}</span>
                  </p>
                </div>
              </div>
              
                <div className="flex flex-wrap gap-2 md:justify-end items-center">
                <Button
                  size="sm"
                  className="bg-white/20 hover:bg-white/30 text-white border-none mt-2 md:mt-0"
                  onClick={handleOpenStandaloneEncounter}
                  disabled={creatingStandaloneEncounter}
                >
                  <Stethoscope className="w-4 h-4 mr-2" />
                  {creatingStandaloneEncounter ? "Abriendo..." : "Nuevo encounter"}
                </Button>
                <Dialog open={mergeModalOpen} onOpenChange={setMergeModalOpen}>
                  <DialogTrigger asChild>
                    <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-none mt-2 md:mt-0">
                      Fusionar Expediente
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="text-foreground max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Fusionar Paciente</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <p className="text-sm text-muted-foreground">Busca al paciente secundario y selecciónalo. El paciente secundario será eliminado y todos sus registros (citas, notas y cuestionarios) pasarán al expediente principal. Si uno de los dos tiene cuenta vinculada, esa cuenta tendrá prioridad.</p>
                      <input 
                        type="text" 
                        placeholder="Buscar paciente por nombre..." 
                        className="w-full px-4 py-2 bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
                        value={mergeSearch}
                        onChange={(e) => setMergeSearch(e.target.value)}
                      />
                      {mergeCandidates.length > 0 && (
                        <div className="max-h-60 overflow-y-auto border border-border rounded-lg mt-2">
                          {mergeCandidates.map(c => (
                            <div 
                              key={c.id} 
                              onClick={() => setSelectedMergeId(c.id)}
                              className={`p-3 border-b border-border/50 cursor-pointer transition-colors ${selectedMergeId === c.id ? 'bg-primary/10 border-primary' : 'hover:bg-secondary/30'}`}
                            >
                              <div className="font-semibold">{formatPatientName(c)}</div>
                              <div className="text-xs text-muted-foreground">{c.phone}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button fullWidth onClick={handleMerge} disabled={!selectedMergeId || merging}>
                        {merging ? "Fusionando..." : "Confirmar Fusión"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {record.allergies && (
                  <Badge variant="destructive" className="bg-red-500 hover:bg-red-600 border-none px-3 py-1 text-sm font-semibold mt-2 md:mt-0">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                    Alérgico
                  </Badge>
                )}
                {record.bloodType && (
                  <Badge className="bg-white/20 hover:bg-white/30 text-white border-none px-3 py-1 text-sm mt-2 md:mt-0">
                    {record.bloodType}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Columna Izquierda: Ficha Maestra ECE */}
          <div className="lg:col-span-5 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <HeartPulse className="w-5 h-5 text-primary" />
                  Expediente Maestro
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => router.push(`/medico/pacientes/${params.id}/historia-clinica`)}
                  >
                    Historia clínica
                  </Button>
                  <Button size="sm" onClick={handleSaveRecord} disabled={savingRecord}>
                    {savingRecord ? "..." : <Save className="w-4 h-4" />}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input 
                  label="Tipo de Sangre" 
                  placeholder="Ej. O+, A-, etc."
                  value={record.bloodType}
                  onChange={e => setRecord({...record, bloodType: e.target.value})}
                />
                <TextArea 
                  label="Alergias Importantes" 
                  placeholder="Medicamentos, alimentos, etc."
                  value={record.allergies}
                  onChange={e => setRecord({...record, allergies: e.target.value})}
                  rows={2}
                />
                <TextArea 
                  label="Enfermedades Crónicas" 
                  placeholder="Diabetes, Hipertensión, etc."
                  value={record.chronicConditions}
                  onChange={e => setRecord({...record, chronicConditions: e.target.value})}
                  rows={2}
                />
                <TextArea 
                  label="Antecedentes Familiares" 
                  placeholder="Madre con cáncer, Padre diabético..."
                  value={record.familyHistory}
                  onChange={e => setRecord({...record, familyHistory: e.target.value})}
                  rows={2}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-primary" />
                  Cuenta del Paciente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {patient.linkedAccount ? (
                  <div className="rounded-md border border-border bg-secondary/20 p-4">
                    <p className="text-sm text-muted-foreground mb-1">Cuenta vinculada</p>
                    <p className="font-semibold text-foreground flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-success" />
                      {patient.linkedAccount.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{patient.linkedAccount.email}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Este expediente no está vinculado a una cuenta. Vincúlalo por correo para que el paciente vea su historial al iniciar sesión.
                  </p>
                )}

                <Input
                  label="Correo de cuenta del paciente"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleLinkAccount} disabled={linkingAccount}>
                    {linkingAccount ? "Vinculando..." : "Vincular por correo"}
                  </Button>
                  <Button variant="secondary" onClick={handleCopyInvite} disabled={copyingInvite}>
                    <Copy className="w-4 h-4 mr-2" />
                    {copyingInvite ? "Copiando..." : "Copiar invitación"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Columna Derecha: Historial de Consultas */}
          <div className="lg:col-span-7">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-foreground">
              <Activity className="w-5 h-5 text-primary" />
              Historial Clínico Consolidado
            </h2>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Citas registradas</p>
                  <p className="text-2xl font-semibold">{patient.summary.totalAppointments}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Citas completadas</p>
                  <p className="text-2xl font-semibold">{patient.summary.completedAppointments}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Notas SOAP</p>
                  <p className="text-2xl font-semibold">{patient.summary.appointmentsWithSoap}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Cuestionarios respondidos</p>
                  <p className="text-2xl font-semibold">{patient.summary.questionnairesAnswered}</p>
                </CardContent>
              </Card>
            </div>

            {patient.timeline.length > 0 ? (
              <div className="relative border-l-2 border-border ml-3 space-y-8 pb-4">
                {patient.timeline.map((apt) => {
                  const statusLabel = STATUS_LABELS[apt.status] || apt.status;
                  const statusClass = STATUS_CLASSES[apt.status] || "bg-secondary text-foreground";
                  const soapSections = [
                    { key: "S", label: "Subjetivo (S)", value: apt.soap?.subjective || "" },
                    { key: "O", label: "Objetivo (O)", value: apt.soap?.objective || "" },
                    { key: "A", label: "Análisis / Diagnóstico (A)", value: apt.soap?.assessment || "" },
                    { key: "P", label: "Plan (P)", value: apt.soap?.plan || "" },
                  ] as const;

                  return (
                    <div key={apt.id} className="relative pl-6">
                      <div className="absolute w-4 h-4 bg-primary rounded-full -left-[9px] top-1 border-4 border-background" />
                      
                      <Card className="hover:border-primary/50 transition-colors">
                        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 bg-secondary/10">
                          <div>
                            <div className="flex items-center gap-2 text-foreground font-semibold">
                              {format(new Date(apt.startTime), "EEEE dd 'de' MMMM, yyyy", { locale: es })}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1 capitalize flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              {format(new Date(apt.startTime), "HH:mm", { locale: es })} · {apt.durationMin} min ·{" "}
                              {apt.appointmentType.toLowerCase()}
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              <Badge className={`text-xs ${statusClass}`}>{statusLabel}</Badge>
                              <Badge variant="muted" className="text-xs">
                                {apt.source === "PATIENT" ? "Agendada por paciente" : "Agendada por médico"}
                              </Badge>
                              <Badge variant="muted" className="text-xs">
                                {apt.questionnaireAnswered ? "Cuestionario respondido" : "Cuestionario pendiente"}
                              </Badge>
                            </div>
                          </div>
                          
                          <Button 
                            variant={apt.hasClinicalNote ? "secondary" : "primary"} 
                            size="sm"
                            onClick={() => router.push(`/medico/citas/${apt.id}`)}
                          >
                            {apt.hasClinicalNote ? (
                              <><FileText className="w-4 h-4 mr-2" /> Ver Nota Clínica</>
                            ) : (
                              "Redactar Nota"
                            )}
                          </Button>
                        </div>

                        <div className="p-5 space-y-4">
                          <div className="grid sm:grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg border border-border p-3 bg-secondary/10">
                              <p className="text-xs text-muted-foreground mb-1">Cuestionario</p>
                              <p className="font-medium">
                                {apt.questionnaireAnswered ? "Respondido" : "No respondido"}
                              </p>
                              {apt.questionnaireAnsweredAt && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {format(new Date(apt.questionnaireAnsweredAt), "dd/MM/yyyy HH:mm", { locale: es })}
                                </p>
                              )}
                            </div>
                            <div className="rounded-lg border border-border p-3 bg-secondary/10">
                              <p className="text-xs text-muted-foreground mb-1">Notificaciones</p>
                              <p className="font-medium">
                                {apt.notificationSummary.sent} enviadas · {apt.notificationSummary.failed} fallidas ·{" "}
                                {apt.notificationSummary.pending} pendientes
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Total registradas: {apt.notificationSummary.total}
                              </p>
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                              <span>Completitud SOAP</span>
                              <span>
                                {apt.soapCompletion.completedSections}/{apt.soapCompletion.totalSections} secciones (
                                {apt.soapCompletion.pct}%)
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-secondary overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${apt.soapCompletion.pct}%` }}
                              />
                            </div>
                          </div>

                          {apt.hasClinicalNote ? (
                            <div className="grid gap-3">
                              {soapSections.map((section) => (
                                <div key={section.key} className="rounded-lg border border-border p-3">
                                  <p className="text-xs font-semibold text-foreground mb-1">{section.label}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {truncateText(section.value) || "Sin registro en esta sección."}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground italic bg-secondary/10 rounded-lg border border-border p-3">
                              Cita sin evolución redactada. Redacta la nota para consolidar el historial SOAP.
                            </div>
                          )}
                        </div>
                      </Card>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-card border border-border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                El paciente no tiene consultas finalizadas reportadas en el historial.
              </div>
            )}
          </div>
        </div>
      </div>
    </DoctorLayout>
  );
}

