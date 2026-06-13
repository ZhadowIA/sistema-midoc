/**
 * Resolucion de identidad del paciente, compartida por la agenda y la
 * recepcion. Muestra los expedientes que probablemente sean la misma persona
 * (con el motivo de cada coincidencia, nombre con mas peso) para que el medico
 * vincule al correcto o confirme que es alguien nuevo, evitando duplicados.
 */

export interface PatientMatch {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  encounter_count: number;
  last_visit: string | null;
  matched_name: boolean;
  matched_phone: boolean;
  matched_email: boolean;
}

export interface ResolutionPatient {
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
}

export function matchReasons(match: PatientMatch): string {
  const reasons: string[] = [];
  if (match.matched_name) reasons.push("mismo nombre");
  if (match.matched_phone) reasons.push("mismo telefono (puede ser de un tutor)");
  if (match.matched_email) reasons.push("mismo correo (puede ser de un tutor)");
  return reasons.join(" · ");
}

export function PatientResolution({
  patient,
  candidates,
  busy,
  onLink,
  onCreateNew,
  createLabel
}: {
  patient: ResolutionPatient;
  candidates: PatientMatch[];
  busy: boolean;
  onLink: (patientId: string) => void;
  onCreateNew: () => void;
  createLabel?: string;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>¿Es un paciente que ya tienes?</h2>
        <p>
          Se trata de{" "}
          <strong>
            {patient.first_name} {patient.last_name}
          </strong>
          {patient.phone ? ` · ${patient.phone}` : ""}
          {patient.email ? ` · ${patient.email}` : ""}. Encontramos expedientes parecidos.
          Vincula con el correcto para no duplicar, o crea uno nuevo si de verdad es otra
          persona.
        </p>
      </div>
      <ul className="appointment-list">
        {candidates.map((candidate) => (
          <li key={candidate.id} className="list-row">
            <div className="list-row-main">
              <strong>
                {candidate.first_name} {candidate.last_name}
              </strong>
              <span className="meta">
                {candidate.phone ?? "Sin telefono"}
                {candidate.email ? ` · ${candidate.email}` : ""}
                {" · "}
                {candidate.encounter_count > 0
                  ? `${candidate.encounter_count} consulta(s)`
                  : "Sin consultas"}
              </span>
              <span className="meta">Coincide por: {matchReasons(candidate)}</span>
            </div>
            <div className="row-actions">
              <button
                className="action-button"
                disabled={busy}
                onClick={() => onLink(candidate.id)}
              >
                Usar este expediente
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="button-row">
        <button className="ghost-button" disabled={busy} onClick={onCreateNew}>
          {createLabel ?? "Es alguien nuevo · crear expediente"}
        </button>
      </div>
    </section>
  );
}
