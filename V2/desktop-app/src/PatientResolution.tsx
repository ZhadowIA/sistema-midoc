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
  onOpenRecord,
  onStartConsultation,
  onCreateNew,
  onClose,
  createLabel,
  closeLabel
}: {
  patient: ResolutionPatient;
  candidates: PatientMatch[];
  busy: boolean;
  onOpenRecord: (patientId: string) => void;
  onStartConsultation?: (patientId: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
  createLabel?: string;
  closeLabel?: string;
}) {
  const hasCandidates = candidates.length > 0;

  return (
    <section className="panel patient-resolution-panel">
      <div className="panel-header">
        <h2 id="patient-resolution-title">¿Es un paciente que ya tienes?</h2>
        <p>
          Se trata de{" "}
          <strong>
            {patient.first_name} {patient.last_name}
          </strong>
          {patient.phone ? ` · ${patient.phone}` : ""}
          {patient.email ? ` · ${patient.email}` : ""}.{" "}
          {hasCandidates
            ? "Encontramos expedientes parecidos. Elige el correcto o crea uno nuevo si de verdad es otra persona."
            : "No encontramos expedientes parecidos. Crea un paciente nuevo para continuar."}
        </p>
      </div>
      {hasCandidates ? (
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
                  className="ghost-button"
                  disabled={busy}
                  onClick={() => onOpenRecord(candidate.id)}
                >
                  Ir al expediente
                </button>
                {onStartConsultation ? (
                  <button
                    className="action-button"
                    disabled={busy}
                    onClick={() => onStartConsultation(candidate.id)}
                  >
                    Iniciar consulta
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <strong>No encontramos expedientes parecidos</strong>
          <p>Confirma la creacion para abrir un expediente nuevo con los datos de la cita.</p>
        </div>
      )}
      <div className="button-row">
        <button className="ghost-button" disabled={busy} onClick={onClose}>
          {closeLabel ?? "Volver a agenda"}
        </button>
        <button className="ghost-button" disabled={busy} onClick={onCreateNew}>
          {createLabel ?? "Crear nuevo paciente"}
        </button>
      </div>
    </section>
  );
}
