"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Card, CardContent } from "@/components/Card";
import { PatientClinicalAlerts } from "./PatientClinicalAlerts";
import { CompletionMeter } from "./CompletionMeter";
import { SectionAccordion } from "./SectionAccordion";
import { SoapSection } from "./SoapSection";
import { PrescriptionsSection } from "./PrescriptionsSection";
import { useClinicalNote } from "./useClinicalNote";
import { DictationPanel } from "./DictationPanel";
import { NarrationScript } from "./NarrationScript";
import { AiInsightsPanel } from "./AiInsightsPanel";
import { ClinicalGapsPanel } from "./ClinicalGapsPanel";
import { LongitudinalSummaryPanel } from "./LongitudinalSummaryPanel";
import { PatientInstructionsPanel } from "./PatientInstructionsPanel";
import {
  ConsultationModeSelector,
  type ConsultationMode,
} from "./ConsultationModeSelector";
import { AiConsentModal } from "./AiConsentModal";
import { CobrarModal } from "@/components/agenda/CobrarModal";
import { SignoffSummary } from "./SignoffSummary";
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
  hasMinimumForSignoff,
  buildSignoffBlockedMessage,
  evaluateSignoffButtonState,
  type EncounterSectionKey,
} from "@/lib/clinicalFormat";
import { resolveWorkspaceShortcut } from "@/lib/consultationWorkspace";
import { formatPatientName } from "@/lib/patientName";
import type { EncounterHistoryPayload } from "@/lib/encounterHistorySchema";
import { resolveSpecialtyTemplate, type SpecialtyTemplate } from "@/lib/specialtyTemplates";
import type { MedicalSpecialty } from "@prisma/client";
import dynamic from "next/dynamic";

const DentalSpecialtySection = dynamic(
  () => import("./dental/DentalSpecialtySection").then((m) => m.DentalSpecialtySection),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground animate-pulse py-4 text-center">Cargando módulo odontológico…</p> },
);

const FamilyMedicineSection = dynamic(
  () => import("./specialty/FamilyMedicineSection").then((m) => m.FamilyMedicineSection),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground animate-pulse py-4 text-center">Cargando módulo medicina familiar…</p> },
);

const PediatricsSection = dynamic(
  () => import("./specialty/PediatricsSection").then((m) => m.PediatricsSection),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground animate-pulse py-4 text-center">Cargando módulo pediatría…</p> },
);

const GynecologySection = dynamic(
  () => import("./specialty/GynecologySection").then((m) => m.GynecologySection),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground animate-pulse py-4 text-center">Cargando módulo ginecología…</p> },
);

const CardiologySection = dynamic(
  () => import("./specialty/CardiologySection").then((m) => m.CardiologySection),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground animate-pulse py-4 text-center">Cargando módulo cardiología…</p> },
);

const MentalHealthSection = dynamic(
  () => import("./specialty/MentalHealthSection").then((m) => m.MentalHealthSection),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground animate-pulse py-4 text-center">Cargando módulo salud mental…</p> },
);

const OphthalmologySection = dynamic(
  () => import("./specialty/OphthalmologySection").then((m) => m.OphthalmologySection),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground animate-pulse py-4 text-center">Cargando módulo oftalmología…</p> },
);

const DermatologySection = dynamic(
  () => import("./specialty/DermatologySection").then((m) => m.DermatologySection),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground animate-pulse py-4 text-center">Cargando módulo dermatología…</p> },
);

type ConsentState = "PENDING" | "GRANTED" | "DENIED";
type CapabilityReasonCode =
  | "ENABLED"
  | "CLINICAL_DISABLED_GLOBAL_FLAG"
  | "CLINICAL_DISABLED_PLAN"
  | "AI_DISABLED_NO_API_KEY"
  | "AI_DISABLED_PLAN"
  | "AI_DISABLED_NO_APPOINTMENT"
  | "AI_DISABLED_CLINICAL_NOT_ENABLED";

type ContextResponse = {
  encounter: {
    id: string;
    source: "APPOINTMENT" | "STANDALONE" | "MIGRATION";
    status: "OPEN" | "CLOSED" | "ARCHIVED";
    appointmentId: string | null;
  };
  appointment: {
    id: string | null;
    patientId: string;
    patient: {
      id: string;
      firstName?: string | null;
      lastNamePaternal?: string | null;
      lastNameMaternal?: string | null;
      phone?: string | null;
    };
    questionnaireAnswered: boolean;
  };
  encounterHistory: {
    record: {
      id: string | null;
      appointmentId: string | null;
      clinicalEncounterId?: string | null;
      payload: EncounterHistoryPayload;
      completionPct: number;
      prefilledFromQuestionnaire: boolean;
    };
    built: boolean;
  };
  session: {
    consultationMode: ConsultationMode;
    aiConsent: ConsentState;
    aiConsentDecidedAt: string | null;
  };
  capabilities: {
    aiAvailable: boolean;
    ai?: { enabled: boolean; reasonCode: CapabilityReasonCode };
    clinicalUnified?: { enabled: boolean; reasonCode: CapabilityReasonCode };
  };
  doctor: {
    specialty: string | null;
  };
};

type Props = { encounterId: string };

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

export function ConsultationWorkspace({ encounterId }: Props) {
  const [ctx, setCtx] = useState<ContextResponse | null>(null);
  const [template, setTemplate] = useState<SpecialtyTemplate | undefined>();
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
  const clinicalNote = useClinicalNote(encounterId);
  const [closing, setClosing] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const router = useRouter();
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    SECTIONS.forEach((s, i) => {
      init[s.key] = i < 2;
    });
    return init;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/clinical/admin/encounters/${encounterId}/context`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar");
      const body = (await res.json()) as ContextResponse;
      setCtx(body);
      setPayload(body.encounterHistory.record.payload);
      setMode(body.session.consultationMode);
      setConsent(body.session.aiConsent);
      setTemplate(resolveSpecialtyTemplate(body.doctor.specialty as MedicalSpecialty | null));
      savedOnceRef.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [encounterId]);

  useEffect(() => {
    load();
  }, [load]);

  const savePayload = useCallback(
    async (next: EncounterHistoryPayload) => {
      setSaveState("saving");
      const res = await fetch(
        `/api/clinical/admin/encounters/${encounterId}/encounter-history`,
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
    [encounterId],
  );

  useEffect(() => {
    if (!payload) return;
    if (clinicalNote.isSigned) return;
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
  }, [payload, savePayload, clinicalNote.isSigned]);

  const mergeEncounterFromAi = useCallback(
    (partial: Record<string, unknown>) => {
      if (!partial || typeof partial !== "object") return;
      setPayload((prev) => {
        if (!prev) return prev;
        const next: EncounterHistoryPayload = { ...prev };
        const isNonEmptyString = (v: unknown): v is string =>
          typeof v === "string" && v.trim().length > 0;
        const isNonEmptyArray = (v: unknown): v is unknown[] =>
          Array.isArray(v) && v.length > 0;
        const isPlainObject = (v: unknown): v is Record<string, unknown> =>
          typeof v === "object" && v !== null && !Array.isArray(v);

        if (isNonEmptyString(partial.chiefComplaint) && !prev.chiefComplaint.trim()) {
          next.chiefComplaint = partial.chiefComplaint;
        }
        if (isPlainObject(partial.presentIllness)) {
          next.presentIllness = { ...prev.presentIllness };
          for (const [k, v] of Object.entries(partial.presentIllness)) {
            const current = (prev.presentIllness as Record<string, unknown>)[k];
            const empty =
              current === undefined ||
              current === null ||
              (typeof current === "string" && !current.trim()) ||
              (Array.isArray(current) && current.length === 0);
            if (!empty) continue;
            if (isNonEmptyString(v) || isNonEmptyArray(v)) {
              (next.presentIllness as Record<string, unknown>)[k] = v;
            }
          }
        }
        if (isNonEmptyArray(partial.pertinentNegatives) && prev.pertinentNegatives.length === 0) {
          next.pertinentNegatives = partial.pertinentNegatives.filter(
            (x): x is string => typeof x === "string" && x.trim().length > 0,
          );
        }
        const mergeRecord = (key: keyof EncounterHistoryPayload) => {
          const incoming = partial[key as string];
          if (!isPlainObject(incoming)) return;
          const currentRec = prev[key] as Record<string, unknown>;
          const merged: Record<string, unknown> = { ...currentRec };
          for (const [k, v] of Object.entries(incoming)) {
            const cur = currentRec?.[k];
            const empty =
              cur === undefined || cur === null || (typeof cur === "string" && !cur.trim());
            if (empty && (isNonEmptyString(v) || typeof v === "number")) {
              merged[k] = typeof v === "number" ? String(v) : v;
            }
          }
          (next as Record<string, unknown>)[key as string] = merged;
        };
        mergeRecord("reviewOfSystems");
        mergeRecord("vitals");
        mergeRecord("physicalExam");
        mergeRecord("diagnosticPlan");
        mergeRecord("treatmentPlan");
        mergeRecord("followUp");
        if (isNonEmptyArray(partial.assessment) && prev.assessment.length === 0) {
          next.assessment = partial.assessment.filter(
            (a): a is { diagnosis: string } =>
              typeof a === "object" &&
              a !== null &&
              typeof (a as { diagnosis?: unknown }).diagnosis === "string" &&
              (a as { diagnosis: string }).diagnosis.trim().length > 0,
          ) as EncounterHistoryPayload["assessment"];
        }
        return next;
      });
    },
    [],
  );

  const update = useCallback(
    <K extends keyof EncounterHistoryPayload>(
      key: K,
      value: EncounterHistoryPayload[K],
    ) => {
      setPayload((p) => (p ? { ...p, [key]: value } : p));
    },
    [],
  );

  const persistSession = useCallback(
    async (patch: { consultationMode?: ConsultationMode; aiConsent?: ConsentState }) => {
      if (clinicalNote.isSigned) return;
      const res = await fetch(
        `/api/clinical/admin/encounters/${encounterId}/consultation-session`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "No se pudo guardar la preferencia");
      }
    },
    [encounterId, clinicalNote.isSigned],
  );

  const handleModeChange = (next: ConsultationMode) => {
    if (next !== "MANUAL" && consent !== "GRANTED") {
      setConsentOpen(true);
      return;
    }
    setMode(next);
    persistSession({ consultationMode: next });
  };

  const handleConsent = (decision: "GRANTED" | "DENIED") => {
    setConsent(decision);
    setConsentOpen(false);
    persistSession({ aiConsent: decision });
    if (decision === "DENIED") {
      setMode("MANUAL");
      persistSession({ consultationMode: "MANUAL" });
      toast.info("Modo forzado a Manual: paciente no autorizó IA");
    }
  };

  const signoffCheck = useMemo(
    () => (payload ? hasMinimumForSignoff(payload) : { ok: false, missing: [] }),
    [payload],
  );
  const signoffButton = useMemo(
    () =>
      evaluateSignoffButtonState({
        payload,
        isSigned: clinicalNote.isSigned,
        loaded: clinicalNote.loaded,
      }),
    [payload, clinicalNote.isSigned, clinicalNote.loaded],
  );

  const saveNow = useCallback(async () => {
    if (payload) await savePayload(payload);
    await clinicalNote.saveNow();
  }, [payload, savePayload, clinicalNote]);

  const handleSignAndClose = async () => {
    if (!payload) return;
    if (!signoffCheck.ok) {
      toast.error(buildSignoffBlockedMessage(signoffCheck.missing));
      return;
    }
    setClosing(true);
    try {
      await savePayload(payload);
      const result = await clinicalNote.sign();
      if (!result.ok) {
        const missingMsg = result.missing?.length
          ? ` Faltan: ${result.missing.join(", ")}`
          : "";
        toast.error(`${result.error}.${missingMsg}`);
        return;
      }
      if (ctx?.encounter.appointmentId) {
        const res = await fetch(`/api/clinical/admin/appointments/${ctx.encounter.appointmentId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toast.error(body.error ?? body.message ?? "No se pudo cerrar la consulta");
          return;
        }
        toast.success("Consulta firmada — registra el cobro para cerrar");
        setShowCheckoutModal(true);
      } else {
        toast.success("Encounter firmado");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setClosing(false);
    }
  };

  const handlePrefill = async () => {
    setPrefilling(true);
    try {
      if (!ctx?.encounter.appointmentId) {
        toast.error("El prefill desde cuestionario solo aplica a encounters vinculados a cita.");
        return;
      }
      const res = await fetch(
        `/api/admin/appointments/${ctx.encounter.appointmentId}/encounter-history/prefill`,
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

  const combinedSaveState = useMemo<
    "idle" | "saving" | "saved" | "error"
  >(() => {
    const states = [saveState, clinicalNote.saveState];
    if (states.includes("error")) return "error";
    if (states.includes("saving")) return "saving";
    if (states.every((s) => s === "saved")) return "saved";
    return "idle";
  }, [saveState, clinicalNote.saveState]);

  const handlersRef = useRef({
    saveNow,
    handleSignAndClose,
    canSign: signoffButton.canSign,
  });
  handlersRef.current = {
    saveNow,
    handleSignAndClose,
    canSign: signoffButton.canSign,
  };

  useEffect(() => {
    const sectionKeys = SECTIONS.map((s) => s.key);
    const focusSection = (delta: 1 | -1) => {
      const active = document.activeElement as HTMLElement | null;
      const currentId = active?.closest?.("[data-consultation-section]")?.getAttribute(
        "data-consultation-section",
      );
      const currentKey = currentId?.replace(/^section-/, "") ?? "";
      let idx = sectionKeys.indexOf(currentKey as EncounterSectionKey);
      if (idx === -1) idx = delta === 1 ? -1 : sectionKeys.length;
      const next = Math.max(0, Math.min(sectionKeys.length - 1, idx + delta));
      const nextKey = sectionKeys[next];
      setSectionOpen((m) => ({ ...m, [nextKey]: true }));
      const btn = document.getElementById(`section-${nextKey}`);
      if (btn) {
        btn.scrollIntoView({ block: "center", behavior: "smooth" });
        btn.focus();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const action = resolveWorkspaceShortcut({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        canSign: handlersRef.current.canSign,
      });
      if (action === "save") {
        e.preventDefault();
        void handlersRef.current.saveNow();
        return;
      }
      if (action === "sign") {
        e.preventDefault();
        void handlersRef.current.handleSignAndClose();
        return;
      }
      if (action === "next-section") {
        e.preventDefault();
        focusSection(1);
      } else if (action === "prev-section") {
        e.preventDefault();
        focusSection(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const saveLabel = useMemo(() => {
    if (clinicalNote.isSigned) return "Nota firmada";
    switch (combinedSaveState) {
      case "saving":
        return "Guardando...";
      case "saved":
        return "Todo guardado";
      case "error":
        return "Error al guardar";
      default:
        return "Cambios sin guardar";
    }
  }, [combinedSaveState, clinicalNote.isSigned]);

  const aiUnavailableReasonText = useMemo(() => {
    const reasonCode = ctx?.capabilities.ai?.reasonCode;
    switch (reasonCode) {
      case "AI_DISABLED_NO_API_KEY":
        return "Los modos con IA no están disponibles: falta configurar OPENAI_API_KEY en el entorno.";
      case "AI_DISABLED_PLAN":
        return "Los modos con IA no están incluidos en el plan actual del doctor.";
      case "AI_DISABLED_NO_APPOINTMENT":
        return "Los modos con IA requieren una consulta vinculada a cita (no aplica para encounter standalone).";
      case "AI_DISABLED_CLINICAL_NOT_ENABLED":
        return "Los modos con IA no están disponibles porque el módulo clínico no está habilitado.";
      default:
        return "Los modos con IA no están disponibles en este plan o entorno. El modo Manual cubre toda la funcionalidad clínica.";
    }
  }, [ctx?.capabilities.ai?.reasonCode]);

  return (
    <div className="space-y-4">
      <AiConsentModal
        open={consentOpen}
        onClose={() => setConsentOpen(false)}
        onGrant={() => handleConsent("GRANTED")}
        onDeny={() => handleConsent("DENIED")}
      />

      {/* Modal de cobro — aparece después de firmar la consulta */}
      {ctx?.encounter.appointmentId && (
        <CobrarModal
          open={showCheckoutModal}
          onOpenChange={(open) => {
            setShowCheckoutModal(open);
            if (!open) toast.info("Puedes registrar el cobro desde Caja cuando quieras.");
          }}
          appointmentId={ctx.encounter.appointmentId}
          defaultConcept={`Consulta — ${formatPatientName(ctx.appointment.patient)}`}
          onSuccess={() => setShowCheckoutModal(false)}
        />
      )}

      {loading && <p className="text-muted-foreground">Cargando consulta...</p>}
      {error && <p className="text-destructive">{error}</p>}

      {ctx && payload && clinicalNote.isSigned && clinicalNote.signedAt && (
        <SignoffSummary
          patientName={formatPatientName(ctx.appointment.patient)}
          patientPhone={ctx.appointment.patient.phone ?? null}
          signedAt={clinicalNote.signedAt}
          signatureHash={clinicalNote.signatureHash}
          chiefComplaint={payload.chiefComplaint}
          assessmentSummary={(payload.assessment ?? [])
            .map((a: { diagnosis?: string }) => a.diagnosis)
            .filter((d): d is string => Boolean(d))
            .join("\n")}
          onBackToAgenda={() => router.push("/medico/agenda")}
        />
      )}

      {ctx && payload && (
        <>
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Paciente</p>
                  <p className="font-semibold text-lg">
                    {formatPatientName(ctx.appointment.patient)}
                  </p>
                </div>
                <CompletionMeter pct={completionPct} className="min-w-[180px]" />
              </div>
              <PatientClinicalAlerts patientId={ctx.appointment.patientId} />
              <div className="pt-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Historial de consultas previas
                </p>
                <LongitudinalSummaryPanel encounterId={encounterId} />
              </div>
              {clinicalNote.isSigned && (
                <p className="text-xs rounded-md bg-success/10 text-success border border-success/30 px-3 py-2">
                  Nota firmada el{" "}
                  {clinicalNote.signedAt
                    ? new Date(clinicalNote.signedAt).toLocaleString()
                    : ""}
                  . La consulta está cerrada en modo solo lectura.
                </p>
              )}
            </CardContent>
          </Card>

          {!clinicalNote.isSigned && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Modo de captura</p>
                <div className="flex items-center gap-3">
                  <span
                    className={[
                      "text-xs",
                      clinicalNote.isSigned
                        ? "text-success"
                        : combinedSaveState === "error"
                          ? "text-destructive"
                          : combinedSaveState === "saved"
                            ? "text-success"
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
                  {aiUnavailableReasonText}
                </p>
              )}
              {mode !== "MANUAL" && consent === "GRANTED" && ctx.capabilities.aiAvailable && (
                <>
                  <NarrationScript />
                  <DictationPanel
                    encounterId={ctx.encounter.id}
                    disabled={clinicalNote.isSigned}
                    onSoapGenerated={clinicalNote.applySoapPartial}
                    onEncounterGenerated={mergeEncounterFromAi}
                  />
                </>
              )}
              {consent === "DENIED" && (
                <p className="text-xs text-warning">
                  El paciente no autorizó el uso de IA en esta consulta.
                </p>
              )}
            </CardContent>
          </Card>
          )}

          {SECTIONS.map(({ key, Component }) => {
            const pct = sectionPcts?.[key] ?? 0;
            return (
              <SectionAccordion
                key={key}
                id={`section-${key}`}
                title={ENCOUNTER_SECTION_TITLES[key]}
                open={sectionOpen[key] ?? false}
                onOpenChange={(next) =>
                  setSectionOpen((m) => ({ ...m, [key]: next }))
                }
                badge={
                  <span
                    className={[
                      "text-xs rounded-full px-2 py-0.5",
                      pct >= 100
                        ? "bg-success/15 text-success"
                        : pct > 0
                          ? "bg-warning/15 text-warning"
                          : "bg-secondary/50 text-muted-foreground",
                    ].join(" ")}
                  >
                    {pct}%
                  </span>
                }
              >
                <Component
                  payload={payload}
                  update={update}
                  disabled={clinicalNote.isSigned || closing}
                  template={template}
                />
              </SectionAccordion>
            );
          })}

          {/* ── Specialty-specific module ── */}
          {ctx.doctor.specialty === "DENTISTRY" && (
            <SectionAccordion title="Módulo odontológico" defaultOpen>
              <DentalSpecialtySection
                encounterId={ctx.encounter.id}
                disabled={clinicalNote.isSigned || closing}
              />
            </SectionAccordion>
          )}

          {ctx.doctor.specialty === "FAMILY_MEDICINE" && (
            <SectionAccordion title="Módulo medicina familiar" defaultOpen>
              <FamilyMedicineSection
                encounterId={ctx.encounter.id}
                disabled={clinicalNote.isSigned || closing}
              />
            </SectionAccordion>
          )}

          {ctx.doctor.specialty === "PEDIATRICS" && (
            <SectionAccordion title="Módulo pediatría" defaultOpen>
              <PediatricsSection
                encounterId={ctx.encounter.id}
                disabled={clinicalNote.isSigned || closing}
              />
            </SectionAccordion>
          )}

          {ctx.doctor.specialty === "GYNECOLOGY_OBSTETRICS" && (
            <SectionAccordion title="Módulo ginecología y obstetricia" defaultOpen>
              <GynecologySection
                encounterId={ctx.encounter.id}
                disabled={clinicalNote.isSigned || closing}
              />
            </SectionAccordion>
          )}

          {ctx.doctor.specialty === "CARDIOLOGY" && (
            <SectionAccordion title="Módulo cardiología" defaultOpen>
              <CardiologySection
                encounterId={ctx.encounter.id}
                disabled={clinicalNote.isSigned || closing}
              />
            </SectionAccordion>
          )}

          {ctx.doctor.specialty === "MENTAL_HEALTH" && (
            <SectionAccordion title="Módulo salud mental" defaultOpen>
              <MentalHealthSection
                encounterId={ctx.encounter.id}
                disabled={clinicalNote.isSigned || closing}
              />
            </SectionAccordion>
          )}

          {ctx.doctor.specialty === "OPHTHALMOLOGY" && (
            <SectionAccordion title="Módulo oftalmología" defaultOpen>
              <OphthalmologySection
                encounterId={ctx.encounter.id}
                disabled={clinicalNote.isSigned || closing}
              />
            </SectionAccordion>
          )}

          {ctx.doctor.specialty === "DERMATOLOGY" && (
            <SectionAccordion title="Módulo dermatología" defaultOpen>
              <DermatologySection
                encounterId={ctx.encounter.id}
                disabled={clinicalNote.isSigned || closing}
              />
            </SectionAccordion>
          )}

          <SectionAccordion
            title="Nota SOAP"
            badge={
              <span
                className={[
                  "text-xs rounded-full px-2 py-0.5",
                  clinicalNote.soapCompletion >= 100
                    ? "bg-success/15 text-success"
                    : clinicalNote.soapCompletion > 0
                      ? "bg-warning/15 text-warning"
                      : "bg-secondary/50 text-muted-foreground",
                ].join(" ")}
              >
                {clinicalNote.soapCompletion}%
              </span>
            }
          >
            {!clinicalNote.loaded ? (
              <p className="text-sm text-muted-foreground">Cargando nota...</p>
            ) : (
              <SoapSection
                note={clinicalNote.note}
                update={clinicalNote.update}
                disabled={clinicalNote.isSigned}
              />
            )}
          </SectionAccordion>

          {ctx.capabilities.aiAvailable && consent === "GRANTED" && ctx.encounter.appointmentId && (
            <SectionAccordion title="Sugerencias IA">
              <AiInsightsPanel
                appointmentId={ctx.encounter.appointmentId}
                soap={{
                  subjective: clinicalNote.note.subjective,
                  objective: clinicalNote.note.objective,
                  assessment: clinicalNote.note.assessment,
                  plan: clinicalNote.note.plan,
                }}
                disabled={clinicalNote.isSigned}
                onApplyDiagnosis={clinicalNote.appendToAssessment}
                onApplyTreatment={clinicalNote.appendToPlan}
              />
            </SectionAccordion>
          )}

          {ctx.capabilities.aiAvailable && consent === "GRANTED" && (
            <SectionAccordion title="Indicaciones para el paciente">
              <PatientInstructionsPanel
                encounterId={encounterId}
                chiefComplaint={payload.chiefComplaint ?? ""}
                assessment={clinicalNote.note.assessment ?? ""}
                plan={clinicalNote.note.plan ?? ""}
                disabled={clinicalNote.isSigned}
              />
            </SectionAccordion>
          )}

          <SectionAccordion title="Auditoría Clínica">
            <ClinicalGapsPanel
              patientId={ctx.appointment.patientId}
              encounterId={ctx.encounter.id}
              encounterPayload={payload}
              aiAvailable={ctx.capabilities.aiAvailable && consent === "GRANTED"}
            />
          </SectionAccordion>

          <SectionAccordion
            title="Receta"
            badge={
              <span className="text-xs rounded-full px-2 py-0.5 bg-secondary/50 text-muted-foreground">
                {clinicalNote.note.prescriptions.length}
              </span>
            }
          >
            {!clinicalNote.loaded ? (
              <p className="text-sm text-muted-foreground">Cargando receta...</p>
            ) : (
              <PrescriptionsSection
                prescriptions={clinicalNote.note.prescriptions}
                onAdd={clinicalNote.addPrescription}
                onUpdate={clinicalNote.updatePrescription}
                onRemove={clinicalNote.removePrescription}
                disabled={clinicalNote.isSigned}
              />
            )}
          </SectionAccordion>

          {!clinicalNote.isSigned && !signoffCheck.ok && (
            <p className="text-xs text-warning text-right">
              Para firmar faltan: {signoffCheck.missing.join(", ")}
            </p>
          )}
          {!clinicalNote.isSigned && (
          <div className="flex justify-end gap-2 pt-2">
            <Button
              onClick={saveNow}
              loading={combinedSaveState === "saving"}
              variant="secondary"
              disabled={clinicalNote.isSigned}
              title="Guardar ahora (Ctrl+S)"
            >
              Guardar ahora
            </Button>
            <Button
              onClick={handleSignAndClose}
              loading={closing}
              disabled={signoffButton.disabled}
              title={signoffButton.title}
            >
              {clinicalNote.isSigned ? "Consulta cerrada" : "Firmar y cerrar"}
            </Button>
          </div>
          )}
        </>
      )}
    </div>
  );
}
