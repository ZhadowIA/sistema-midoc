"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OdontogramCanvas } from "./OdontogramCanvas";
import { PeriodontogramGrid } from "./PeriodontogramGrid";
import { DentalTreatmentPlan } from "./DentalTreatmentPlan";
import { MouthConditionsPanel } from "./MouthConditionsPanel";
import { SectionAccordion } from "@/components/clinical/SectionAccordion";
import {
  DentalSpecialtyPayloadSchema,
  EMPTY_DENTAL_PAYLOAD,
  type DentalSpecialtyPayload,
} from "@/lib/specialtyPayloadSchemas";

// ─── Hook: load & autosave ─────────────────────────────────────────────────────

function useDentalPayload(encounterId: string) {
  const [data, setData] = useState<DentalSpecialtyPayload>(EMPTY_DENTAL_PAYLOAD);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<DentalSpecialtyPayload>(EMPTY_DENTAL_PAYLOAD);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/clinical/admin/encounters/${encounterId}/specialty-payload`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.specialtyPayload?.specialty === "DENTISTRY") {
          const parsed = DentalSpecialtyPayloadSchema.safeParse(json.specialtyPayload.data);
          if (parsed.success) {
            setData(parsed.data);
            latestRef.current = parsed.data;
          }
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [encounterId]);

  const save = useCallback(async (payload: DentalSpecialtyPayload) => {
    setSaveState("saving");
    try {
      const res = await fetch(
        `/api/clinical/admin/encounters/${encounterId}/specialty-payload`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ specialty: "DENTISTRY", data: payload }),
        },
      );
      if (!res.ok) throw new Error("Error al guardar");
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      toast.error("No se pudo guardar el odontograma");
    }
  }, [encounterId]);

  const update = useCallback((next: DentalSpecialtyPayload) => {
    setData(next);
    latestRef.current = next;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(latestRef.current), 2500);
  }, [save]);

  // Flush on unmount
  useEffect(() => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      void save(latestRef.current);
    }
  }, [save]);

  return { data, loaded, saveState, update };
}

// ─── Save indicator ───────────────────────────────────────────────────────────

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null;
  return (
    <span className={`text-xs ${
      state === "saving" ? "text-muted-foreground animate-pulse"
      : state === "saved" ? "text-success"
      : "text-destructive"
    }`}>
      {state === "saving" ? "Guardando…" : state === "saved" ? "Guardado" : "Error al guardar"}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  encounterId: string;
  disabled?: boolean;
};

export function DentalSpecialtySection({ encounterId, disabled = false }: Props) {
  const { data, loaded, saveState, update } = useDentalPayload(encounterId);

  const [sections, setSections] = useState({
    odontogram:     true,
    mouth:          true,
    periodontogram: false,
    treatment:      true,
  });

  const toggle = (k: keyof typeof sections) =>
    setSections((s) => ({ ...s, [k]: !s[k] }));

  if (!loaded) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground animate-pulse">
        Cargando datos odontológicos…
      </div>
    );
  }

  const pendingTx = data.treatmentPlan.filter((i) => i.status !== "COMPLETED").length;
  const activeMouthConditions = data.mouthConditions.filter((item) => !item.resolved).length;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Módulo odontológico
        </p>
        <SaveIndicator state={saveState} />
      </div>

      {/* Odontogram */}
      <SectionAccordion
        title="Odontograma"
        open={sections.odontogram}
        onOpenChange={() => toggle("odontogram")}
        badge={
          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">
            {Object.values(data.odontogram).filter((t) => t.status !== "HEALTHY").length} hallazgos
          </span>
        }
      >
        <OdontogramCanvas
          odontogram={data.odontogram}
          onChange={(odontogram) => update({ ...data, odontogram })}
          disabled={disabled}
        />
      </SectionAccordion>

      {/* Mouth-wide conditions */}
      <SectionAccordion
        title="Padecimientos generales"
        open={sections.mouth}
        onOpenChange={() => toggle("mouth")}
        badge={
          activeMouthConditions > 0 ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning">
              {activeMouthConditions} activo{activeMouthConditions !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">
              {data.mouthConditions.length} registrados
            </span>
          )
        }
      >
        <MouthConditionsPanel
          payload={data}
          onChange={update}
          disabled={disabled}
        />
      </SectionAccordion>

      {/* Periodontogram */}
      <SectionAccordion
        title="Periodontograma"
        open={sections.periodontogram}
        onOpenChange={() => toggle("periodontogram")}
        badge={
          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">
            {Object.keys(data.periodontogram).length} piezas registradas
          </span>
        }
      >
        <PeriodontogramGrid
          periodontogram={data.periodontogram}
          onChange={(periodontogram) => update({ ...data, periodontogram })}
          disabled={disabled}
        />
      </SectionAccordion>

      {/* Treatment plan */}
      <SectionAccordion
        title="Plan de tratamiento"
        open={sections.treatment}
        onOpenChange={() => toggle("treatment")}
        badge={
          pendingTx > 0 ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning">
              {pendingTx} pendiente{pendingTx !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">
              {data.treatmentPlan.length} procedimientos
            </span>
          )
        }
      >
        <DentalTreatmentPlan
          treatmentPlan={data.treatmentPlan}
          hygienePlan={data.hygienePlan}
          nextRevision={data.nextRevision}
          onChange={(treatmentPlan, hygienePlan, nextRevision) =>
            update({ ...data, treatmentPlan, hygienePlan, nextRevision })
          }
          disabled={disabled}
        />
      </SectionAccordion>
    </div>
  );
}
