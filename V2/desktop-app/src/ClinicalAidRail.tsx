import { useState, type ReactNode } from "react";
import {
  backgroundFieldLabel,
  compatibilityLabel,
  splitAidSegments,
  type BackgroundUpdate,
  type ClinicalAidDraft,
  type LabeledAidSegment
} from "./clinicalAid";
import type { SegmentDraft, TemplateSegment } from "./consultationScribe";

interface Props {
  ready: boolean;
  consent: boolean;
  hasHistory: boolean;
  hasPreconsulta: boolean;
  templates: Array<{ id: string; name: string }>;
  selectedTemplateId: string;
  /** Definicion de la plantilla activa, para etiquetar y agrupar segmentos. */
  templateSegments: TemplateSegment[];
  /** Nombre del modulo de especialidad (p. ej. "Medicina general / familiar"). */
  specialtyLabel: string;
  busy: boolean;
  draft: ClinicalAidDraft | null;
  onToggleConsent(): void;
  onTemplateChange(id: string): void;
  onGenerate(): void;
  onApplySoap(): void;
  onApplySegment(segment: SegmentDraft): void;
  onApplyPrescription(text: string): void;
  onApplyBackground(update: BackgroundUpdate): void;
  onDiscard(): void;
}

/** Proveedores reales de IA; cualquier otro nombre es el fake de demostración. */
const REAL_AI_PROVIDERS = new Set(["gemini-direct", "openai-direct"]);

type AidTab = "plantilla" | "especialidad" | "posibilidades" | "sugerencias" | "tratamiento";

const COMPATIBILITY_PILL: Record<string, string> = {
  high: "pill pill-success",
  medium: "pill pill-warning",
  low: "pill pill-muted"
};

export function ClinicalAidRail(props: Props) {
  const blockers: string[] = [];
  if (!props.ready) blockers.push("revisa la transcripción");
  if (!props.consent) blockers.push("autoriza la Ayuda IA");

  return (
    <section className="clinical-aid-launch" aria-label="Ayuda IA">
      <div className="clinical-aid-header">
        <div className="panel-header">
          <h3>Ayuda IA</h3>
          <p>Propuestas clínicas para tu revisión. Nada se aplica sin tu confirmación.</p>
        </div>
        <button className="ghost-button" onClick={props.onToggleConsent} disabled={props.busy}>
          {props.consent ? "Revocar autorización" : "Autorizar Ayuda IA"}
        </button>
      </div>

      <div className="clinical-aid-setup">
        <ul className="clinical-aid-sources" aria-label="Fuentes de la consulta">
          <SourceItem ok={props.ready} label="Transcripción" okText="revisada" pendingText="pendiente de revisión" />
          <SourceItem ok={props.hasHistory} label="Antecedentes" okText="disponibles" pendingText="sin registrar" />
          <SourceItem ok={props.hasPreconsulta} label="Preconsulta" okText="recibida" pendingText="sin respuesta" />
        </ul>
        <div className="clinical-aid-actions">
          <label className="field clinical-aid-template">
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
          <button
            className="action-button"
            onClick={props.onGenerate}
            disabled={props.busy || !props.ready || !props.consent}
          >
            {props.busy ? "Generando…" : "Generar ayuda clínica"}
          </button>
        </div>
        {blockers.length > 0 ? (
          <p className="meta clinical-aid-blocker">Para generar, {blockers.join(" y ")}.</p>
        ) : null}
      </div>

      {props.draft ? (
        // key por run_id: una nueva generación vuelve a la primera pestaña.
        <ClinicalAidResults key={props.draft.run_id} {...props} draft={props.draft} />
      ) : null}
    </section>
  );
}

function SourceItem(props: { ok: boolean; label: string; okText: string; pendingText: string }) {
  return (
    <li className={props.ok ? "clinical-aid-source is-ready" : "clinical-aid-source"}>
      <span className="clinical-aid-source-dot" aria-hidden="true" />
      <span>{props.label}</span>
      <span className="clinical-aid-source-state">{props.ok ? props.okText : props.pendingText}</span>
    </li>
  );
}

function ClinicalAidResults(props: Props & { draft: ClinicalAidDraft }) {
  const [activeTab, setActiveTab] = useState<AidTab>("plantilla");
  const segments = splitAidSegments(props.draft.template_segments, props.templateSegments);
  const isRealAi = REAL_AI_PROVIDERS.has(props.draft.provider);
  const prescription = props.draft.prescription_draft.trim();

  const tabs: Array<{ id: AidTab; label: string; count: number }> = [
    { id: "plantilla", label: "Plantilla", count: 1 + segments.template.length },
    { id: "especialidad", label: "Especialidad", count: segments.specialty.length },
    { id: "posibilidades", label: "Posibilidades", count: props.draft.possibilities.length },
    {
      id: "sugerencias",
      label: "Sugerencias",
      count:
        props.draft.exam_suggestions.length +
        props.draft.question_suggestions.length +
        props.draft.studies.length
    },
    { id: "tratamiento", label: "Tratamiento", count: props.draft.treatments.length + (prescription ? 1 : 0) }
  ];

  return (
    <div className="clinical-aid-results">
      <div className="clinical-aid-results-header">
        <h4>Propuesta generada</h4>
        {isRealAi ? (
          <p className="meta">Generado por IA · {props.draft.provider} · {props.draft.model_version}</p>
        ) : (
          <span className="pill pill-warning">Borrador de demostración ({props.draft.provider}) · sin IA real</span>
        )}
      </div>

      <div className="tab-row clinical-aid-tabs" role="tablist" aria-label="Resultados de Ayuda IA">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`aid-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`aid-panel-${tab.id}`}
            className={activeTab === tab.id ? "tab tab-active" : "tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count > 0 ? <span className="tab-count">{tab.count}</span> : null}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`aid-panel-${activeTab}`}
        aria-labelledby={`aid-tab-${activeTab}`}
        className="clinical-aid-panel"
      >
        {activeTab === "plantilla" ? (
          <>
            <AidBlock title="SOAP" action={{ label: "Aplicar al editor", onClick: props.onApplySoap }}>
              <p>{props.draft.soap.assessment || "Borrador disponible"}</p>
            </AidBlock>
            {segments.template.map((item) => (
              <SegmentResult key={item.segment.segment_id} item={item} onApply={props.onApplySegment} />
            ))}
          </>
        ) : null}

        {activeTab === "especialidad" ? (
          segments.specialty.length === 0 ? (
            <AidBlock title={props.specialtyLabel}>
              <p className="meta">La plantilla de especialidad no generó contenido en esta consulta.</p>
            </AidBlock>
          ) : (
            segments.specialty.map((item) => (
              <SegmentResult key={item.segment.segment_id} item={item} onApply={props.onApplySegment} />
            ))
          )
        ) : null}

        {activeTab === "posibilidades" ? (
          <AidBlock title="Posibilidades clínicas">
            {props.draft.possibilities.length === 0 ? (
              <p className="meta">Sin posibilidades clínicas para esta consulta.</p>
            ) : (
              props.draft.possibilities.map((item) => (
                <article key={item.title} className="aid-possibility">
                  <div className="clinical-aid-heading">
                    <b>{item.title}</b>
                    <span className={COMPATIBILITY_PILL[item.compatibility.toLowerCase()] ?? "pill pill-muted"}>
                      Compatibilidad {compatibilityLabel(item.compatibility)}
                    </span>
                  </div>
                  <p>{item.explanation}</p>
                  <dl className="aid-evidence">
                    <div>
                      <dt>A favor</dt>
                      <dd>{item.supporting_findings.join("; ") || "Sin datos"}</dd>
                    </div>
                    <div>
                      <dt>No encaja</dt>
                      <dd>{item.conflicting_findings.join("; ") || "Sin datos"}</dd>
                    </div>
                    <div>
                      <dt>Falta</dt>
                      <dd>{item.missing_data.join("; ") || "Sin faltantes"}</dd>
                    </div>
                  </dl>
                </article>
              ))
            )}
          </AidBlock>
        ) : null}

        {activeTab === "sugerencias" ? (
          <>
            <AidBlock title="Exploración física sugerida">
              <SuggestionList
                empty="Sin sugerencias para esta consulta."
                items={props.draft.exam_suggestions.map((item) => ({ term: item.name, detail: item.reason }))}
              />
            </AidBlock>
            <AidBlock title="Preguntas para el paciente">
              <SuggestionList
                empty="Sin preguntas sugeridas."
                items={props.draft.question_suggestions.map((item) => ({ term: item.question, detail: item.reason }))}
              />
            </AidBlock>
            <AidBlock title="Estudios sugeridos">
              <SuggestionList
                empty="Sin estudios sugeridos."
                items={props.draft.studies.map((item) => ({ term: item.name, detail: item.reason }))}
              />
            </AidBlock>
          </>
        ) : null}

        {activeTab === "tratamiento" ? (
          <>
            <AidBlock title="Opciones de tratamiento">
              <SuggestionList
                empty="Sin opciones de tratamiento para esta consulta."
                items={props.draft.treatments.map((item) => ({ term: item.name, detail: item.reason }))}
              />
            </AidBlock>
            {prescription ? (
              <AidBlock
                title="Receta sugerida"
                action={{ label: "Aplicar a receta", onClick: () => props.onApplyPrescription(prescription) }}
              >
                <p>{prescription}</p>
                <p className="meta">Solo tratamientos mencionados en la conversación.</p>
              </AidBlock>
            ) : null}
          </>
        ) : null}
      </div>

      {props.draft.background_updates.length > 0 ? (
        <section className="clinical-aid-background" aria-label="Antecedentes detectados">
          <span className="clinical-aid-block-title">Antecedentes detectados en la conversación</span>
          {props.draft.background_updates.map((update) => (
            <div key={`${update.field}:${update.content}`} className="aid-background-row">
              <p><b>{backgroundFieldLabel(update.field)}:</b> {update.content}</p>
              <button className="ghost-button aid-apply" onClick={() => props.onApplyBackground(update)}>
                Aplicar
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <div className="clinical-aid-footer">
        <button className="ghost-button danger-link" onClick={props.onDiscard}>Descartar propuesta</button>
      </div>
    </div>
  );
}

function AidBlock(props: { title: string; action?: { label: string; onClick(): void }; children: ReactNode }) {
  return (
    <section className="clinical-aid-block">
      <header className="clinical-aid-block-header">
        <span className="clinical-aid-block-title">{props.title}</span>
        {props.action ? (
          <button className="ghost-button aid-apply" onClick={props.action.onClick}>
            {props.action.label}
          </button>
        ) : null}
      </header>
      {props.children}
    </section>
  );
}

function SuggestionList(props: { items: Array<{ term: string; detail: string }>; empty: string }) {
  if (props.items.length === 0) {
    return <p className="meta">{props.empty}</p>;
  }
  return (
    <ul className="aid-list">
      {props.items.map((item) => (
        <li key={item.term}>
          <b>{item.term}</b>
          <span>{item.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function SegmentResult(props: { item: LabeledAidSegment; onApply(segment: SegmentDraft): void }) {
  return (
    <AidBlock
      title={props.item.label}
      action={{ label: "Aplicar segmento", onClick: () => props.onApply(props.item.segment) }}
    >
      <p>{props.item.segment.content}</p>
    </AidBlock>
  );
}
