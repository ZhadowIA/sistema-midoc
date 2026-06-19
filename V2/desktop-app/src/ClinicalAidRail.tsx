import { compatibilityLabel, type ClinicalAidDraft } from "./clinicalAid";
import type { SegmentDraft } from "./consultationScribe";

interface Props {
  ready: boolean;
  consent: boolean;
  hasHistory: boolean;
  hasPreconsulta: boolean;
  templates: Array<{ id: string; name: string }>;
  selectedTemplateId: string;
  busy: boolean;
  draft: ClinicalAidDraft | null;
  onToggleConsent(): void;
  onTemplateChange(id: string): void;
  onGenerate(): void;
  onApplySoap(): void;
  onApplySegment(segment: SegmentDraft): void;
  onDiscard(): void;
}

export function ClinicalAidRail(props: Props) {
  return (
    <section className="clinical-aid-launch" aria-label="Ayuda IA">
      <div className="panel-header">
        <h3>Ayuda IA</h3>
        <p>Genera propuestas clínicas para revisión del médico.</p>
      </div>
      <div className="clinical-aid-sources">
        <span className={props.ready ? "pill pill-success" : "pill pill-muted"}>
          Transcripción {props.ready ? "lista" : "pendiente"}
        </span>
        <span className={props.hasHistory ? "pill pill-success" : "pill pill-muted"}>
          Antecedentes
        </span>
        <span className={props.hasPreconsulta ? "pill pill-success" : "pill pill-muted"}>
          Preconsulta
        </span>
      </div>
      <button
        className="action-button"
        onClick={props.onGenerate}
        disabled={props.busy || !props.ready || !props.consent}
      >
        Generar ayuda clínica
      </button>
      <button className="ghost-button" onClick={props.onToggleConsent} disabled={props.busy}>
        {props.consent ? "Revocar Ayuda IA" : "Autorizar Ayuda IA"}
      </button>
      <label className="field">
        <span>Plantilla clínica</span>
        <select
          value={props.selectedTemplateId}
          disabled={props.busy}
          onChange={(event) => props.onTemplateChange(event.currentTarget.value)}
        >
          <option value="default">SOAP predeterminado</option>
          {props.templates.map((template) => (
            <option key={template.id} value={template.id}>{template.name}</option>
          ))}
        </select>
      </label>
      {!props.ready ? <p className="meta">Revisa la transcripción para habilitar esta acción.</p> : null}

      {props.draft ? (
        <div className="clinical-aid-results">
          <article className="clinical-aid-result">
            <strong>SOAP</strong>
            <p className="meta">{props.draft.soap.assessment || "Borrador disponible"}</p>
            <button className="ghost-button" onClick={props.onApplySoap}>Aplicar al editor</button>
          </article>
          {props.draft.template_segments.map((segment) => (
            <article className="clinical-aid-result" key={segment.segment_id}>
              <strong>{segment.segment_id}</strong>
              <p>{segment.content}</p>
              <button className="ghost-button" onClick={() => props.onApplySegment(segment)}>
                Aplicar segmento
              </button>
            </article>
          ))}
          <div className="clinical-aid-result">
            <strong>Posibilidades clínicas</strong>
            {props.draft.possibilities.map((item) => (
              <article key={item.title}>
                <div className="clinical-aid-heading">
                  <b>{item.title}</b>
                  <span className={`compatibility-${item.compatibility.toLowerCase()}`}>
                    Compatibilidad {compatibilityLabel(item.compatibility)}
                  </span>
                </div>
                <p>{item.explanation}</p>
                <p className="meta">A favor: {item.supporting_findings.join("; ") || "Sin datos"}</p>
                <p className="meta">No encaja: {item.conflicting_findings.join("; ") || "Sin datos"}</p>
                <p className="meta">Falta: {item.missing_data.join("; ") || "Sin faltantes"}</p>
              </article>
            ))}
          </div>
          <div className="clinical-aid-result">
            <strong>Estudios sugeridos</strong>
            {props.draft.studies.map((item) => <p key={item.name}><b>{item.name}:</b> {item.reason}</p>)}
          </div>
          <div className="clinical-aid-result">
            <strong>Opciones de tratamiento</strong>
            {props.draft.treatments.map((item) => <p key={item.name}><b>{item.name}:</b> {item.reason}</p>)}
          </div>
          <button className="ghost-button danger-link" onClick={props.onDiscard}>Descartar ayuda</button>
        </div>
      ) : null}
    </section>
  );
}
