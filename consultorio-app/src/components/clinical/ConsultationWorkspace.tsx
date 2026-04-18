"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Wand2, Save } from "lucide-react";
import { Button } from "@/components/Button";
import { Card, CardContent } from "@/components/Card";
import { PatientClinicalAlerts } from "./PatientClinicalAlerts";
import { EncounterHistoryForm } from "./EncounterHistoryForm";
import { CompletionMeter } from "./CompletionMeter";
import { SectionAccordion } from "./SectionAccordion";
import {
  ConsultationModeSelector,
  type ConsultationMode,
} from "./ConsultationModeSelector";
import { AiConsentModal } from "./AiConsentModal";
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

export function ConsultationWorkspace({ appointmentId }: Props) {
  const [ctx, setCtx] = useState<ContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ConsultationMode>("MANUAL");
  const [consent, setConsent] = useState<ConsentState>("PENDING");
  const [consentOpen, setConsentOpen] = useState(false);
  const [prefilling, setPrefilling] = useState(false);

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
      setCtx(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    load();
  }, [load]);

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

  const handleSaveEncounter = async (payload: EncounterHistoryPayload) => {
    const res = await fetch(
      `/api/admin/appointments/${appointmentId}/encounter-history`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "No se pudo guardar");
      return;
    }
    toast.success("Encuentro guardado");
    await load();
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

  const completionPct = ctx?.encounter.completionPct ?? 0;

  const modeBanner = useMemo(() => {
    if (mode === "MANUAL") return null;
    if (consent !== "GRANTED") return null;
    return (
      <Card>
        <CardContent className="p-3 text-sm flex items-center gap-2">
          <span>
            {mode === "AI_DICTATION"
              ? "Modo Dictado + IA activo — próximamente: grabar audio y generar nota."
              : "Modo Híbrido activo — próximamente: completar lo faltante con IA por sección."}
          </span>
        </CardContent>
      </Card>
    );
  }, [mode, consent]);

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

      {ctx && (
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
                {ctx.appointment.questionnaireAnswered && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePrefill}
                    loading={prefilling}
                  >
                    <Wand2 className="w-4 h-4" /> Prefill desde cuestionario
                  </Button>
                )}
              </div>
              <ConsultationModeSelector
                value={mode}
                onChange={handleModeChange}
                aiAvailable={ctx.capabilities.aiAvailable}
              />
              {!ctx.capabilities.aiAvailable && (
                <p className="text-xs text-muted-foreground">
                  Los modos con IA no están disponibles en este plan o entorno.
                  Puedes trabajar con el modo Manual sin ninguna pérdida de
                  funcionalidad clínica.
                </p>
              )}
              {consent === "DENIED" && (
                <p className="text-xs text-amber-600">
                  El paciente no autorizó el uso de IA en esta consulta.
                </p>
              )}
            </CardContent>
          </Card>

          {modeBanner}

          <SectionAccordion
            title="Encuentro clínico"
            defaultOpen
            badge={
              <span className="text-xs text-muted-foreground">
                {completionPct}% completo
              </span>
            }
          >
            <EncounterHistoryForm
              initial={ctx.encounter.payload}
              completionPct={completionPct}
              onSave={handleSaveEncounter}
            />
          </SectionAccordion>

          <SectionAccordion title="Nota SOAP y receta">
            <p className="text-sm text-muted-foreground">
              La nota SOAP y la receta siguen gestionándose en la pantalla de
              consulta clásica. En la siguiente iteración se integrarán aquí como
              secciones colapsables con autoguardado y firma.
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
            <Button variant="tertiary">
              <Save className="w-4 h-4" /> Guardar borrador
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
