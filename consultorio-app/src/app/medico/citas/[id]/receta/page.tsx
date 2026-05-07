"use client";

import { useEffect, useState, use } from "react";
import { CopyPlus } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { PatientClinicalAlerts } from "@/components/clinical/PatientClinicalAlerts";
import { formatPatientName } from "@/lib/patientName";

type PrescriptionItem = {
  medication: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
};

type PrescriptionNote = {
  prescriptions: PrescriptionItem[];
};

type PrescriptionAppointment = {
  startTime: string;
  patient: {
    id: string;
    firstName?: string | null;
    lastNamePaternal?: string | null;
    lastNameMaternal?: string | null;
    dateOfBirth: string;
  };
  doctor: {
    name: string;
    specialty?: string | null;
  };
};

type PrescriptionPageData = {
  appointment: PrescriptionAppointment;
  note: PrescriptionNote;
};

type DoctorProfile = {
  name: string;
  specialty?: string | null;
  professionalLicense?: string | null;
  clinicAddress?: string | null;
  logoImage?: string | null;
};

export default function PrescriptionPrintPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [data, setData] = useState<PrescriptionPageData | null>(null);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/clinical/admin/appointments/${params.id}`).then((res) => res.json()),
      fetch(`/api/clinical/admin/appointments/${params.id}/note`).then((res) => res.json()),
      fetch("/api/admin/profile").then((res) => res.json()),
    ])
      .then(([appointment, note, profile]) => {
        setData({ appointment, note });
        if (profile && !profile.error) {
          setDoctorProfile({
            name: profile.name,
            specialty: profile.specialty,
            professionalLicense: profile.professionalLicense,
            clinicAddress: profile.clinicAddress,
            logoImage: profile.logoImage,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="p-10 font-sans text-center">Cargando receta...</div>;
  if (!data?.note?.prescriptions || data.note.prescriptions.length === 0) {
    return <div className="p-10 font-sans text-center">No hay medicamentos prescritos en esta consulta.</div>;
  }

  const { appointment, note } = data;
  const doctor = {
    name: doctorProfile?.name || appointment.doctor.name,
    specialty: doctorProfile?.specialty || appointment.doctor.specialty,
    professionalLicense: doctorProfile?.professionalLicense || "",
    clinicAddress: doctorProfile?.clinicAddress || "",
    logoImage: doctorProfile?.logoImage || "",
  };
  const patient = appointment.patient;

  return (
    <div className="bg-white min-h-screen font-sans text-black">
      {/* Clinical alerts (screen only) */}
      <div className="print:hidden max-w-4xl mx-auto mt-4">
        <PatientClinicalAlerts patientId={patient.id} />
      </div>

      {/* Non-Printable Action Bar */}
      <div className="print:hidden bg-secondary border-b p-4 flex justify-between items-center max-w-4xl mx-auto mt-4 rounded-md shadow-sm">
        <p className="text-sm text-muted-foreground font-medium">Esta vista está optimizada para imprimirse en tamaño Carta (A4) o exportarse a PDF.</p>
        <button 
          onClick={() => window.print()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold shadow-sm hover:opacity-90"
        >
          Imprimir / Guardar PDF
        </button>
      </div>

      {/* Printable Area */}
      <div className="max-w-3xl mx-auto bg-white p-10 md:p-16 print:p-0 print:max-w-none">
        
        {/* Header - Letterhead */}
        <div className="flex items-center justify-between border-b-2 border-primary pb-6 mb-8">
            <div className="flex items-center gap-4">
              {doctor.logoImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={doctor.logoImage} alt="Logo del consultorio" className="w-24 h-20 object-contain rounded-md bg-white border border-gray-200 p-2" />
              ) : (
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
                <CopyPlus className="w-10 h-10 text-primary" />
              </div>
            )}
            <div>
               <h1 className="text-2xl font-bold uppercase tracking-wide text-primary">{doctor.name}</h1>
               <p className="text-gray-600 font-medium">{doctor.specialty || "Médico Especialista"}</p>
            </div>
          </div>
          <div className="text-right text-sm text-gray-500 space-y-1">
             <p>Ced. Profesional: {doctor.professionalLicense || "Pendiente"}</p>
             <p>Dir: {doctor.clinicAddress || "Consultorio principal"}</p>
             <p>{format(new Date(), "dd 'de' MMMM yyyy", { locale: es })}</p>
          </div>
        </div>

        {/* Patient Info Box */}
        <div className="bg-gray-50 rounded-md p-4 mb-8 grid grid-cols-2 gap-4 text-sm border">
          <div><span className="font-semibold text-gray-500">Paciente:</span> {formatPatientName(patient)}</div>
           <div><span className="font-semibold text-gray-500">Edad:</span> {new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()} años</div>
           <div><span className="font-semibold text-gray-500">Fecha de Consulta:</span> {format(new Date(appointment.startTime), "dd/MM/yyyy HH:mm")}</div>
           <div><span className="font-semibold text-gray-500">Peso / Talla:</span> __________________</div>
        </div>

        <div className="text-4xl font-serif text-primary opacity-30 mb-6 italic">
          Rx
        </div>

        {/* Prescriptions List */}
        <div className="space-y-8 min-h-[400px]">
          {note.prescriptions.map((p, index: number) => (
             <div key={index} className="pl-4">
                <div className="text-lg font-bold text-gray-800 break-words flex items-baseline gap-2">
                   <span>{index + 1}.</span>
                   {p.medication}
                </div>
                <div className="text-gray-600 mt-1 pl-5 space-y-0.5">
                   {p.dosage && <p><strong>Dosis:</strong> {p.dosage}</p>}
                   {p.frequency && <p><strong>Frecuencia:</strong> {p.frequency}</p>}
                   {p.duration && <p><strong>Duración:</strong> {p.duration}</p>}
                   {p.instructions && <p><strong>Indicaciones:</strong> {p.instructions}</p>}
                </div>
             </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-300 flex flex-col items-center text-center">
           <div className="w-64 border-b border-black mb-2 h-16"></div>
           <p className="font-bold text-gray-800">{doctor.name}</p>
           <p className="text-sm text-gray-500">Firma del Médico</p>
        </div>
      </div>
    </div>
  );
}



