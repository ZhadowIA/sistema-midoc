import Image from "next/image";
import { BadgeCheck, CalendarDays, MessageCircle, Phone } from "lucide-react";

type Doctor = {
  id: string;
  name: string;
  specialty: string;
  profileImage: string | null;
  phone: string | null;
  professionalLicense: string | null;
  normalConsultationPrice: number | null;
};

export function DoctorProfileHeader({ doctor }: { doctor: Doctor }) {
  const specialtyLabel = doctor.specialty
    ?.replace(/_/g, " ")
    .toLowerCase()
    .replace(/^/, (s) => s.toUpperCase());

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="bg-secondary/60 px-4 py-3 text-xs font-semibold text-muted-foreground sm:px-6">
        Perfil médico verificado
      </div>
      <div className="p-4 sm:p-6 md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex items-start gap-4 sm:block">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-secondary sm:h-32 sm:w-32">
            {doctor.profileImage ? (
              <Image
                src={doctor.profileImage}
                alt={doctor.name}
                width={160}
                height={160}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/10">
                <BadgeCheck className="h-10 w-10 text-primary/60" aria-hidden="true" />
              </div>
            )}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold leading-tight text-foreground sm:text-3xl">
                {doctor.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {specialtyLabel && (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                    {specialtyLabel}
                  </span>
                )}
                {doctor.professionalLicense && (
                  <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                    Cédula {doctor.professionalLicense}
                  </span>
                )}
              </div>
            </div>

            {doctor.normalConsultationPrice && (
              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-background p-3 sm:inline-grid sm:min-w-80">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Primera consulta</p>
                  <p className="mt-1 text-xl font-bold text-primary">
                    ${doctor.normalConsultationPrice.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Agenda</p>
                  <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-foreground">
                    <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
                    Horarios en línea
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-2 sm:flex sm:flex-wrap">
              {doctor.phone && (
                <a
                  href={`tel:${doctor.phone}`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Llamar
                </a>
              )}
              {doctor.phone && (
                <a
                  href={`https://wa.me/${doctor.phone.replace(/\D/g, "")}?text=Hola%2C%20me%20interesa%20agendar%20una%20consulta`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Escribir por WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
