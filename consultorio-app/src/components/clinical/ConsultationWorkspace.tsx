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
import {
  ConsultationModeSelector,
  type ConsultationMode,
} from "./ConsultationModeSelector";
import { AiConsentModal } from "./AiConsentModal";
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
import type { EncounterHistoryPayload } from "@/lib/encounterHistorySchema";

type ConsentState = "PENDING" | "GRANTED" | "DENIED";

type ContextResponse = {
  appointment: {
    id: string;
    patientId: string;
    patient: { id: string; fullName: string; phone?: string | null };
    questionnaireAnswered: boolean;
  };
  encounter: {
    record: {
      id: string | null;
      appointmentId: string;
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
  capabilities: { aiAvailable: boolean };
};

type Props = { appointmentId: string };

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
  const clinicalNote = useClinicalNote(appointmentId);
  const [closing, setClosing] = useState(false);
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
        `/api/admin/appointments/${appointmentId}/consultation-context`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar");
      const body = (await res.json()) as ContextResponse;
      setCtx(body);
      setPayload(body.encounter.record.payload);
      setMode(body.session.consultationMode);
      setConsent(body.session.aiConsent);
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
        `/api/admin/appointments/${appointmentId}/consultation-session`,
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
    [appointmentId, clinicalNote.isSigned],
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
      const res = await fetch(`/api/clinical/admin/appointments/${appointmentId}`, {
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
      toast.success("Consulta firmada y cerrada");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setClosing(false);
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

      {ctx && payload && clinicalNote.isSigned && clinicalNote.signedAt && (
        <SignoffSummary
          patientName={ctx.appointment.patient.fullName}
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
                    {ctx.appointment.patient.fullName}
                  </p>
                </div>
                <CompletionMeter pct={completionPct} className="min-w-[180px]" />
              </div>
              <PatientClinicalAlerts patientId={ctx.appointment.patientId} />
              {clinicalNote.isSigned && (
                <p className="text-xs rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-2">
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
                        ? "text-emerald-700"
                        : combinedSaveState === "error"
                          ? "text-red-600"
                          : combinedSaveState === "saved"
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
              {mode !== "MANUAL" && consent === "GRANTED" && ctx.capabilities.aiAvailable && (
                <>
                  <NarrationScript />
                  <DictationPanel
                    appointmentId={appointmentId}
                    disabled={clinicalNote.isSigned}
                    onSoapGenerated={clinicalNote.applySoapPartial}
                    onEncounterGenerated={mergeEncounterFromAi}
                  />
                </>
              )}
              {consent === "DENIED" && (
                <p className="text-xs text-amber-600">
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

          <SectionAccordion
            title="Nota SOAP"
            badge={
              <span
                className={[
                  "text-xs rounded-full px-2 py-0.5",
                  clinicalNote.soapCompletion >= 100
                    ? "bg-emerald-100 text-emerald-700"
                    : clinicalNote.soapCompletion > 0
                      ? "bg-amber-100 text-amber-700"
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

          {ctx.capabilities.aiAvailable && consent === "GRANTED" && (
            <SectionAccordion title="Sugerencias IA">
              <AiInsightsPanel
                appointmentId={appointmentId}
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
            <p className="text-xs text-amber-700 text-right">
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
