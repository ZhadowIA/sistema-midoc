type Doctor = {
  bio: string;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number;
  }>;
};

export function DoctorInfo({ doctor }: { doctor: Doctor }) {
  return (
    <div className="space-y-4">
      {doctor.bio && (
        <section className="rounded-3xl border border-border bg-card p-4 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold text-foreground">Información</h2>
          </div>
          <p className="max-w-prose whitespace-pre-wrap text-sm leading-7 text-foreground sm:text-base">{doctor.bio}</p>
        </section>
      )}

      {doctor.services.length > 0 && (
        <section className="rounded-3xl border border-border bg-card p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold text-foreground">Servicios</h2>
          </div>
          <div className="divide-y divide-border">
            {doctor.services.map((service) => (
              <div key={service.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground sm:text-base">{service.name}</h3>
                    {service.description && (
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{service.description}</p>
                    )}
                  </div>
                  <p className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                    ${service.price.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
import { FileText, Stethoscope } from "lucide-react";
