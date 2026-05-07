"use client";

type Props = {
  className?: string;
};

export function AiClinicalDisclaimer({ className = "" }: Props) {
  return (
    <div
      className={`rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground ${className}`}
      role="note"
      aria-label="Aviso regulatorio de IA clínica"
    >
      <strong>Asistente clínico IA:</strong> genera sugerencias para apoyo documental.
      <span className="font-semibold"> NO emite diagnóstico autónomo</span> ni sustituye el criterio médico.
      La decisión final y la firma son responsabilidad del profesional de salud.
    </div>
  );
}

