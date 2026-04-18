import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DoctorLayout } from "@/components/DoctorLayout";
import { ConsultationWorkspace } from "@/components/clinical/ConsultationWorkspace";
import {
  isClinicalHistoryEnabled,
  isConsultaUnifiedEnabled,
} from "@/lib/featureFlags";

export default async function ConsultaV2Page(
  props: { params: Promise<{ id: string }> },
) {
  if (!isConsultaUnifiedEnabled() || !isClinicalHistoryEnabled()) {
    notFound();
  }
  const { id } = await props.params;

  return (
    <DoctorLayout>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href={`/medico/citas/${id}`}
            className="text-sm inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Volver al detalle de la cita
          </Link>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Modo consulta (beta)
          </span>
        </div>
        <ConsultationWorkspace appointmentId={id} />
      </div>
    </DoctorLayout>
  );
}
