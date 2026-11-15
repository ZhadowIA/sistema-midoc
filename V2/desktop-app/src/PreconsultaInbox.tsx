import { useCallback, useEffect, useMemo, useState } from "react";
import { call, openExternal } from "./ipc";
import {
  answerRows,
  formatDateOnly,
  parseEnvelope,
  parseQuestionnaire,
  personalLinkMessage,
  personalLinkState,
  rankMatches,
  searchInbox,
  subjectiveText,
  whatsappUrl,
  type Inbox,
  type InboxItem,
  type PatientIdentity,
  type PersonalLink,
  type StoredPreconsulta
} from "./preconsultaInboxModel";

const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

/** Respuestas de una preconsulta, legibles. */
export function PreconsultaAnswers({ preconsulta }: { preconsulta: StoredPreconsulta }) {
  const envelope = parseEnvelope(preconsulta.envelope_json);
  if (!envelope) return <p className="form-error">No se pudo leer esta preconsulta.</p>;
  const rows = answerRows(envelope, parseQuestionnaire(preconsulta.questionnaire_json));
  const { identity } = envelope;
  return (
    <dl className="preconsulta-answers">
      <div>
        <dt>Paciente (lo escribió quien llenó el formulario)</dt>
        <dd>
          {identity.firstName} {identity.lastName} · nació el {formatDateOnly(identity.birthDate)} ·{" "}
          {identity.phoneCountry} {identity.phone}
        </dd>
      </div>
      <div>
        <dt>Consulta con este médico</dt>
        <dd>{envelope.firstVisit ? "Primera vez (llenó sus antecedentes)" : "Ya había consultado antes"}</dd>
      </div>
      {envelope.changesSinceLastVisit?.trim() ? (
        <div>
          <dt>Cambios desde la última visita</dt>
          <dd>{envelope.changesSinceLastVisit}</dd>
        </div>
      ) : null}
      {rows.map((row) => (
        <div key={row.id}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function InboxRow({
  item,
  reasons,
  busy,
  attachLabel,
  onAttach,
  onDiscard
}: {
  item: InboxItem;
  reasons?: string[];
  busy: boolean;
  attachLabel?: string;
  onAttach?: (item: InboxItem) => void;
  onDiscard: (item: InboxItem) => void;
}) {
  const [open, setOpen] = useState<StoredPreconsulta | null>(null);
  const [error, setError] = useState("");

  async function toggle() {
    if (open) {
      setOpen(null);
      return;
    }
    try {
      setOpen(await call<StoredPreconsulta>("preconsulta_inbox_open", { id: item.id }));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <li className="preconsulta-inbox-row">
      <div className="preconsulta-inbox-summary">
        <div>
          <strong>
            {item.first_name} {item.last_name}
          </strong>
          {item.is_new && !open ? <span className="pill pill-primary">Nueva</span> : null}
          <p className="meta">
            Nació el {formatDateOnly(item.birth_date)} · {item.phone} · enviada{" "}
            {dateTime.format(new Date(item.submitted_at))}
            {item.first_visit ? " · primera vez" : ""}
          </p>
          {reasons && reasons.length > 0 ? <p className="meta">Coincide: {reasons.join(", ")}.</p> : null}
        </div>
        <div className="button-row">
          <button className="ghost-button" onClick={() => void toggle()} disabled={busy}>
            {open ? "Ocultar" : "Ver"}
          </button>
          {onAttach ? (
            <button className="action-button" onClick={() => onAttach(item)} disabled={busy}>
              {attachLabel ?? "Adjuntar"}
            </button>
          ) : null}
          <button className="ghost-button" onClick={() => onDiscard(item)} disabled={busy}>
            Descartar
          </button>
        </div>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {open ? <PreconsultaAnswers preconsulta={open} /> : null}
    </li>
  );
}

/**
 * Bandeja de la preconsulta del enlace general (paso 32, rebanada 3). Con
 * `patient` y `encounterId` es "Buscar preconsulta" dentro de la consulta:
 * arriba las coincidencias con el paciente y abajo todas. Nunca adjunta sola:
 * el medico confirma, porque la identidad la declara quien llena el formulario.
 */
export function PreconsultaInbox({
  patient,
  encounterId,
  onAttached,
  showRetention = false
}: {
  patient?: PatientIdentity;
  encounterId?: string;
  onAttached?: () => void;
  showRetention?: boolean;
}) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    call<Inbox>("preconsulta_inbox")
      .then(setInbox)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(load, [load]);

  const matches = useMemo(
    () => (inbox && patient ? rankMatches(inbox.items, patient) : []),
    [inbox, patient]
  );
  const results = useMemo(() => (inbox ? searchInbox(inbox.items, query) : []), [inbox, query]);

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(done);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function attach(item: InboxItem) {
    if (!encounterId || !patient) return;
    const confirmed = window.confirm(
      `¿Adjuntar la preconsulta de ${item.first_name} ${item.last_name} a la consulta de ` +
        `${patient.first_name} ${patient.last_name}?\n\nLos datos los escribió quien llenó el formulario; ` +
        "confírmalos con el paciente."
    );
    if (!confirmed) return;
    void act(async () => {
      await call("preconsulta_inbox_attach", { id: item.id, encounterId });
      onAttached?.();
    }, "Preconsulta adjuntada a la consulta.");
  }

  function discard(item: InboxItem) {
    if (!window.confirm(`¿Descartar la preconsulta de ${item.first_name} ${item.last_name}? Se borra de este equipo.`)) {
      return;
    }
    void act(() => call("preconsulta_inbox_discard", { id: item.id }), "Preconsulta descartada.");
  }

  function setRetention(days: number) {
    setBusy(true);
    setError("");
    call<Inbox>("preconsulta_inbox_set_retention", { days })
      .then((next) => {
        setInbox(next);
        setMessage(`Las no adjuntadas se borrarán a los ${days} días.`);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false));
  }

  if (!inbox) return error ? <p className="form-error">{error}</p> : <p className="meta">Cargando preconsultas…</p>;

  const rowProps = { busy, onDiscard: discard, onAttach: encounterId ? attach : undefined };

  return (
    <div className="preconsulta-inbox stack">
      {patient ? (
        <div>
          <h4>Coincidencias con {patient.first_name} {patient.last_name}</h4>
          {matches.length === 0 ? (
            <p className="meta">Ninguna preconsulta recibida coincide por nombre, fecha de nacimiento o teléfono.</p>
          ) : (
            <ul className="preconsulta-inbox-list">
              {matches.map((match) => (
                <InboxRow key={match.item.id} item={match.item} reasons={match.reasons} {...rowProps} />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div>
        <h4>Todas las recibidas ({inbox.items.length})</h4>
        <label className="field">
          <span>Buscar por nombre o teléfono</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej. Ana Ruiz" />
        </label>
        {inbox.items.length === 0 ? (
          <p className="meta">
            No hay preconsultas por adjuntar. Llegan al sincronizar cuando alguien contesta tu enlace general.
          </p>
        ) : results.length === 0 ? (
          <p className="meta">Nada coincide con “{query}”.</p>
        ) : (
          <ul className="preconsulta-inbox-list">
            {results.map((item) => (
              <InboxRow key={item.id} item={item} {...rowProps} />
            ))}
          </ul>
        )}
      </div>

      {showRetention ? (
        <label className="field">
          <span>Borrar las no adjuntadas después de</span>
          <select
            value={inbox.retention_days}
            onChange={(e) => setRetention(Number(e.target.value))}
            disabled={busy}
          >
            {inbox.retention_options.map((days) => (
              <option key={days} value={days}>
                {days} días
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}

/** Preconsulta ya adjuntada: respuestas y paso al Subjetivo. */
export function AttachedPreconsulta({
  preconsulta,
  signed,
  onSendToSubjective
}: {
  preconsulta: StoredPreconsulta;
  signed: boolean;
  onSendToSubjective: (text: string) => void;
}) {
  const envelope = parseEnvelope(preconsulta.envelope_json);
  return (
    <div className="stack">
      <p className="meta">
        Enviada {dateTime.format(new Date(preconsulta.submitted_at))}
        {preconsulta.attached_at ? ` · adjuntada ${dateTime.format(new Date(preconsulta.attached_at))}` : ""}
        {envelope?.firstVisit ? " · sus antecedentes pasan por la conciliación en Antecedentes" : ""}
      </p>
      <PreconsultaAnswers preconsulta={preconsulta} />
      {!signed && envelope ? (
        <div className="button-row">
          <button
            className="action-button"
            onClick={() =>
              onSendToSubjective(
                subjectiveText(envelope, answerRows(envelope, parseQuestionnaire(preconsulta.questionnaire_json)))
              )
            }
          >
            Llevar al Subjetivo
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Enlace personal (paso 32, rebanada 4) desde el expediente: para un paciente,
 * vence a los 30 dias y sirve para un envio. Lo que conteste se adjunta solo a
 * su siguiente consulta abierta, sin buscarlo en la bandeja.
 */
export function PersonalPreconsultaLink({
  patient
}: {
  patient: { id: string; first_name: string; phone: string | null };
}) {
  const [link, setLink] = useState<PersonalLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    call<PersonalLink | null>("preconsulta_personal_link", { patientId: patient.id })
      .then(setLink)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoaded(true));
  }, [patient.id]);

  async function create() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      setLink(await call<PersonalLink | null>("preconsulta_create_personal_link", { patientId: patient.id }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <p className="meta">Cargando…</p>;
  const state = personalLinkState(link);
  const shareable = link && state === "waiting";
  const message = shareable ? personalLinkMessage(patient.first_name, link.url) : "";

  return (
    <div className="stack">
      <p className="meta">
        Para pedirle a este paciente su preconsulta antes de una cita. El enlace es solo para él, vence a los 30 días y
        sirve para un envío; lo que conteste se adjunta solo a su siguiente consulta, sin buscarlo en la bandeja.
      </p>
      {link ? (
        <p>
          {state === "waiting"
            ? `Enlace vigente hasta el ${dateOnly.format(new Date(link.expires_at))}. Aún no contesta.`
            : state === "expired"
              ? `El último enlace venció el ${dateOnly.format(new Date(link.expires_at))} sin respuesta.`
              : state === "answered"
                ? `Contestó el ${dateOnly.format(new Date(link.answered_at!))}. Se adjuntará a su siguiente consulta abierta.`
                : "Contestó y su preconsulta ya quedó en una consulta."}
        </p>
      ) : null}
      {shareable ? (
        <>
          <input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Enlace personal" />
          <div className="button-row">
            <button
              className="ghost-button"
              onClick={() => void navigator.clipboard.writeText(link.url).then(() => setCopied(true))}
            >
              {copied ? "Copiado" : "Copiar enlace"}
            </button>
            <button className="ghost-button" onClick={() => void openExternal(whatsappUrl(patient.phone, message))}>
              Enviar por WhatsApp
            </button>
          </div>
        </>
      ) : null}
      <div className="button-row">
        <button className={shareable ? "ghost-button" : "action-button"} onClick={() => void create()} disabled={busy}>
          {link ? "Crear otro enlace" : "Crear enlace personal"}
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
