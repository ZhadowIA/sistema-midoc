import { useEffect, useMemo, useRef, useState } from "react";
import { call, openExternal } from "./ipc";
import { PreconsultaInbox } from "./PreconsultaInbox";
import {
  CONDITION_SOURCE_TYPES,
  QUESTIONNAIRE_LIMITS,
  QUESTIONNAIRE_TEMPLATES,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  cleanForPublish,
  conditionValues,
  emptyQuestionnaire,
  isChoice,
  moveQuestion,
  newQuestion,
  removeQuestion,
  samePublished,
  validateQuestionnaire,
  visibleQuestions,
  type PreconsultaQuestion,
  type PreconsultaQuestionnaire,
  type PreviewAnswers,
  type QuestionType
} from "./preconsultaQuestionnaire";

/** Lo que devuelven los comandos `preconsulta_*` de Rust. */
interface PreconsultaState {
  draft: PreconsultaQuestionnaire | null;
  published_version: number | null;
  published_at: string | null;
  published: PreconsultaQuestionnaire | null;
  link: { url: string | null; status: string; created_at: string } | null;
  linked: boolean;
  offline: boolean;
}

const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

/**
 * Preconsulta configurable, rebanada 1 (paso 32): el medico arma la parte 2
 * del cuestionario (motivo de consulta), la ve como en un celular, la publica y
 * administra su enlace general. La parte 1 (antecedentes para quien viene por
 * primera vez) es el cuestionario comun y no se edita aqui.
 */
export function PreconsultaEditor({ dental }: { dental: boolean }) {
  const [state, setState] = useState<PreconsultaState | null>(null);
  const [definition, setDefinition] = useState<PreconsultaQuestionnaire>(emptyQuestionnaire());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const loaded = useRef(false);

  useEffect(() => {
    call<PreconsultaState>("preconsulta_state")
      .then((current) => {
        setState(current);
        setDefinition(current.draft ?? current.published ?? emptyQuestionnaire());
        loaded.current = true;
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  // Guarda el borrador en este equipo al dejar de escribir.
  useEffect(() => {
    if (!loaded.current) return;
    const timer = setTimeout(() => {
      call("preconsulta_save_draft", { definition }).catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer);
  }, [definition]);

  const errors = useMemo(() => validateQuestionnaire(definition), [definition]);
  const unpublished = !samePublished(definition, state?.published);

  async function act(label: string, command: string, args?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await call<PreconsultaState>(command, args);
      setState(next);
      setMessage(label);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function update(index: number, change: Partial<PreconsultaQuestion>) {
    setDefinition((current) => ({
      ...current,
      questions: current.questions.map((q, i) => (i === index ? { ...q, ...change } : q))
    }));
  }

  function applyTemplate(key: "general" | "odontologia") {
    if (definition.questions.length > 0 && !window.confirm("¿Reemplazar tus preguntas por la plantilla?")) return;
    setDefinition(structuredClone(QUESTIONNAIRE_TEMPLATES[key]));
  }

  if (!state) {
    return <section className="panel">{error ? <p className="form-error">{error}</p> : <p className="meta">Cargando…</p>}</section>;
  }

  return (
    <div className="preconsulta-editor">
      <section className="panel">
        <div className="panel-header">
          <h2>Preconsulta</h2>
          <p>
            Tus pacientes la contestan desde el celular antes de la consulta, sin cuenta. Quien viene por primera vez
            llena además sus antecedentes (el cuestionario común, que no se edita aquí). Aquí armas la parte del motivo
            de consulta. Las respuestas te llegan cifradas: el portal nunca las puede leer.
          </p>
        </div>
        <p className="meta">
          {state.published_version
            ? `Publicada (versión ${state.published_version}${state.published_at ? `, ${dateTime.format(new Date(state.published_at))}` : ""})${unpublished ? " · tienes cambios sin publicar" : ""}.`
            : "Aún no la publicas."}
          {state.offline ? " Sin conexión con el portal: se muestra lo último conocido." : ""}
        </p>
        <div className="button-row">
          <button className="ghost-button" onClick={() => applyTemplate(dental ? "odontologia" : "general")} disabled={busy}>
            Usar plantilla de {dental ? "odontología" : "medicina general"}
          </button>
          <button className="ghost-button" onClick={() => applyTemplate(dental ? "general" : "odontologia")} disabled={busy}>
            Usar plantilla de {dental ? "medicina general" : "odontología"}
          </button>
        </div>
      </section>

      <div className="preconsulta-workspace">
        <section className="panel">
          <label className="field">
            <span>Título</span>
            <input
              value={definition.title ?? ""}
              maxLength={QUESTIONNAIRE_LIMITS.title}
              onChange={(e) => setDefinition({ ...definition, title: e.target.value })}
            />
          </label>
          {definition.questions.length === 0 ? (
            <p className="meta">Sin preguntas. Empieza con una plantilla o agrega la primera.</p>
          ) : null}
          {definition.questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              index={index}
              question={question}
              earlier={definition.questions.slice(0, index)}
              disabled={busy}
              onChange={(change) => update(index, change)}
              onMove={(delta) => setDefinition(moveQuestion(definition, index, delta))}
              onRemove={() => setDefinition(removeQuestion(definition, question.id))}
              last={index === definition.questions.length - 1}
            />
          ))}
          <div className="button-row">
            <button
              className="ghost-button"
              onClick={() => setDefinition({ ...definition, questions: [...definition.questions, newQuestion(definition)] })}
              disabled={busy || definition.questions.length >= QUESTIONNAIRE_LIMITS.questions}
            >
              Agregar pregunta
            </button>
          </div>
          {errors.length > 0 ? (
            <ul className="form-error" role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
          <div className="button-row">
            <button
              className="action-button"
              disabled={busy || errors.length > 0 || !state.linked}
              onClick={() =>
                void act("Cuestionario publicado.", "preconsulta_publish", { definition: cleanForPublish(definition) })
              }
            >
              Publicar
            </button>
            {!state.linked ? <span className="meta">Vincula tu cuenta del portal para publicar.</span> : null}
          </div>
        </section>

        <PhonePreview definition={definition} />
      </div>

      <GeneralLinkPanel state={state} busy={busy} onAct={act} />

      <section className="panel">
        <div className="panel-header">
          <h2>Recibidas</h2>
          <p>
            Las que llegaron por tu enlace general y aún no adjuntas a una consulta. Se adjuntan desde la consulta, en
            "Buscar preconsulta". Las que no adjuntes se borran solas de este equipo al vencer el plazo.
          </p>
        </div>
        <PreconsultaInbox showRetention />
      </section>

      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function QuestionCard({
  index,
  question,
  earlier,
  disabled,
  last,
  onChange,
  onMove,
  onRemove
}: {
  index: number;
  question: PreconsultaQuestion;
  earlier: PreconsultaQuestion[];
  disabled: boolean;
  last: boolean;
  onChange: (change: Partial<PreconsultaQuestion>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const sources = earlier.filter((q) => CONDITION_SOURCE_TYPES.includes(q.type));
  const source = sources.find((q) => q.id === question.showWhen?.questionId);
  return (
    <div className="preconsulta-question">
      <div className="button-row">
        <strong>Pregunta {index + 1}</strong>
        <button className="ghost-button" onClick={() => onMove(-1)} disabled={disabled || index === 0} title="Subir">
          ↑
        </button>
        <button className="ghost-button" onClick={() => onMove(1)} disabled={disabled || last} title="Bajar">
          ↓
        </button>
        <button className="ghost-button" onClick={onRemove} disabled={disabled}>
          Quitar
        </button>
      </div>
      <label className="field">
        <span>Pregunta</span>
        <input
          value={question.label}
          maxLength={QUESTIONNAIRE_LIMITS.label}
          placeholder="¿Qué te trae a consulta?"
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Ayuda (opcional)</span>
        <input
          value={question.help ?? ""}
          maxLength={QUESTIONNAIRE_LIMITS.help}
          onChange={(e) => onChange({ help: e.target.value })}
        />
      </label>
      <div className="button-row">
        <label className="field">
          <span>Tipo de respuesta</span>
          <select value={question.type} onChange={(e) => onChange({ type: e.target.value as QuestionType })}>
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {QUESTION_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="button-row">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          <span>Obligatoria</span>
        </label>
      </div>
      {isChoice(question.type) ? (
        <label className="field">
          <span>Opciones (una por línea)</span>
          <textarea
            rows={3}
            value={(question.options ?? []).join("\n")}
            onChange={(e) => onChange({ options: e.target.value.split("\n") })}
          />
        </label>
      ) : null}
      {sources.length > 0 ? (
        <div className="button-row">
          <label className="field">
            <span>Mostrar solo si…</span>
            <select
              value={question.showWhen?.questionId ?? ""}
              onChange={(e) => {
                const chosen = sources.find((q) => q.id === e.target.value);
                onChange({
                  showWhen: chosen ? { questionId: chosen.id, equals: conditionValues(chosen)[0] ?? "" } : undefined
                });
              }}
            >
              <option value="">Siempre</option>
              {sources.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label || q.id}
                </option>
              ))}
            </select>
          </label>
          {source ? (
            <label className="field">
              <span>responde</span>
              <select
                value={question.showWhen?.equals ?? ""}
                onChange={(e) => onChange({ showWhen: { questionId: source.id, equals: e.target.value } })}
              >
                {conditionValues(source).map((value) => (
                  <option key={value} value={value}>
                    {value === "si" ? "Sí" : value === "no" ? "No" : value}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Vista previa con el ancho de un celular; sirve para probar las condiciones. */
function PhonePreview({ definition }: { definition: PreconsultaQuestionnaire }) {
  const [answers, setAnswers] = useState<PreviewAnswers>({});
  const shown = visibleQuestions(definition, answers);
  const set = (id: string, value: string | string[]) => setAnswers((current) => ({ ...current, [id]: value }));
  return (
    <aside className="phone-preview" aria-label="Vista previa en celular">
      <p className="meta">Vista previa (así lo verá el paciente)</p>
      <div className="phone-frame">
        <h3>{definition.title?.trim() || "Motivo de consulta"}</h3>
        {shown.length === 0 ? <p className="meta">Aún no hay preguntas.</p> : null}
        {shown.map((q) => (
          <div key={q.id} className="phone-question">
            <p>
              {q.label || "(pregunta sin texto)"}
              {q.required ? " *" : ""}
            </p>
            {q.help ? <p className="meta">{q.help}</p> : null}
            {q.type === "yes_no" ? (
              <div className="button-row">
                {["si", "no"].map((value) => (
                  <button
                    key={value}
                    className={answers[q.id] === value ? "action-button" : "ghost-button"}
                    onClick={() => set(q.id, value)}
                  >
                    {value === "si" ? "Sí" : "No"}
                  </button>
                ))}
              </div>
            ) : q.type === "single_choice" || q.type === "multi_choice" ? (
              <div className="stack">
                {(q.options ?? []).filter(Boolean).map((option) => {
                  const current = answers[q.id];
                  const selected = Array.isArray(current) ? current.includes(option) : current === option;
                  return (
                    <button
                      key={option}
                      className={selected ? "action-button" : "ghost-button"}
                      onClick={() => {
                        if (q.type === "single_choice") return set(q.id, option);
                        const list = Array.isArray(current) ? current : [];
                        set(q.id, selected ? list.filter((o) => o !== option) : [...list, option]);
                      }}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            ) : q.type === "scale" ? (
              <div className="phone-scale">
                {Array.from({ length: 11 }, (_, n) => String(n)).map((n) => (
                  <button key={n} className={answers[q.id] === n ? "action-button" : "ghost-button"} onClick={() => set(q.id, n)}>
                    {n}
                  </button>
                ))}
              </div>
            ) : q.type === "long_text" ? (
              <textarea rows={3} disabled placeholder="Respuesta del paciente" />
            ) : (
              <input disabled type={q.type === "date" ? "date" : q.type === "number" ? "number" : "text"} />
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

function GeneralLinkPanel({
  state,
  busy,
  onAct
}: {
  state: PreconsultaState;
  busy: boolean;
  onAct: (label: string, command: string, args?: Record<string, unknown>) => Promise<void>;
}) {
  const link = state.link;
  const [copied, setCopied] = useState(false);
  const message = link?.url
    ? `Antes de tu consulta, contesta tu preconsulta aquí (toma unos minutos y tus respuestas llegan cifradas a tu médico): ${link.url}`
    : "";
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Enlace general</h2>
        <p>
          Un solo enlace para todos tus pacientes: compártelo en la sala de espera, por WhatsApp o en redes. Quien lo
          tenga puede enviarte su preconsulta, pero nunca leer las de otros.
        </p>
      </div>
      <p className="meta">
        Las respuestas bajan cifradas a esta app al sincronizar y quedan en "Recibidas", abajo, hasta que las adjuntes
        a una consulta.
      </p>
      {!state.linked ? (
        <p className="meta">Vincula tu cuenta del portal para crear tu enlace.</p>
      ) : !link ? (
        <div className="button-row">
          <button
            className="action-button"
            disabled={busy || !state.published_version}
            onClick={() => void onAct("Enlace creado.", "preconsulta_regenerate_link")}
          >
            Crear enlace general
          </button>
          {!state.published_version ? <span className="meta">Publica tu cuestionario primero.</span> : null}
        </div>
      ) : (
        <div className="stack">
          <p>
            Estado: <strong>{link.status === "PAUSED" ? "En pausa (no acepta envíos)" : link.status === "ACTIVE" ? "Activo" : "Desconocido"}</strong>
          </p>
          {link.url ? (
            <>
              <input readOnly value={link.url} onFocus={(e) => e.target.select()} />
              <div className="button-row">
                <button
                  className="ghost-button"
                  onClick={() => {
                    void navigator.clipboard.writeText(link.url ?? "").then(() => setCopied(true));
                  }}
                >
                  {copied ? "Copiado" : "Copiar enlace"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => void openExternal(`https://wa.me/?text=${encodeURIComponent(message)}`)}
                >
                  Compartir por WhatsApp
                </button>
              </div>
            </>
          ) : (
            <p className="meta">
              Este equipo no conoce el enlace vigente (se creó o se regeneró en otro equipo). Regénéralo para verlo
              aquí; el anterior dejará de funcionar.
            </p>
          )}
          <div className="button-row">
            {link.status === "PAUSED" ? (
              <button
                className="ghost-button"
                disabled={busy}
                onClick={() => void onAct("Enlace reanudado.", "preconsulta_set_link_status", { status: "ACTIVE" })}
              >
                Reanudar
              </button>
            ) : (
              <button
                className="ghost-button"
                disabled={busy}
                onClick={() => void onAct("Enlace en pausa.", "preconsulta_set_link_status", { status: "PAUSED" })}
              >
                Pausar
              </button>
            )}
            <button
              className="ghost-button"
              disabled={busy}
              onClick={() => {
                if (window.confirm("El enlace actual dejará de funcionar para quien ya lo tenga. ¿Regenerar?")) {
                  void onAct("Enlace regenerado.", "preconsulta_regenerate_link");
                }
              }}
            >
              Regenerar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
