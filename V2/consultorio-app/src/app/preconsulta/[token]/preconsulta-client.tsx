"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { MedicalHistoryPayload } from "../../../lib/medical-history";
import { COUNTRIES, DEFAULT_COUNTRY, dialForCountry } from "../../../lib/phone";
import {
  NO_ANSWER,
  PRECONSULTA_ENVELOPE_KIND,
  PRECONSULTA_ENVELOPE_VERSION,
  answersToSend,
  identitySchema,
  missingRequired,
  pages,
  preconsultaEnvelopeSchema,
  visibleQuestions,
  type AnswerValue,
  type Answers
} from "../../../lib/preconsulta-answers";
import type { PreconsultaQuestion } from "../../../lib/preconsulta-questionnaire";
import { sealEnvelope } from "../../../lib/seal-envelope";
import type { PublicPreconsulta } from "../../../services/preconsulta/submission-service";
import { MedicalHistoryForm } from "../../perfil/[slug]/cita/[token]/medical-history-form";

type Step = "intro" | "first" | "identity" | "history" | "changes" | "questions" | "review" | "done";

interface IdentityDraft {
  firstName: string;
  lastName: string;
  birthDate: string;
  country: string;
  phone: string;
}

/** Lo que se guarda en este celular mientras contesta (nunca en el servidor). */
interface Draft {
  step: Step;
  page: number;
  firstVisit: boolean | null;
  identity: IdentityDraft;
  medicalHistory: MedicalHistoryPayload | null;
  hasChanges: boolean | null;
  changes: string;
  answers: Answers;
}

const EMPTY: Draft = {
  step: "intro",
  page: 0,
  firstVisit: null,
  identity: { firstName: "", lastName: "", birthDate: "", country: DEFAULT_COUNTRY, phone: "" },
  medicalHistory: null,
  hasChanges: null,
  changes: "",
  answers: {}
};

function storageKey(token: string) {
  return `midoc-preconsulta:${token}`;
}

function readSaved(token: string): string | null {
  try {
    return localStorage.getItem(storageKey(token));
  } catch {
    // Navegacion privada o sin almacenamiento: empieza de nuevo.
    return null;
  }
}

function parseSaved(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) };
  } catch {
    return null;
  }
}

const noSubscription = () => () => undefined;

function flow(firstVisit: boolean | null): Step[] {
  return ["intro", "first", "identity", firstVisit ? "history" : "changes", "questions", "review"];
}

/**
 * Lo que ya escribio en "Tus datos" no se le vuelve a pedir en la ficha de
 * identificacion de los antecedentes (claves del grupo `identification`).
 */
function identificationPrefill(identity: IdentityDraft): Record<string, string> {
  const [paterno, ...materno] = identity.lastName.trim().split(/\s+/);
  const prefill: Record<string, string> = {};
  if (identity.firstName.trim()) prefill.nombre = identity.firstName.trim();
  if (paterno) prefill.apellidoPaterno = paterno;
  if (materno.length > 0) prefill.apellidoMaterno = materno.join(" ");
  if (identity.birthDate) prefill.fechaNacimiento = identity.birthDate;
  if (identity.phone.trim()) prefill.telefono = `${dialForCountry(identity.country)} ${identity.phone.trim()}`;
  return prefill;
}

function display(question: PreconsultaQuestion, value: AnswerValue | undefined): string {
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "Sin responder";
  if (value === NO_ANSWER) return "Prefiero no responder";
  if (question.type === "yes_no") return value === "si" ? "Sí" : "No";
  return Array.isArray(value) ? value.join(", ") : value;
}

export function PreconsultaClient({ token, preconsulta }: { token: string; preconsulta: PublicPreconsulta }) {
  // Borrador guardado en este celular: el servidor no lo conoce, asi que se lee
  // despues de hidratar (en el servidor no hay nada guardado).
  const savedRaw = useSyncExternalStore(noSubscription, () => readSaved(token), () => null);
  const saved = useMemo(() => parseSaved(savedRaw), [savedRaw]);
  const [edited, setEdited] = useState<Draft | null>(null);
  const draft = edited ?? saved ?? EMPTY;
  const [errors, setErrors] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);

  // Guardado automatico en el propio celular: si se cierra, sigue donde iba.
  useEffect(() => {
    if (!edited || edited.step === "done") return;
    try {
      localStorage.setItem(storageKey(token), JSON.stringify(edited));
    } catch {
      // Navegacion privada o sin espacio: el formulario sigue funcionando.
    }
  }, [edited, token]);

  const definition = useMemo(
    () => preconsulta.questionnaire?.definition ?? { schemaVersion: 1 as const, questions: [] },
    [preconsulta.questionnaire]
  );
  const visible = useMemo(() => visibleQuestions(definition, draft.answers), [definition, draft.answers]);
  const questionPages = useMemo(() => pages(visible), [visible]);
  const steps = flow(draft.firstVisit);
  const position = steps.indexOf(draft.step);
  const progress =
    draft.step === "done"
      ? 100
      : Math.round(
          ((position + (draft.step === "questions" && questionPages.length > 0 ? draft.page / questionPages.length : 0)) /
            steps.length) *
            100
        );

  const update = (change: Partial<Draft>) => setEdited((current) => ({ ...(current ?? draft), ...change }));
  const go = (step: Step, page = 0) => {
    setErrors([]);
    update({ step, page });
    window.scrollTo({ top: 0 });
  };
  const next = () => go(steps[position + 1] ?? "review");
  const back = () => go(steps[position - 1] ?? "intro");
  const setAnswer = (id: string, value: AnswerValue) => update({ answers: { ...draft.answers, [id]: value } });

  if (!preconsulta.accepting) {
    return (
      <main className="preconsulta-shell">
        <section className="panel preconsulta-form">
          <h1>Preconsulta</h1>
          <p>
            {preconsulta.reason === "paused"
              ? `${preconsulta.doctorName} pausó por ahora la recepción de preconsultas. Intenta más tarde.`
              : `${preconsulta.doctorName} aún no tiene lista su preconsulta. Intenta más tarde.`}
          </p>
        </section>
      </main>
    );
  }

  function checkIdentity(): boolean {
    const parsed = identitySchema.safeParse({
      firstName: draft.identity.firstName,
      lastName: draft.identity.lastName,
      birthDate: draft.identity.birthDate,
      phoneCountry: dialForCountry(draft.identity.country),
      phone: draft.identity.phone
    });
    if (parsed.success) return true;
    const fields = new Set(parsed.error.issues.map((issue) => String(issue.path[0])));
    const messages: Record<string, string> = {
      firstName: "Escribe tu nombre.",
      lastName: "Escribe tus apellidos.",
      birthDate: "Escribe una fecha de nacimiento válida.",
      phone: "Escribe un teléfono de 10 dígitos."
    };
    setErrors([...fields].map((field) => messages[field] ?? "Revisa tus datos."));
    return false;
  }

  function checkPage(): boolean {
    const onPage = new Set((questionPages[draft.page] ?? []).map((q) => q.id));
    const missing = missingRequired(definition, draft.answers).filter((id) => onPage.has(id));
    if (missing.length === 0) return true;
    setErrors(["Contesta las preguntas marcadas como obligatorias (*)."]);
    return false;
  }

  async function submit() {
    if (!consent) {
      setErrors(["Para enviar, marca la casilla de consentimiento."]);
      return;
    }
    if (missingRequired(definition, draft.answers).length > 0) {
      setErrors(["Faltan preguntas obligatorias. Regresa a contestarlas."]);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const now = new Date().toISOString();
      const envelope = preconsultaEnvelopeSchema.parse({
        kind: PRECONSULTA_ENVELOPE_KIND,
        version: PRECONSULTA_ENVELOPE_VERSION,
        questionnaireVersion: preconsulta.questionnaire!.version,
        linkKind: "GENERAL",
        submittedAt: now,
        consentAt: now,
        identity: {
          firstName: draft.identity.firstName,
          lastName: draft.identity.lastName,
          birthDate: draft.identity.birthDate,
          phoneCountry: dialForCountry(draft.identity.country),
          phone: draft.identity.phone
        },
        firstVisit: Boolean(draft.firstVisit),
        ...(draft.firstVisit && draft.medicalHistory ? { medicalHistory: draft.medicalHistory } : {}),
        ...(!draft.firstVisit && draft.hasChanges && draft.changes.trim()
          ? { changesSinceLastVisit: draft.changes.trim() }
          : {}),
        answers: answersToSend(definition, draft.answers)
      });
      const body = new TextEncoder().encode(JSON.stringify(envelope));
      const ciphertext = await sealEnvelope(
        preconsulta.publicKey!,
        { kind: PRECONSULTA_ENVELOPE_KIND, version: PRECONSULTA_ENVELOPE_VERSION },
        body
      );
      const response = await fetch(`/api/public/preconsulta/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ciphertext, questionnaireVersion: preconsulta.questionnaire!.version, website })
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo enviar tu preconsulta.");
      // Telefono compartido: despues de enviar no queda nada en este celular.
      try {
        localStorage.removeItem(storageKey(token));
      } catch {
        // Nada que borrar.
      }
      setEdited({ ...EMPTY, step: "done" });
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "No se pudo enviar tu preconsulta."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="preconsulta-shell">
      <section className="panel preconsulta-form">
        {draft.step !== "intro" && draft.step !== "done" ? (
          <div className="preconsulta-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress}%` }} />
          </div>
        ) : null}

        {draft.step === "intro" ? (
          <>
            <p className="section-kicker">Preconsulta</p>
            <h1>{preconsulta.doctorName}</h1>
            {preconsulta.licenseNumber ? <p className="field-hint">Cédula profesional {preconsulta.licenseNumber}</p> : null}
            <p>Contesta unas preguntas antes de tu consulta. Te toma unos 5 minutos y no necesitas cuenta.</p>
            <p className="field-hint">
              Privacidad: tus respuestas se cifran en este celular y solo tu médico puede leerlas; MiDoc no puede verlas
              y las borra de sus servidores cuando tu médico las recibe.
            </p>
            <details className="field-hint">
              <summary>Más sobre tus datos</summary>
              <p>
                Tu médico es responsable de tus datos personales y de salud. Los usa para preparar y atender tu
                consulta, y los guarda en su expediente clínico solo si los adjunta a tu consulta; si no, se borran de
                su computadora en el plazo que él configure. Para ejercer tus derechos de acceso, rectificación,
                cancelación u oposición, dirígete a tu médico.
              </p>
            </details>
            <button className="action-button" onClick={() => go("first")}>
              Empezar
            </button>
          </>
        ) : null}

        {draft.step === "first" ? (
          <>
            <h2>¿Es tu primera consulta con {preconsulta.doctorName}?</h2>
            <div className="preconsulta-choices">
              <button
                className={draft.firstVisit === true ? "action-button" : "ghost-button"}
                onClick={() => {
                  update({ firstVisit: true });
                  go("identity");
                }}
              >
                Sí, es mi primera vez
              </button>
              <button
                className={draft.firstVisit === false ? "action-button" : "ghost-button"}
                onClick={() => {
                  update({ firstVisit: false });
                  go("identity");
                }}
              >
                No, ya he consultado antes
              </button>
            </div>
            <button className="ghost-button" onClick={back}>
              Atrás
            </button>
          </>
        ) : null}

        {draft.step === "identity" ? (
          <>
            <h2>Tus datos</h2>
            <p className="field-hint">Con ellos tu médico encuentra tu preconsulta. Todos son obligatorios.</p>
            <label className="field">
              <span>Nombre(s)</span>
              <input
                autoComplete="given-name"
                value={draft.identity.firstName}
                onChange={(e) => update({ identity: { ...draft.identity, firstName: e.target.value } })}
              />
            </label>
            <label className="field">
              <span>Apellidos</span>
              <input
                autoComplete="family-name"
                value={draft.identity.lastName}
                onChange={(e) => update({ identity: { ...draft.identity, lastName: e.target.value } })}
              />
            </label>
            <label className="field">
              <span>Fecha de nacimiento</span>
              <input
                type="date"
                autoComplete="bday"
                value={draft.identity.birthDate}
                onChange={(e) => update({ identity: { ...draft.identity, birthDate: e.target.value } })}
              />
            </label>
            <div className="preconsulta-phone">
              <label className="field">
                <span>País</span>
                <select
                  value={draft.identity.country}
                  onChange={(e) => update({ identity: { ...draft.identity, country: e.target.value } })}
                >
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.dial}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Teléfono (10 dígitos)</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={draft.identity.phone}
                  onChange={(e) => update({ identity: { ...draft.identity, phone: e.target.value } })}
                />
              </label>
            </div>
            <div className="preconsulta-nav">
              <button className="ghost-button" onClick={back}>
                Atrás
              </button>
              <button className="action-button" onClick={() => checkIdentity() && next()}>
                Continuar
              </button>
            </div>
          </>
        ) : null}

        {draft.step === "history" ? (
          <>
            <h2>Tus antecedentes</h2>
            <p className="field-hint">
              Como es tu primera consulta, tu médico necesita conocer tu historia. Contesta lo que sepas; puedes dejar
              en blanco lo que no.
            </p>
            <MedicalHistoryForm
              prefillIdentification={identificationPrefill(draft.identity)}
              onPayload={(payload) => update({ medicalHistory: payload })}
              submitLabel="Continuar"
              onSaved={next}
            />
            <button className="ghost-button" onClick={back}>
              Atrás
            </button>
          </>
        ) : null}

        {draft.step === "changes" ? (
          <>
            <h2>¿Cambió algo de tu salud desde tu última visita?</h2>
            <p className="field-hint">Por ejemplo medicamentos, alergias, cirugías o embarazo.</p>
            <div className="preconsulta-choices">
              <button
                className={draft.hasChanges === true ? "action-button" : "ghost-button"}
                onClick={() => update({ hasChanges: true })}
              >
                Sí
              </button>
              <button
                className={draft.hasChanges === false ? "action-button" : "ghost-button"}
                onClick={() => update({ hasChanges: false, changes: "" })}
              >
                No
              </button>
            </div>
            {draft.hasChanges ? (
              <label className="field">
                <span>¿Qué cambió?</span>
                <textarea rows={4} maxLength={2000} value={draft.changes} onChange={(e) => update({ changes: e.target.value })} />
              </label>
            ) : null}
            <div className="preconsulta-nav">
              <button className="ghost-button" onClick={back}>
                Atrás
              </button>
              <button className="action-button" disabled={draft.hasChanges === null} onClick={next}>
                Continuar
              </button>
            </div>
          </>
        ) : null}

        {draft.step === "questions" ? (
          <>
            <h2>{definition.title || "Motivo de consulta"}</h2>
            {(questionPages[draft.page] ?? []).map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                value={draft.answers[question.id]}
                onChange={(value) => setAnswer(question.id, value)}
              />
            ))}
            <div className="preconsulta-nav">
              <button
                className="ghost-button"
                onClick={() => (draft.page > 0 ? go("questions", draft.page - 1) : back())}
              >
                Atrás
              </button>
              <button
                className="action-button"
                onClick={() => {
                  if (!checkPage()) return;
                  if (draft.page + 1 < questionPages.length) go("questions", draft.page + 1);
                  else go("review");
                }}
              >
                Continuar
              </button>
            </div>
          </>
        ) : null}

        {draft.step === "review" ? (
          <>
            <h2>Revisa antes de enviar</h2>
            <dl className="preconsulta-review">
              <dt>Nombre</dt>
              <dd>
                {draft.identity.firstName} {draft.identity.lastName}
              </dd>
              <dt>Fecha de nacimiento</dt>
              <dd>{draft.identity.birthDate}</dd>
              <dt>Teléfono</dt>
              <dd>
                {dialForCountry(draft.identity.country)} {draft.identity.phone}
              </dd>
              <dt>Primera consulta</dt>
              <dd>{draft.firstVisit ? "Sí (antecedentes contestados)" : "No"}</dd>
              {!draft.firstVisit ? (
                <>
                  <dt>Cambios desde tu última visita</dt>
                  <dd>{draft.hasChanges && draft.changes.trim() ? draft.changes : "Ninguno"}</dd>
                </>
              ) : null}
              {visible.map((question) => (
                <div key={question.id}>
                  <dt>{question.label}</dt>
                  <dd>{display(question, draft.answers[question.id])}</dd>
                </div>
              ))}
            </dl>
            <button className="ghost-button" onClick={() => go("questions", 0)}>
              Cambiar respuestas
            </button>
            <label className="preconsulta-consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                Doy mi consentimiento expreso para que estos datos personales y de salud se envíen cifrados a{" "}
                {preconsulta.doctorName} para preparar y atender mi consulta, conforme a la Ley Federal de Protección
                de Datos Personales en Posesión de los Particulares.
              </span>
            </label>
            {/* Trampa para bots: invisible para las personas. */}
            <input
              className="preconsulta-trap"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
            <div className="preconsulta-nav">
              <button className="ghost-button" onClick={back} disabled={busy}>
                Atrás
              </button>
              <button className="action-button" onClick={() => void submit()} disabled={busy}>
                {busy ? "Cifrando y enviando…" : "Enviar de forma segura"}
              </button>
            </div>
          </>
        ) : null}

        {draft.step === "done" ? (
          <>
            <h2>¡Listo!</h2>
            <p>
              Tu preconsulta llegó cifrada a {preconsulta.doctorName}. La verá en tu consulta. Por seguridad, ya no
              queda nada guardado en este celular.
            </p>
          </>
        ) : null}

        {errors.length > 0 ? (
          <ul className="form-error" role="alert">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}

function QuestionField({
  question,
  value,
  onChange
}: {
  question: PreconsultaQuestion;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}) {
  const skip = !question.required ? (
    <button className={value === NO_ANSWER ? "action-button" : "ghost-button"} onClick={() => onChange(NO_ANSWER)}>
      Prefiero no responder
    </button>
  ) : null;
  const text = typeof value === "string" && value !== NO_ANSWER ? value : "";
  return (
    <fieldset className="preconsulta-question">
      <legend>
        {question.label}
        {question.required ? " *" : ""}
      </legend>
      {question.help ? <p className="field-hint">{question.help}</p> : null}
      {question.type === "yes_no" ? (
        <div className="preconsulta-choices">
          {(["si", "no"] as const).map((option) => (
            <button key={option} className={value === option ? "action-button" : "ghost-button"} onClick={() => onChange(option)}>
              {option === "si" ? "Sí" : "No"}
            </button>
          ))}
          {skip}
        </div>
      ) : question.type === "single_choice" ? (
        <div className="preconsulta-choices">
          {(question.options ?? []).map((option) => (
            <button key={option} className={value === option ? "action-button" : "ghost-button"} onClick={() => onChange(option)}>
              {option}
            </button>
          ))}
          {skip}
        </div>
      ) : question.type === "multi_choice" ? (
        <div className="preconsulta-choices">
          {(question.options ?? []).map((option) => {
            const list = Array.isArray(value) ? value : [];
            const selected = list.includes(option);
            return (
              <button
                key={option}
                className={selected ? "action-button" : "ghost-button"}
                aria-pressed={selected}
                onClick={() => onChange(selected ? list.filter((o) => o !== option) : [...list, option])}
              >
                {option}
              </button>
            );
          })}
          {skip}
        </div>
      ) : question.type === "scale" ? (
        <>
          <div className="preconsulta-scale">
            {Array.from({ length: 11 }, (_, n) => String(n)).map((n) => (
              <button key={n} className={value === n ? "action-button" : "ghost-button"} onClick={() => onChange(n)}>
                {n}
              </button>
            ))}
          </div>
          <p className="field-hint">0 es nada y 10 lo máximo.</p>
          {skip}
        </>
      ) : question.type === "long_text" ? (
        <textarea rows={4} maxLength={2000} value={text} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          type={question.type === "date" ? "date" : question.type === "number" ? "number" : "text"}
          inputMode={question.type === "number" ? "decimal" : undefined}
          maxLength={2000}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </fieldset>
  );
}
