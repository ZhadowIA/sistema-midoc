import { useCallback, useEffect, useState } from "react";
import { call } from "./ipc";

interface PatientSummary {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  allergies: string | null;
  encounter_count: number;
  last_visit: string | null;
}

interface PatientRecord {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  allergies: string | null;
  medical_background: string | null;
  family_background: string | null;
}

interface HistoryEntry {
  encounter_id: string;
  signed_at: string | null;
  status: string;
  diagnosis: string;
}

interface PatientProfile {
  patient: PatientRecord;
  history: HistoryEntry[];
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

const EMPTY_NEW_PATIENT = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  birth_date: "",
  sex: ""
};

export function Directorio({
  onOpenEncounter,
  onOpenPatient
}: {
  onOpenEncounter: (encounterId: string) => void;
  onOpenPatient: (patientId: string) => void;
}) {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [newPatient, setNewPatient] = useState(EMPTY_NEW_PATIENT);
  const [matches, setMatches] = useState<PatientSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadPatients = useCallback((term: string) => {
    call<PatientSummary[]>("list_patients", { search: term || null })
      .then(setPatients)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => loadPatients(search), 200);
    return () => clearTimeout(handle);
  }, [search, loadPatients]);

  // Al editar el formulario, descarta una advertencia de duplicado previa: los
  // candidatos se vuelven a calcular en el proximo intento de alta.
  useEffect(() => {
    setMatches(null);
  }, [newPatient]);

  async function openProfile(patientId: string) {
    setError("");
    setMessage("");
    try {
      const data = await call<PatientProfile>("get_patient_profile", { patientId });
      setProfile(data);
    } catch (e) {
      setError(String(e));
    }
  }

  async function startEncounter(patientId: string) {
    setBusy(true);
    setError("");
    try {
      const encounter = await call<{ id: string }>("open_patient_encounter", { patientId });
      onOpenEncounter(encounter.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createPatient(force: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      // Prevencion de duplicados: antes de crear, busca pacientes locales que
      // probablemente sean la misma persona. Si los hay, los muestra y deja que
      // el medico decida (abrir el existente o crear de todos modos).
      if (!force) {
        const found = await call<PatientSummary[]>("find_patient_matches", {
          email: newPatient.email || null,
          phone: newPatient.phone || null,
          firstName: newPatient.first_name,
          lastName: newPatient.last_name
        });
        if (found.length > 0) {
          setMatches(found);
          return;
        }
      }
      const created = await call<PatientRecord>("create_patient", {
        patient: {
          first_name: newPatient.first_name,
          last_name: newPatient.last_name,
          phone: newPatient.phone || null,
          email: newPatient.email || null,
          birth_date: newPatient.birth_date || null,
          sex: newPatient.sex || null
        }
      });
      setNewPatient(EMPTY_NEW_PATIENT);
      setCreating(false);
      setMatches(null);
      setMessage(`Paciente ${created.first_name} ${created.last_name} dado de alta.`);
      loadPatients(search);
      await openProfile(created.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- Ficha de un paciente ----
  if (profile) {
    const p = profile.patient;
    return (
      <section className="panel">
        <div className="button-row">
          <button className="ghost-button" onClick={() => setProfile(null)}>
            ← Directorio
          </button>
        </div>
        <div className="panel-header">
          <h2>
            {p.first_name} {p.last_name}
          </h2>
          <p>
            {p.phone ? `Tel: ${p.phone}` : "Sin telefono"}
            {p.email ? ` · ${p.email}` : ""}
            {p.birth_date ? ` · Nac: ${dateFormatter.format(new Date(p.birth_date))}` : ""}
          </p>
        </div>
        {p.allergies ? <p className="alert-allergies">Alergias: {p.allergies}</p> : null}

        {p.medical_background || p.family_background ? (
          <dl className="precheckin-list">
            {p.medical_background ? (
              <div>
                <dt>Antecedentes personales patologicos</dt>
                <dd>{p.medical_background}</dd>
              </div>
            ) : null}
            {p.family_background ? (
              <div>
                <dt>Antecedentes familiares</dt>
                <dd>{p.family_background}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="button-row">
          <button
            className="action-button"
            onClick={() => void startEncounter(p.id)}
            disabled={busy}
          >
            Iniciar consulta
          </button>
          <button className="ghost-button" onClick={() => onOpenPatient(p.id)}>
            Ver expediente
          </button>
        </div>

        <h3>Historial de consultas</h3>
        {profile.history.length === 0 ? (
          <p className="meta">Este paciente todavia no tiene consultas registradas.</p>
        ) : (
          <ul className="history-list">
            {profile.history.map((entry) => (
              <li key={entry.encounter_id}>
                <span className="meta">
                  {entry.signed_at
                    ? dateTimeFormatter.format(new Date(entry.signed_at))
                    : "(sin firmar)"}
                </span>{" "}
                {entry.diagnosis || "Sin diagnostico registrado"}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  // ---- Alta de paciente nuevo ----
  if (creating) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>Nuevo paciente</h2>
          <p>
            Da de alta a un paciente que no agendo por el portal. Queda en tu expediente
            cifrado local.
          </p>
        </div>
        {matches && matches.length > 0 ? (
          <div className="dup-warning">
            <strong>Ya existe un paciente con estos datos</strong>
            <p className="meta">
              Para no duplicar el expediente, abre el paciente existente. Si de verdad es
              otra persona, puedes crearlo de todos modos.
            </p>
            <ul className="appointment-list">
              {matches.map((m) => (
                <li key={m.id} className="list-row">
                  <button
                    type="button"
                    className="list-row-main directory-row"
                    onClick={() => void openProfile(m.id)}
                  >
                    <strong>
                      {m.first_name} {m.last_name}
                    </strong>
                    <span className="meta">
                      {m.phone ?? "Sin telefono"}
                      {m.email ? ` · ${m.email}` : ""}
                      {" · "}
                      {m.encounter_count > 0 ? `${m.encounter_count} consulta(s)` : "Sin consultas"}
                    </span>
                  </button>
                  <div className="row-actions">
                    <button className="ghost-button" onClick={() => onOpenPatient(m.id)}>
                      Abrir expediente
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="button-row">
              <button
                className="ghost-button"
                onClick={() => void createPatient(true)}
                disabled={busy}
              >
                Crear nuevo de todos modos
              </button>
            </div>
          </div>
        ) : null}

        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void createPatient(false);
          }}
        >
          <label className="field">
            <span>Nombre(s)</span>
            <input
              value={newPatient.first_name}
              disabled={busy}
              onChange={(e) =>
                setNewPatient((current) => ({ ...current, first_name: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Apellidos</span>
            <input
              value={newPatient.last_name}
              disabled={busy}
              onChange={(e) =>
                setNewPatient((current) => ({ ...current, last_name: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Telefono</span>
            <input
              value={newPatient.phone}
              disabled={busy}
              onChange={(e) => setNewPatient((current) => ({ ...current, phone: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Correo</span>
            <input
              type="email"
              value={newPatient.email}
              disabled={busy}
              onChange={(e) => setNewPatient((current) => ({ ...current, email: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Fecha de nacimiento</span>
            <input
              type="date"
              value={newPatient.birth_date}
              disabled={busy}
              onChange={(e) =>
                setNewPatient((current) => ({ ...current, birth_date: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Sexo</span>
            <select
              value={newPatient.sex}
              disabled={busy}
              onChange={(e) => setNewPatient((current) => ({ ...current, sex: e.target.value }))}
            >
              <option value="">Sin especificar</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
              <option value="O">Otro</option>
            </select>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              className="action-button"
              type="submit"
              disabled={
                busy ||
                (newPatient.first_name.trim() === "" && newPatient.last_name.trim() === "")
              }
            >
              {busy ? "Guardando…" : "Dar de alta"}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setCreating(false);
                setError("");
                setMatches(null);
              }}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </form>
      </section>
    );
  }

  // ---- Lista del directorio ----
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Directorio de pacientes</h2>
        <p>Todos los pacientes de tu expediente cifrado local.</p>
      </div>

      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="button-row directory-toolbar">
        <input
          type="search"
          placeholder="Buscar por nombre o telefono…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="action-button"
          onClick={() => {
            setMatches(null);
            setError("");
            setCreating(true);
          }}
        >
          Nuevo paciente
        </button>
      </div>

      {patients.length === 0 ? (
        <div className="empty-state">
          <strong>{search ? "Sin coincidencias" : "Sin pacientes todavia"}</strong>
          <p>
            {search
              ? "Ajusta la busqueda o da de alta un paciente nuevo."
              : "Los pacientes apareceran aqui cuando agenden por tu portal o cuando los des de alta a mano."}
          </p>
        </div>
      ) : (
        <ul className="appointment-list">
          {patients.map((patient) => (
            <li key={patient.id} className="list-row">
              <button
                type="button"
                className="list-row-main directory-row"
                onClick={() => void openProfile(patient.id)}
              >
                <strong>
                  {patient.first_name} {patient.last_name}
                </strong>
                <span className="meta">
                  {patient.phone ?? "Sin telefono"}
                  {" · "}
                  {patient.encounter_count > 0
                    ? `${patient.encounter_count} consulta(s)`
                    : "Sin consultas"}
                  {patient.last_visit
                    ? ` · Ultima: ${dateFormatter.format(new Date(patient.last_visit))}`
                    : ""}
                </span>
                {patient.allergies ? (
                  <span className="meta directory-allergy">Alergias: {patient.allergies}</span>
                ) : null}
              </button>
              <div className="row-actions">
                <button
                  className="ghost-button"
                  onClick={() => void startEncounter(patient.id)}
                  disabled={busy}
                >
                  Iniciar consulta
                </button>
                <button className="ghost-button" onClick={() => onOpenPatient(patient.id)}>
                  Expediente
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
