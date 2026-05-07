"use client";

import { Button } from "@/components/Button";

type Props = {
  open: boolean;
  onGrant: () => void;
  onDeny: () => void;
  onClose: () => void;
};

export function AiConsentModal({ open, onGrant, onDeny, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-w-md w-full rounded-lg bg-background border border-border shadow-lg p-5 space-y-4">
        <h2 className="text-lg font-semibold">Consentimiento del paciente</h2>
        <p className="text-sm text-muted-foreground">
          ¿El paciente autoriza el uso de un asistente de IA para apoyar la
          transcripción y redacción de la nota clínica? La grabación se procesa y
          se elimina después de generar la nota.
        </p>
        <p className="text-xs text-muted-foreground">
          Esta autorización queda registrada en la cita para trazabilidad.
        </p>
        <p className="text-xs text-foreground/80">
          El asistente de IA es de apoyo documental; no reemplaza la valoración médica.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-end">
          <Button variant="tertiary" onClick={onClose}>
            Preguntar después
          </Button>
          <Button variant="secondary" onClick={onDeny}>
            No autoriza
          </Button>
          <Button onClick={onGrant}>Sí, autorizó</Button>
        </div>
      </div>
    </div>
  );
}
