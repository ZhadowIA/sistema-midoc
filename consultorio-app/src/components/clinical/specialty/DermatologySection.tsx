"use client";

import { useSpecialtyPayload } from "@/components/clinical/useSpecialtyPayload";
import { SpecialtyShell } from "@/components/clinical/SpecialtyShell";
import { SectionAccordion } from "@/components/clinical/SectionAccordion";
import { LesionMapCanvas } from "@/components/clinical/specialty/LesionMapCanvas";
import {
  EMPTY_DERMATOLOGY_PAYLOAD,
  type DermatologyPayload,
} from "@/lib/specialtyPayloadSchemas";

export function DermatologySection({ encounterId, disabled = false }: { encounterId: string; disabled?: boolean }) {
  const { data, loaded, saveState, update } = useSpecialtyPayload<DermatologyPayload>(
    encounterId, "DERMATOLOGY", EMPTY_DERMATOLOGY_PAYLOAD,
  );

  return (
    <SpecialtyShell label="Módulo Dermatología" saveState={saveState} loaded={loaded}>
      <SectionAccordion title="Mapa de lesiones" defaultOpen
        badge={data.lesions.length > 0
          ? <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">{data.lesions.length} lesión{data.lesions.length !== 1 ? "es" : ""}</span>
          : undefined}>
        <LesionMapCanvas
          lesions={data.lesions}
          onChange={(lesions) => update({ ...data, lesions })}
          disabled={disabled}
        />
      </SectionAccordion>

      <SectionAccordion title="Hallazgos dermatoscópicos">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">OD — Ojo Derecho / Dermatoscopía general</label>
            <textarea rows={3} value={data.dermoscopyFindings ?? ""} disabled={disabled}
              onChange={(e) => update({ ...data, dermoscopyFindings: e.target.value || undefined })}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
              placeholder="Patrón reticular, glóbulos, puntos pigmentados, estructuras vasculares…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Lesiones de alto índice de sospecha</label>
            <textarea rows={2} value={data.highSuspicionNotes ?? ""} disabled={disabled}
              onChange={(e) => update({ ...data, highSuspicionNotes: e.target.value || undefined })}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
              placeholder="Lesiones con criterios ABCDE positivos, indicación de biopsia…" />
          </div>
        </div>
      </SectionAccordion>

      <SectionAccordion title="Serie fotográfica y seguimiento">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Notas de serie fotográfica</label>
            <textarea rows={3} value={data.photoSeriesNotes ?? ""} disabled={disabled}
              onChange={(e) => update({ ...data, photoSeriesNotes: e.target.value || undefined })}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
              placeholder="Referencias de imágenes, cambios evolutivos respecto a consulta previa…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Plan de seguimiento</label>
            <textarea rows={2} value={data.followUpPlan ?? ""} disabled={disabled}
              onChange={(e) => update({ ...data, followUpPlan: e.target.value || undefined })}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
              placeholder="Control en 4 semanas, biopsia pendiente, referencia a dermatología especializada…" />
          </div>
        </div>
      </SectionAccordion>

      <SectionAccordion title="Notas generales">
        <textarea rows={4} value={data.generalNotes ?? ""} disabled={disabled}
          onChange={(e) => update({ ...data, generalNotes: e.target.value || undefined })}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
          placeholder="Historia dermatológica, antecedentes familiares, alergias cutáneas, tratamientos previos…" />
      </SectionAccordion>
    </SpecialtyShell>
  );
}
