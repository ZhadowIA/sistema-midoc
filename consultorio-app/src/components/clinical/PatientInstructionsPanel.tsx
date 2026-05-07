"use client";

import { useState } from "react";
import { Sparkles, Copy, CheckCheck, AlertTriangle, Pill, Utensils, Activity, Calendar } from "lucide-react";
import { Button } from "@/components/Button";
import { AiClinicalDisclaimer } from "@/components/clinical/AiClinicalDisclaimer";
import { toast } from "sonner";

type PatientInstructions = {
  generalInstructions: string;
  medicationReminders: string[];
  activityRestrictions: string[];
  dietaryGuidance: string[];
  warningSignsToReturn: string[];
  followUpSuggestion?: string;
};

type Props = {
  encounterId: string;
  chiefComplaint: string;
  assessment: string;
  plan: string;
  disabled?: boolean;
};

function InstructionList({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
        {icon}
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-foreground">
            <span className="text-muted-foreground mt-0.5 shrink-0">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PatientInstructionsPanel({
  encounterId,
  chiefComplaint,
  assessment,
  plan,
  disabled = false,
}: Props) {
  const [instructions, setInstructions] = useState<PatientInstructions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canGenerate = chiefComplaint.trim().length > 0 && assessment.trim().length > 0;

  const generate = async () => {
    if (!canGenerate || loading || disabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clinical/admin/encounters/${encounterId}/patient-instructions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chiefComplaint, assessment, plan }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error al generar indicaciones");
      setInstructions((body as { instructions: PatientInstructions }).instructions);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!instructions) return;
    const text = buildPlainText(instructions);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Indicaciones copiadas al portapapeles");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-4">
      <AiClinicalDisclaimer />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Genera indicaciones en lenguaje simple para compartir con el paciente, basadas en la evaluación y el plan de tratamiento.
        </p>
        <Button
          onClick={generate}
          disabled={!canGenerate || disabled}
          loading={loading}
          variant="secondary"
          size="sm"
        >
          <Sparkles className="w-4 h-4" />
          {instructions ? "Regenerar" : "Generar indicaciones"}
        </Button>
      </div>

      {!canGenerate && !instructions && (
        <p className="text-xs text-warning">
          Completa al menos el motivo de consulta y la evaluación clínica para generar las indicaciones.
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {instructions && (
        <div className="border border-border rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-secondary/20 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Indicaciones para el paciente</p>
            <Button variant="tertiary" size="sm" onClick={copyToClipboard}>
              {copied ? (
                <CheckCheck className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>

          <div className="px-4 py-4 space-y-4">
            {instructions.generalInstructions && (
              <p className="text-sm text-foreground leading-relaxed bg-primary/5 rounded-lg px-3 py-2 border border-primary/10">
                {instructions.generalInstructions}
              </p>
            )}

            <InstructionList
              icon={<Pill className="w-3.5 h-3.5" />}
              title="Medicamentos"
              items={instructions.medicationReminders}
            />

            <InstructionList
              icon={<Activity className="w-3.5 h-3.5" />}
              title="Actividad"
              items={instructions.activityRestrictions}
            />

            <InstructionList
              icon={<Utensils className="w-3.5 h-3.5" />}
              title="Alimentación"
              items={instructions.dietaryGuidance}
            />

            {instructions.warningSignsToReturn.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive uppercase tracking-wide mb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Señales de alarma — regresar de inmediato
                </p>
                <ul className="space-y-1">
                  {instructions.warningSignsToReturn.map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-foreground">
                      <span className="text-destructive mt-0.5 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {instructions.followUpSuggestion && (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Próxima visita
                </p>
                <p className="text-sm text-foreground">{instructions.followUpSuggestion}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function buildPlainText(i: PatientInstructions): string {
  const lines: string[] = ["=== INDICACIONES PARA EL PACIENTE ===", "", i.generalInstructions];

  if (i.medicationReminders.length > 0) {
    lines.push("", "MEDICAMENTOS:");
    i.medicationReminders.forEach((m) => lines.push(`• ${m}`));
  }
  if (i.activityRestrictions.length > 0) {
    lines.push("", "ACTIVIDAD:");
    i.activityRestrictions.forEach((a) => lines.push(`• ${a}`));
  }
  if (i.dietaryGuidance.length > 0) {
    lines.push("", "ALIMENTACIÓN:");
    i.dietaryGuidance.forEach((d) => lines.push(`• ${d}`));
  }
  if (i.warningSignsToReturn.length > 0) {
    lines.push("", "⚠ REGRESA DE INMEDIATO SI:");
    i.warningSignsToReturn.forEach((w) => lines.push(`• ${w}`));
  }
  if (i.followUpSuggestion) {
    lines.push("", `PRÓXIMA VISITA: ${i.followUpSuggestion}`);
  }

  return lines.join("\n");
}
