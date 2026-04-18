"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Card, CardContent } from "@/components/Card";
import { PatientClinicalAlerts } from "./PatientClinicalAlerts";
import { CompletionMeter } from "./CompletionMeter";
import { SectionAccordion } from "./SectionAccordion";
import {
  ConsultationModeSelector,
  type ConsultationMode,
} from "./ConsultationModeSelector";
import { AiConsentModal } from "./AiConsentModal";
import {
  ChiefComplaintSection,
  PresentIllnessSection,
  PertinentNegativesSection,
  ReviewOfSystemsSection,
  VitalsSection,
  PhysicalExamSection,
  AssessmentSection,
  DiagnosticPlanSection,
  TreatmentPlanSection,
  FollowUpSection,
  ENCOUNTER_SECTION_TITLES,
  type SectionProps,
} from "./EncounterSections";
import {
  calculateEncounterCompletionPct,
  calculateSectionCompletions,
  type EncounterSectionKey,
} from "@/lib/clinicalFormat";
import type { EncounterHistoryPayload } from "@/lib/encounterHistorySchema";

type ConsentState = "PENDING" | "GRANTED" | "DENIED";

type ContextResponse = {
  appointment: {
    id: string;
    patientId: string;
    patient: { id: string; fullName: string };
    questionnaireAnswered: boolean;
  };
  encounter: {
    id: string | null;
    appointmentId: string;
    payload: EncounterHistoryPayload;
    completionPct: number;
    prefilledFromQuestionnaire: boolean;
  };
  capabilities: { aiAvailable: boolean };
};

type Props = { appointmentId: string };

const MODE_KEY = (id: string) => `consulta:mode:${id}`;
const CONSENT_KEY = (id: string) => `consulta:consent:${id}`;

const SECTIONS: Array<{
  key: EncounterSectionKey;
  Component: (p: SectionProps) => React.ReactElement;
}> = [
  { key: "chiefComplaint", Component: ChiefComplaintSection },
  { key: "presentIllness", Component: PresentIllnessSection },
  { key: "pertinentNegatives", Component: PertinentNegativesSection },
  { key: "reviewOfSystems", Component: ReviewOfSystemsSection },
  { key: "vitals", Component: VitalsSection },
  { key: "physicalExam", Component: PhysicalExamSection },
  { key: "assessment", Component: AssessmentSection },
  { key: "diagnosticPlan", Component: DiagnosticPlanSection },
  { key: "treatmentPlan", Component: TreatmentPlanSection },
  { key: "followUp", Component: FollowUpSection },
];

const AUTOSAVE_DELAY_MS = 2_500;

export function ConsultationWorkspace({ appointmentId }: Props) {
  const [ctx, setCtx] = useState<ContextResponse | null>(null);
  const [payload, setPayload] = useState<EncounterHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ConsultationMode>("MANUAL");
  const [consent, setConsent] = useState<ConsentState>("PENDING");
  const [consentOpen, setConsentOpen] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedOnceRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const storedMode = localStorage.getItem(MODE_KEY(appointmentId));
    if (storedMode === "MANUAL" || storedMode === "AI_DICTATION" || storedMode === "HYBRID") {
      setMode(storedMode);
    }
    const storedConsent = localStorage.getItem(CONSENT_KEY(appointmentId));
    if (storedConsent === "GRANTED" || storedConsent === "DENIED") {
      setConsent(storedConsent);
    }
  }, [appointmentId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/appointments/${appointmentId}/consultation-context`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar");
      const body = (await res.json()) as ContextResponse;
      setCtx(body);
      setPayload(body.encounter.payload);
      savedOnceRef.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const savePayload = useCallback(
    async (next: EncounterHistoryPayload) => {
      setSaveState("saving");
      const res = await fetch(
        `/api/admin/appointments/${appointmentId}/encounter-history`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveState("error");
        toast.error(body.error ?? "No se pudo guardar");
        return;
      }
      setSaveState("saved");
    },
    [appointmentId],
  );

  useEffect(() => {
    if (!payload) return;
    if (!savedOnceRef.current) {
      savedOnceRef.current = true;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveState("idle");
    timerRef.current = setTimeout(() => {
      savePayload(payload);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [payload, savePayload]);

  const update = useCallback(
    <K extends keyof EncounterHistoryPayload>(
      key: K,
      value: EncounterHistoryPayload[K],
    ) => {
      setPayload((p) => (p ? { ...p, [key]: value } : p));
    },
    [],
  );

  const handleModeChange = (next: ConsultationMode) => {
    if (next !== "MANUAL" && consent !== "GRANTED") {
      setConsentOpen(true);
      return;
    }
    setMode(next);
    localStorage.setItem(MODE_KEY(appointmentId), next);
  };

  const handleConsent = (decision: "GRANTED" | "DENIED") => {
    setConsent(decision);
    localStorage.setItem(CONSENT_KEY(appointmentId), decision);
    setConsentOpen(false);
    if (decision === "DENIED") {
      setMode("MANUAL");
      localStorage.setItem(MODE_KEY(appointmentId), "MANUAL");
      toast.info("Modo forzado a Manual: paciente no autorizó IA");
    }
  };

  const handlePrefill = async () => {
    setPrefilling(true);
    try {
      const res = await fetch(
        `/api/admin/appointments/${appointmentId}/encounter-history/prefill`,
        { method: "POST", credentials: "include" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo prellenar");
        return;
      }
      toast.success("Prefill aplicado");
      await load();
    } finally {
      setPrefilling(false);
    }
  };

  const completionPct = payload ? calculateEncounterCompletionPct(payload) : 0;
  const sectionPcts = useMemo(
    () => (payload ? calculateSectionCompletions(payload) : null),
    [payload],
  );

  const saveLabel = useMemo(() => {
    switch (saveState) {
      case "saving":
        return "Guardando...";
      case "saved":
        return "Guardado";
      case "error":
        return "Error al guardar";
      default:
        return "Cambios sin guardar";
    }
  }, [saveState]);

  return (
    <div className="space-y-4">
      <AiConsentModal
        open={consentOpen}
        onClose={() => setConsentOpen(false)}
        onGrant={() => handleConsent("GRANTED")}
        onDeny={() => handleConsent("DENIED")}
      />

      {loading && <p className="text-muted-foreground">Cargando consulta...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {ctx && payload && (
        <>
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Paciente</p>
                  <p className="font-semibold text-lg">
                    {ctx.appointment.patient.fullName}
                  </p>
                </div>
                <CompletionMeter pct={completionPct} className="min-w-[180px]" />
              </div>
              <PatientClinicalAlerts patientId={ctx.appointment.patientId} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Modo de captura</p>
                <div className="flex items-center gap-3">
                  <span
                    className={[
                      "text-xs",
                      saveState === "error"
                        ? "text-red-600"
                        : saveState === "saved"
                          ? "text-emerald-600"
                          : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {saveLabel}
                  </span>
                  {ctx.appointment.questionnaireAnswered && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handlePrefill}
                      loading={prefilling}
                    >
                      <Wand2 className="w-4 h-4" /> Prefill
                    </Button>
                  )}
                </div>
              </div>
              <ConsultationModeSelector
                value={mode}
                onChange={handleModeChange}
                aiAvailable={ctx.capabilities.aiAvailable}
              />
              {!ctx.capabilities.aiAvailable && (
                <p className="text-xs text-muted-foreground">
                  Los modos con IA no están disponibles en este plan o entorno.
                  El modo Manual cubre toda la funcionalidad clínica.
                </p>
              )}
              {consent === "DENIED" && (
                <p className="text-xs text-amber-600">
                  El paciente no autorizó el uso de IA en esta consulta.
                </p>
              )}
            </CardContent>
          </Card>

          {SECTIONS.map(({ key, Component }, idx) => {
            const pct = sectionPcts?.[key] ?? 0;
            return (
              <SectionAccordion
                key={key}
                title={ENCOUNTER_SECTION_TITLES[key]}
                defaultOpen={idx < 2}
                badge={
                  <span
                    className={[
                      "text-xs rounded-full px-2 py-0.5",
                      pct >= 100
                        ? "bg-emerald-100 text-emerald-700"
                        : pct > 0
                          ? "bg-amber-100 text-amber-700"
                          : "bg-secondary/50 text-muted-foreground",
                    ].join(" ")}
                  >
                    {pct}%
                  </span>
                }
              >
                <Component payload={payload} update={update} />
              </SectionAccordion>
            );
          })}

          <SectionAccordion title="Nota SOAP y receta">
            <p className="text-sm text-muted-foreground">
              La nota SOAP y la receta siguen gestionándose en la pantalla
              clásica. Próxima iteración: integración nativa aquí.
            </p>
            <div className="mt-3">
              <a
                href={`/medico/citas/${appointmentId}`}
                className="text-sm text-primary underline"
              >
                Ir a la cita (nota SOAP y receta) →
              </a>
            </div>
          </SectionAccordion>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              onClick={() => payload && savePayload(payload)}
              loading={saveState === "saving"}
              variant="secondary"
            >
              Guardar ahora
            </Button>
            <Button disabled title="Firma se añadirá con la nota SOAP integrada">
              Firmar y cerrar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
