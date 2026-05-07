"use client";

import { useSpecialtyPayload } from "@/components/clinical/useSpecialtyPayload";
import { SpecialtyShell } from "@/components/clinical/SpecialtyShell";
import { SectionAccordion } from "@/components/clinical/SectionAccordion";
import {
  EMPTY_OPHTHALMOLOGY_PAYLOAD,
  type OphthalmologyPayload,
} from "@/lib/specialtyPayloadSchemas";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SNELLEN_OPTIONS = ["","20/20","20/25","20/32","20/40","20/50","20/63","20/80","20/100","20/125","20/160","20/200","CD","MM","PL","NPL"];
const IOP_NORMAL_MAX = 21; // mmHg

function iopColor(val: number | undefined): string {
  if (val === undefined) return "";
  if (val > IOP_NORMAL_MAX) return "border-destructive/50 text-destructive";
  return "border-success/40 text-success";
}

// ─── Visual Acuity panel ──────────────────────────────────────────────────────

function EyeBlock({ eye, label, data, update, disabled }: {
  eye: "od" | "oi";
  label: string;
  data: OphthalmologyPayload;
  update: (d: OphthalmologyPayload) => void;
  disabled: boolean;
}) {
  const va = data.visualAcuity;
  const entry = va[eye] ?? {};
  const set = (patch: Partial<typeof entry>) =>
    update({ ...data, visualAcuity: { ...va, [eye]: { ...entry, ...patch } } });

  return (
    <div className="border border-border rounded-md p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {(["sc","cc","ph"] as const).map((field) => (
        <div key={field}>
          <label className="text-xs text-muted-foreground block mb-1">
            {field === "sc" ? "Sin corrección (SC)" : field === "cc" ? "Con corrección (CC)" : "Pinhole (PH)"}
          </label>
          <select value={entry[field] ?? ""} disabled={disabled}
            onChange={(e) => set({ [field]: e.target.value || undefined })}
            className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50">
            {SNELLEN_OPTIONS.map((o) => <option key={o} value={o}>{o || "— Seleccionar —"}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function VisualAcuityPanel({
  data, update, disabled,
}: { data: OphthalmologyPayload; update: (d: OphthalmologyPayload) => void; disabled: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <EyeBlock eye="od" label="OD — Ojo Derecho" data={data} update={update} disabled={disabled} />
      <EyeBlock eye="oi" label="OI — Ojo Izquierdo" data={data} update={update} disabled={disabled} />
    </div>
  );
}

// ─── Refraction panel ─────────────────────────────────────────────────────────

function RefractionEyeRow({ eye, label, data, update, disabled }: {
  eye: "od" | "oi";
  label: string;
  data: OphthalmologyPayload;
  update: (d: OphthalmologyPayload) => void;
  disabled: boolean;
}) {
  const ref = data.refraction;
  const entry = ref[eye] ?? {};
  const set = (patch: Partial<typeof entry>) =>
    update({ ...data, refraction: { ...ref, [eye]: { ...entry, ...patch } } });

  return (
    <div className="border border-border rounded-md p-4">
      <p className="text-sm font-semibold text-foreground mb-3">{label}</p>
      <div className="grid grid-cols-4 gap-2">
        {(["sphere","cylinder","axis","add"] as const).map((field) => (
          <div key={field}>
            <label className="text-[10px] text-muted-foreground block mb-1 capitalize">
              {field === "sphere" ? "Esf." : field === "cylinder" ? "Cil." : field === "axis" ? "Eje (°)" : "Adición"}
            </label>
            <input type="number" step={field === "axis" ? 1 : 0.25}
              value={(entry[field] as number) ?? ""}
              disabled={disabled}
              onChange={(e) => set({ [field]: e.target.value ? Number(e.target.value) : undefined })}
              className="w-full text-sm text-center border border-border rounded px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              placeholder={field === "axis" ? "0–180" : "±0.00"} />
          </div>
        ))}
      </div>
    </div>
  );
}

function RefractionPanel({
  data, update, disabled,
}: { data: OphthalmologyPayload; update: (d: OphthalmologyPayload) => void; disabled: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <RefractionEyeRow eye="od" label="OD — Ojo Derecho" data={data} update={update} disabled={disabled} />
      <RefractionEyeRow eye="oi" label="OI — Ojo Izquierdo" data={data} update={update} disabled={disabled} />
    </div>
  );
}

// ─── IOP panel ────────────────────────────────────────────────────────────────

function IopPanel({
  data, update, disabled,
}: { data: OphthalmologyPayload; update: (d: OphthalmologyPayload) => void; disabled: boolean }) {
  const iop = data.intraocularPressure;
  const set = (patch: Partial<typeof iop>) =>
    update({ ...data, intraocularPressure: { ...iop, ...patch } });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {(["od","oi"] as const).map((eye) => (
        <div key={eye}>
          <label className="text-xs text-muted-foreground block mb-1">PIO {eye.toUpperCase()} (mmHg)</label>
          <input type="number" min={0} max={80} value={(iop[eye] as number) ?? ""} disabled={disabled}
            onChange={(e) => set({ [eye]: e.target.value ? Number(e.target.value) : undefined })}
            className={`w-full text-sm text-center border-2 rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 font-semibold ${iopColor(iop[eye])}`}
            placeholder="—" />
          {(iop[eye] ?? 0) > IOP_NORMAL_MAX && (
            <p className="text-xs text-destructive mt-0.5">↑ Elevada</p>
          )}
        </div>
      ))}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Método</label>
        <input type="text" value={iop.method ?? ""} disabled={disabled}
          onChange={(e) => set({ method: e.target.value || undefined })}
          className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          placeholder="Goldmann, no-contact…" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Hora</label>
        <input type="time" value={iop.time ?? ""} disabled={disabled}
          onChange={(e) => set({ time: e.target.value || undefined })}
          className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50" />
      </div>
    </div>
  );
}

// ─── Segment findings ─────────────────────────────────────────────────────────

function SegmentPanel({
  field,
  placeholder,
  data,
  update,
  disabled,
}: {
  field: "anteriorSegment" | "posteriorSegment";
  placeholder: { od: string; oi: string };
  data: OphthalmologyPayload;
  update: (d: OphthalmologyPayload) => void;
  disabled: boolean;
}) {
  const seg = data[field];
  const set = (eye: "od" | "oi", val: string) =>
    update({ ...data, [field]: { ...seg, [eye]: val || undefined } });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {(["od","oi"] as const).map((eye) => (
        <div key={eye}>
          <label className="text-xs text-muted-foreground block mb-1">{eye.toUpperCase()} — {eye === "od" ? "Ojo Derecho" : "Ojo Izquierdo"}</label>
          <textarea rows={3} value={seg[eye] ?? ""} disabled={disabled}
            onChange={(e) => set(eye, e.target.value)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
            placeholder={placeholder[eye]} />
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function OphthalmologySection({ encounterId, disabled = false }: { encounterId: string; disabled?: boolean }) {
  const { data, loaded, saveState, update } = useSpecialtyPayload<OphthalmologyPayload>(
    encounterId, "OPHTHALMOLOGY", EMPTY_OPHTHALMOLOGY_PAYLOAD,
  );

  const iopOd = data.intraocularPressure.od;
  const iopOi = data.intraocularPressure.oi;
  const iopAlert = (iopOd && iopOd > IOP_NORMAL_MAX) || (iopOi && iopOi > IOP_NORMAL_MAX);

  return (
    <SpecialtyShell label="Módulo Oftalmología" saveState={saveState} loaded={loaded}>
      {iopAlert && (
        <div className="p-3 bg-destructive/10 border border-destructive/40 rounded-md text-sm text-destructive font-semibold">
          ⚠ PIO elevada — Verificar glaucoma
        </div>
      )}

      <SectionAccordion title="Agudeza visual" defaultOpen>
        <VisualAcuityPanel data={data} update={update} disabled={disabled} />
      </SectionAccordion>

      <SectionAccordion title="Refracción">
        <RefractionPanel data={data} update={update} disabled={disabled} />
      </SectionAccordion>

      <SectionAccordion title="Presión intraocular (PIO)"
        badge={iopAlert ? <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">Elevada</span> : undefined}>
        <IopPanel data={data} update={update} disabled={disabled} />
      </SectionAccordion>

      <SectionAccordion title="Segmento anterior">
        <SegmentPanel field="anteriorSegment"
          placeholder={{ od: "Córnea transparente, cámara anterior formada, cristalino claro…", oi: "Córnea transparente, cámara anterior formada, cristalino claro…" }}
          data={data} update={update} disabled={disabled} />
      </SectionAccordion>

      <SectionAccordion title="Fondo de ojo / Segmento posterior">
        <SegmentPanel field="posteriorSegment"
          placeholder={{ od: "Papila rosada, excavación 0.3, mácula centrada sin alteraciones, retina aplicada…", oi: "Papila rosada, excavación 0.3, mácula centrada sin alteraciones, retina aplicada…" }}
          data={data} update={update} disabled={disabled} />
      </SectionAccordion>

      <SectionAccordion title="Otros hallazgos">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Campo visual</label>
            <textarea rows={2} value={data.visualField ?? ""} disabled={disabled}
              onChange={(e) => update({ ...data, visualField: e.target.value || undefined })}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
              placeholder="Campimetría — hallazgos…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Visión de colores</label>
            <input type="text" value={data.colorVision ?? ""} disabled={disabled}
              onChange={(e) => update({ ...data, colorVision: e.target.value || undefined })}
              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              placeholder="Normal / Ishihara 14/14…" />
          </div>
        </div>
      </SectionAccordion>
    </SpecialtyShell>
  );
}
