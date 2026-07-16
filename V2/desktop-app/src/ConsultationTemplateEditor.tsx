import { useState } from "react";
import {
  buildTemplateSegments,
  type TemplateDefinition,
  type TemplateSegment
} from "./consultationScribe";
import type { ClinicalProfile } from "./clinicalProfiles";

export interface EditableConsultationTemplate extends TemplateDefinition {
  name: string;
  clinical_profile: ClinicalProfile;
}

interface Props {
  profile: ClinicalProfile;
  templates: EditableConsultationTemplate[];
  disabled: boolean;
  onSave(template: EditableConsultationTemplate): void;
  onDelete(id: string): void;
}

function newSegment(allowed: TemplateSegment[], index: number): TemplateSegment {
  const target = allowed[0]?.target ?? "subjective";
  return {
    id: `segment_${index + 1}`,
    label: "Nuevo segmento",
    target,
    instructions: "Extrae únicamente lo dicho durante la consulta.",
    required: false
  };
}

export function ConsultationTemplateEditor(props: Props) {
  const allowed = buildTemplateSegments(props.profile).segments;
  const [editing, setEditing] = useState<EditableConsultationTemplate | null>(null);

  function beginNew() {
    setEditing({
      id: `template-${crypto.randomUUID()}`,
      name: "Nueva plantilla",
      clinical_profile: props.profile,
      segments: [newSegment(allowed, 0)]
    });
  }

  function updateSegment(index: number, patch: Partial<TemplateSegment>) {
    setEditing((current) => current && ({
      ...current,
      segments: current.segments.map((segment, currentIndex) =>
        currentIndex === index ? { ...segment, ...patch } : segment
      )
    }));
  }

  if (!editing) {
    return (
      <details className="clinical-template-manager">
        <summary>Administrar plantillas personalizadas</summary>
        <div className="clinical-template-list">
          {props.templates.map((template) => (
            <div key={template.id} className="aid-background-row">
              <span>{template.name} · {template.segments.length} segmentos</span>
              <div className="button-row">
                <button className="ghost-button" onClick={() => setEditing(structuredClone(template))}>Editar</button>
                <button className="ghost-button danger-link" onClick={() => props.onDelete(template.id)}>Eliminar</button>
              </div>
            </div>
          ))}
          <button className="ghost-button" disabled={props.disabled} onClick={beginNew}>Nueva plantilla</button>
        </div>
      </details>
    );
  }

  return (
    <section className="clinical-template-editor" aria-label="Editor de plantilla clínica">
      <label className="field">
        <span>Nombre de la plantilla</span>
        <input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.currentTarget.value })} />
      </label>
      {editing.segments.map((segment, index) => (
        <fieldset key={`${segment.id}:${index}`} className="clinical-template-segment">
          <legend>Segmento {index + 1}</legend>
          <label className="field"><span>Identificador</span><input value={segment.id} onChange={(event) => updateSegment(index, { id: event.currentTarget.value })} /></label>
          <label className="field"><span>Etiqueta</span><input value={segment.label} onChange={(event) => updateSegment(index, { label: event.currentTarget.value })} /></label>
          <label className="field"><span>Destino</span><select value={segment.target} onChange={(event) => updateSegment(index, { target: event.currentTarget.value })}>{allowed.map((option) => <option key={option.target} value={option.target}>{option.label}</option>)}</select></label>
          <label className="field"><span>Instrucciones para IA</span><textarea value={segment.instructions} onChange={(event) => updateSegment(index, { instructions: event.currentTarget.value })} /></label>
          <label className="check-row"><input type="checkbox" checked={segment.required} onChange={(event) => updateSegment(index, { required: event.currentTarget.checked })} /> Obligatorio</label>
          {editing.segments.length > 1 ? <button className="ghost-button danger-link" onClick={() => setEditing({ ...editing, segments: editing.segments.filter((_, currentIndex) => currentIndex !== index) })}>Quitar segmento</button> : null}
        </fieldset>
      ))}
      <div className="button-row">
        <button className="ghost-button" onClick={() => setEditing({ ...editing, segments: [...editing.segments, newSegment(allowed, editing.segments.length)] })}>Agregar segmento</button>
        <button className="action-button" disabled={props.disabled || !editing.name.trim()} onClick={() => { props.onSave(editing); setEditing(null); }}>Guardar plantilla</button>
        <button className="ghost-button" onClick={() => setEditing(null)}>Cancelar</button>
      </div>
    </section>
  );
}
