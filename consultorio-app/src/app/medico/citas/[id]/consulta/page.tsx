import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DoctorLayout } from "@/components/DoctorLayout";
import { ConsultationWorkspace } from "@/components/clinical/ConsultationWorkspace";
import prisma from "@/lib/prisma";

export default async function ConsultaPage(
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    select: { id: true, doctorId: true, patientId: true, clinicId: true },
  });
  let encounter =
    appointment
      ? await prisma.clinicalEncounter.findFirst({
          where: { appointmentId: id },
          select: { id: true },
        })
      : null;

  if (!encounter && appointment) {
    encounter = await prisma.clinicalEncounter.create({
      data: {
        doctorId: appointment.doctorId,
        patientId: appointment.patientId,
        clinicId: appointment.clinicId,
        appointmentId: appointment.id,
        source: "APPOINTMENT",
      },
      select: { id: true },
    });
  }

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
            Modo consulta unificado
          </span>
        </div>
        {encounter ? (
          <ConsultationWorkspace encounterId={encounter.id} />
        ) : (
          <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            Esta cita todavía no tiene un encounter clínico vinculado.
          </div>
        )}
      </div>
    </DoctorLayout>
  );
}
