//! Atencion clinica integrada (paso 4): encuentros, notas SOAP versionadas,
//! recetas, antecedentes y auditoria. Todo vive en la base cifrada local;
//! nada de este modulo toca la red.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, thiserror::Error)]
pub enum ClinicalError {
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Invalid(String),
    #[error("la nota ya fue firmada y no puede modificarse")]
    AlreadySigned,
    #[error("no encontrado")]
    NotFound,
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Hash de integridad del contenido firmado: nota final + receta.
fn signature_hash(
    encounter_id: &str,
    patient_id: &str,
    note: &NoteVersion,
    prescription: &Option<String>,
) -> String {
    let canonical = serde_json::json!({
        "encounterId": encounter_id,
        "patientId": patient_id,
        "note": note.content,
        "noteVersion": note.version,
        "prescription": prescription,
    })
    .to_string();

    Sha256::digest(canonical.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn audit(
    conn: &Connection,
    entity: &str,
    entity_id: &str,
    action: &str,
    details: Option<&str>,
) -> Result<(), ClinicalError> {
    conn.execute(
        "INSERT INTO clinical_audit (entity, entity_id, action, at, details)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![entity, entity_id, action, now(), details],
    )?;
    Ok(())
}

/* ---------- Tipos ---------- */

#[derive(Debug, Serialize)]
pub struct Encounter {
    pub id: String,
    pub appointment_id: Option<String>,
    pub patient_id: String,
    pub status: String,
    pub opened_at: String,
    pub signed_at: Option<String>,
    pub signed_hash: Option<String>,
}

/// Responsable/tutor del paciente (paso 18). Entidad propia: su contacto nunca
/// se mezcla con la identidad del paciente. Solo CONTACTO, nunca clinico.
#[derive(Debug, Serialize)]
pub struct Guardian {
    pub name: String,
    pub relationship: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
}

/// Edad en años cumplidos a partir de una fecha "YYYY-MM-DD". `None` si la
/// fecha es vacia o no parsea.
pub fn age_years(birth_date: Option<&str>) -> Option<i64> {
    use chrono::Datelike;
    let raw = birth_date?.get(..10)?;
    let dob = chrono::NaiveDate::parse_from_str(raw, "%Y-%m-%d").ok()?;
    let today = chrono::Utc::now().date_naive();
    let mut years = today.year() - dob.year();
    // Resta un año si todavia no ha cumplido años este año.
    if (today.month(), today.day()) < (dob.month(), dob.day()) {
        years -= 1;
    }
    Some(years as i64)
}

/// Edad por debajo de la cual la persona es menor de edad y sus derechos los
/// ejerce un responsable/tutor (mayoria de edad legal en Mexico: 18).
pub const MINOR_AGE_THRESHOLD: i64 = 18;

/// `true` si la fecha de nacimiento corresponde a un menor de edad.
pub fn is_minor(birth_date: Option<&str>) -> bool {
    age_years(birth_date).is_some_and(|years| (0..MINOR_AGE_THRESHOLD).contains(&years))
}

/// Construye el responsable a partir de las columnas planas: solo existe si
/// tiene nombre (el resto es opcional).
pub(crate) fn guardian_from(
    name: Option<String>,
    relationship: Option<String>,
    phone: Option<String>,
    email: Option<String>,
) -> Option<Guardian> {
    name.filter(|n| !n.trim().is_empty()).map(|name| Guardian {
        name,
        relationship,
        phone,
        email,
    })
}

#[derive(Debug, Serialize)]
pub struct PatientRecord {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub birth_date: Option<String>,
    pub allergies: Option<String>,
    pub medical_background: Option<String>,
    pub family_background: Option<String>,
    pub guardian: Option<Guardian>,
    /// Derivado de la fecha de nacimiento: el paciente es menor de edad y sus
    /// derechos los ejerce su responsable (etiqueta "menor con tutor").
    pub is_minor: bool,
}

/// Columnas del expediente del paciente en el orden que espera `patient_from_row`.
/// La identidad (CONTACTO) vive en `patient_identities` y lo clinico en
/// `patients`; el expediente completo es la union de ambas (paso 27).
const PATIENT_COLUMNS: &str = "p.id, pi.first_name, pi.last_name, pi.phone, pi.email, \
    pi.birth_date, \
    p.allergies, p.medical_background, p.family_background, \
    p.guardian_name, p.guardian_relationship, p.guardian_phone, p.guardian_email";

/// Origen del expediente completo. La estacion clinica es la unica que puede
/// unir ambas tablas; la de recepcion solo tiene `patient_identities`.
const PATIENT_SOURCE: &str = "patients p JOIN patient_identities pi ON pi.id = p.id";

fn patient_from_row(row: &rusqlite::Row) -> rusqlite::Result<PatientRecord> {
    let birth_date: Option<String> = row.get(5)?;
    Ok(PatientRecord {
        id: row.get(0)?,
        first_name: row.get(1)?,
        last_name: row.get(2)?,
        phone: row.get(3)?,
        email: row.get(4)?,
        is_minor: is_minor(birth_date.as_deref()),
        birth_date,
        allergies: row.get(6)?,
        medical_background: row.get(7)?,
        family_background: row.get(8)?,
        guardian: guardian_from(row.get(9)?, row.get(10)?, row.get(11)?, row.get(12)?),
    })
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct NoteContent {
    pub subjective: String,
    pub objective: String,
    pub assessment: String,
    pub plan: String,
    pub diagnosis: String,
    pub instructions: String,
    // Plantilla de especialidad (medicina general/familiar, odontologia).
    // Blob opaco: Rust no conoce su estructura, solo lo versiona y firma.
    #[serde(default)]
    pub specialty: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct NoteVersion {
    pub version: i64,
    pub created_at: String,
    #[serde(flatten)]
    pub content: NoteContent,
}

#[derive(Debug, Serialize)]
pub struct HistoryEntry {
    pub encounter_id: String,
    pub signed_at: Option<String>,
    pub status: String,
    pub diagnosis: String,
}

#[derive(Debug, Serialize)]
pub struct EncounterDetail {
    pub encounter: Encounter,
    pub patient: PatientRecord,
    pub appointment_reason: Option<String>,
    pub appointment_start: Option<String>,
    /// Formulario de antecedentes / historia clinica que envio el paciente
    /// (sobre kind medical-history o generic). Distinto de la preconsulta IA.
    pub medical_history: Option<String>,
    /// Resultado de la preconsulta guiada por IA (sobre kind ai-preconsulta).
    pub preconsulta: Option<String>,
    pub note: Option<NoteVersion>,
    pub note_version_count: i64,
    pub prescription: Option<String>,
    pub history: Vec<HistoryEntry>,
}

/// Renglon del directorio de pacientes: datos minimos para listar/buscar mas
/// el recuento de encuentros y la fecha de la ultima visita.
#[derive(Debug, Serialize)]
pub struct PatientSummary {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub birth_date: Option<String>,
    pub allergies: Option<String>,
    pub encounter_count: i64,
    pub last_visit: Option<String>,
}

/// Ficha del paciente fuera de un encuentro: sus datos y el historial completo
/// de consultas (incluye no firmadas).
#[derive(Debug, Serialize)]
pub struct PatientProfile {
    pub patient: PatientRecord,
    pub history: Vec<HistoryEntry>,
}

#[derive(Debug, Deserialize)]
pub struct NewPatientInput {
    pub first_name: String,
    pub last_name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub birth_date: Option<String>,
    pub sex: Option<String>,
}

/// Evento de la linea del tiempo clinica del paciente, curado a mano por el
/// medico. CLINICO: vive solo en la base local cifrada.
#[derive(Debug, Serialize)]
pub struct TimelineEvent {
    pub id: String,
    pub patient_id: String,
    pub event_date: String,
    pub category: String,
    pub title: String,
    pub detail: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct TimelineEventInput {
    pub event_date: String,
    pub category: String,
    pub title: String,
    pub detail: Option<String>,
}

/* ---------- Encuentros ---------- */

fn read_encounter(conn: &Connection, encounter_id: &str) -> Result<Encounter, ClinicalError> {
    conn.query_row(
        "SELECT id, appointment_id, patient_id, status, opened_at, signed_at, signed_hash
         FROM encounters WHERE id = ?1",
        params![encounter_id],
        |row| {
            Ok(Encounter {
                id: row.get(0)?,
                appointment_id: row.get(1)?,
                patient_id: row.get(2)?,
                status: row.get(3)?,
                opened_at: row.get(4)?,
                signed_at: row.get(5)?,
                signed_hash: row.get(6)?,
            })
        },
    )
    .optional()?
    .ok_or(ClinicalError::NotFound)
}

fn ensure_open(encounter: &Encounter) -> Result<(), ClinicalError> {
    if encounter.status == "SIGNED" {
        return Err(ClinicalError::AlreadySigned);
    }
    Ok(())
}

/// Importa (si aun no existe) el expediente local del paciente de una cita a
/// partir de los datos que viajan en la propia cita, y devuelve su id. No abre
/// encuentro: lo usan tanto la apertura de encuentro como la resolucion de
/// paciente desde la agenda.
fn import_appointment_patient(
    conn: &Connection,
    appointment_id: &str,
) -> Result<String, ClinicalError> {
    #[allow(clippy::type_complexity)]
    let (patient_id, first_name, last_name, phone, email, birth_date, g_name, g_rel, g_phone, g_email): (
        Option<String>,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = conn
        .query_row(
            "SELECT patient_id, patient_first_name, patient_last_name, patient_phone, patient_email,
                    patient_birth_date, guardian_name, guardian_relationship, guardian_phone, guardian_email
             FROM appointments WHERE id = ?1",
            params![appointment_id],
            |row| {
                Ok((
                    row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?,
                    row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?,
                ))
            },
        )
        .optional()?
        .ok_or(ClinicalError::NotFound)?;

    let patient_id = patient_id.ok_or_else(|| {
        ClinicalError::Invalid("la cita no tiene paciente asociado".into())
    })?;

    // La identidad (CONTACTO) y el expediente clinico se crean por separado:
    // la primera es lo unico que la estacion de recepcion llega a ver.
    let timestamp = now();
    conn.execute(
        "INSERT INTO patient_identities
            (id, first_name, last_name, phone, email, birth_date, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(id) DO NOTHING",
        params![patient_id, first_name, last_name, phone, email, birth_date, timestamp],
    )?;

    // El responsable de la cita se conserva en el expediente como entidad propia.
    conn.execute(
        "INSERT INTO patients (id, guardian_name, guardian_relationship,
                guardian_phone, guardian_email, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO NOTHING",
        params![patient_id, g_name, g_rel, g_phone, g_email, timestamp],
    )?;

    Ok(patient_id)
}

/// Abre (o reabre, si ya existe) el encuentro clinico de una cita. La cita
/// abre el contexto del paciente: si el paciente local no existe todavia
/// (base anterior a v3), se crea desde los datos de la cita.
pub fn open_encounter_for_appointment(
    conn: &Connection,
    appointment_id: &str,
) -> Result<Encounter, ClinicalError> {
    if let Some(existing) = conn
        .query_row(
            "SELECT id FROM encounters WHERE appointment_id = ?1",
            params![appointment_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        return read_encounter(conn, &existing);
    }

    let patient_id = import_appointment_patient(conn, appointment_id)?;

    let encounter_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO encounters (id, appointment_id, patient_id, status, opened_at)
         VALUES (?1, ?2, ?3, 'OPEN', ?4)",
        params![encounter_id, appointment_id, patient_id, now()],
    )?;

    audit(conn, "encounter", &encounter_id, "opened", Some(appointment_id))?;
    read_encounter(conn, &encounter_id)
}

/// Abre un encuentro clinico para un paciente sin cita previa (consulta
/// walk-in, paso 10). Extiende el nucleo sin tocarlo: reusa la misma tabla de
/// encuentros con `appointment_id` nulo. El paciente debe existir ya.
pub fn open_encounter_for_patient(
    conn: &Connection,
    patient_id: &str,
) -> Result<Encounter, ClinicalError> {
    // La identidad es lo que existe desde recepcion; el expediente clinico nace
    // aqui, la primera vez que el medico atiende (paso 27). Un walk-in llega
    // con identidad y sin nada clinico, y esa es justo la ruta que esto abre.
    let exists: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM patient_identities WHERE id = ?1)",
        params![patient_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(ClinicalError::NotFound);
    }

    let opened_at = now();
    conn.execute(
        "INSERT INTO patients (id, created_at, updated_at) VALUES (?1, ?2, ?2)
         ON CONFLICT(id) DO NOTHING",
        params![patient_id, opened_at],
    )?;

    let encounter_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO encounters (id, appointment_id, patient_id, status, opened_at)
         VALUES (?1, NULL, ?2, 'OPEN', ?3)",
        params![encounter_id, patient_id, opened_at],
    )?;

    audit(conn, "encounter", &encounter_id, "opened", Some("walk-in"))?;
    read_encounter(conn, &encounter_id)
}

/* ---------- Atender cita: agenda -> expediente con anti-duplicados ---------- */

/// Datos de contacto del paciente tal como vienen en la cita (agenda). Se usan
/// para buscar coincidencias y, si el medico decide, crear el expediente.
#[derive(Debug, Serialize)]
pub struct AppointmentPatient {
    pub first_name: String,
    pub last_name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
}

/// Resultado de atender una cita: o ya se resolvio el paciente y hay un
/// encuentro abierto, o hay candidatos a duplicado que el medico debe revisar.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AttendOutcome {
    Encounter {
        encounter_id: String,
    },
    NeedsResolution {
        appointment_patient: AppointmentPatient,
        candidates: Vec<PatientMatch>,
    },
}

/// Resultado de resolver, desde la agenda, a que expediente pertenece una cita
/// SIN abrir un encuentro: o ya se identifico el paciente (se abre su
/// expediente), o hay candidatos a duplicado que el medico debe revisar.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ResolveOutcome {
    Patient {
        patient_id: String,
    },
    NeedsResolution {
        appointment_patient: AppointmentPatient,
        candidates: Vec<PatientMatch>,
    },
}

fn encounter_id_for_appointment(
    conn: &Connection,
    appointment_id: &str,
) -> Result<Option<String>, ClinicalError> {
    Ok(conn
        .query_row(
            "SELECT id FROM encounters WHERE appointment_id = ?1",
            params![appointment_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?)
}

fn read_appointment_patient(
    conn: &Connection,
    appointment_id: &str,
) -> Result<(Option<String>, AppointmentPatient), ClinicalError> {
    conn.query_row(
        "SELECT patient_id, patient_first_name, patient_last_name, patient_phone, patient_email
         FROM appointments WHERE id = ?1",
        params![appointment_id],
        |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                AppointmentPatient {
                    first_name: row.get(1)?,
                    last_name: row.get(2)?,
                    phone: row.get(3)?,
                    email: row.get(4)?,
                },
            ))
        },
    )
    .optional()?
    .ok_or(ClinicalError::NotFound)
}

fn lookup_patient_link(
    conn: &Connection,
    portal_patient_id: &str,
) -> Result<Option<String>, ClinicalError> {
    Ok(conn
        .query_row(
            "SELECT patient_id FROM patient_links WHERE portal_patient_id = ?1",
            params![portal_patient_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?)
}

fn patient_exists(conn: &Connection, patient_id: &str) -> Result<bool, ClinicalError> {
    Ok(conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM patients WHERE id = ?1)",
        params![patient_id],
        |row| row.get(0),
    )?)
}

/// Recuerda que el paciente del portal `portal_patient_id` corresponde al
/// expediente local `patient_id`, y reapunta a el los documentos ya
/// descargados bajo el id del portal.
fn link_portal_patient(
    conn: &Connection,
    portal_patient_id: &str,
    patient_id: &str,
) -> Result<(), ClinicalError> {
    conn.execute(
        "INSERT INTO patient_links (portal_patient_id, patient_id, linked_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(portal_patient_id) DO UPDATE SET
            patient_id = excluded.patient_id,
            linked_at = excluded.linked_at",
        params![portal_patient_id, patient_id, now()],
    )?;
    conn.execute(
        "UPDATE documents SET patient_id = ?2 WHERE patient_id = ?1",
        params![portal_patient_id, patient_id],
    )?;
    audit(conn, "patient_link", portal_patient_id, "linked", Some(patient_id))?;
    Ok(())
}

fn open_encounter_with_patient(
    conn: &Connection,
    appointment_id: &str,
    patient_id: &str,
) -> Result<Encounter, ClinicalError> {
    let encounter_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO encounters (id, appointment_id, patient_id, status, opened_at)
         VALUES (?1, ?2, ?3, 'OPEN', ?4)",
        params![encounter_id, appointment_id, patient_id, now()],
    )?;
    audit(conn, "encounter", &encounter_id, "opened", Some(appointment_id))?;
    read_encounter(conn, &encounter_id)
}

/// Atiende una cita resolviendo a que expediente pertenece, sin acoplar la
/// agenda al directorio. El orden de resolucion:
/// 1. Si la cita ya tiene un encuentro, se reabre.
/// 2. Si el medico eligio vincular a un expediente (`link_patient_id`), se
///    vincula el id del portal y se abre el encuentro sobre ese expediente.
/// 3. Si el medico eligio crear uno nuevo (`force_new`), se importa de la cita.
/// 4. En automatico: si el id del portal ya esta vinculado o ya existe como
///    expediente, se reusa; si no, se buscan duplicados. Sin candidatos, se
///    crea e ingresa directo; con candidatos, se pide al medico decidir.
pub fn attend_appointment(
    conn: &Connection,
    appointment_id: &str,
    link_patient_id: Option<&str>,
    force_new: bool,
) -> Result<AttendOutcome, ClinicalError> {
    if let Some(existing) = encounter_id_for_appointment(conn, appointment_id)? {
        return Ok(AttendOutcome::Encounter { encounter_id: existing });
    }

    let (portal_id, appt) = read_appointment_patient(conn, appointment_id)?;

    // El medico eligio vincular a un expediente existente.
    if let Some(local_id) = link_patient_id {
        if !patient_exists(conn, local_id)? {
            return Err(ClinicalError::NotFound);
        }
        if let Some(pid) = &portal_id {
            if pid != local_id {
                link_portal_patient(conn, pid, local_id)?;
            }
        }
        let encounter = open_encounter_with_patient(conn, appointment_id, local_id)?;
        return Ok(AttendOutcome::Encounter { encounter_id: encounter.id });
    }

    // El medico eligio crear un expediente nuevo desde los datos de la cita.
    if force_new {
        let encounter = open_encounter_for_appointment(conn, appointment_id)?;
        return Ok(AttendOutcome::Encounter { encounter_id: encounter.id });
    }

    // Resolucion automatica por id del portal (cuenta de paciente o vinculo ya
    // recordado): no vuelve a preguntar por la misma persona.
    if let Some(pid) = &portal_id {
        if let Some(local_id) = lookup_patient_link(conn, pid)? {
            if patient_exists(conn, &local_id)? {
                let encounter = open_encounter_with_patient(conn, appointment_id, &local_id)?;
                return Ok(AttendOutcome::Encounter { encounter_id: encounter.id });
            }
        }
        if patient_exists(conn, pid)? {
            let encounter = open_encounter_with_patient(conn, appointment_id, pid)?;
            return Ok(AttendOutcome::Encounter { encounter_id: encounter.id });
        }
    }

    // Busca duplicados con los datos de la cita (nombre con mas peso).
    let candidates = match_patients_with_reasons(
        conn,
        appt.email.as_deref(),
        appt.phone.as_deref(),
        &appt.first_name,
        &appt.last_name,
    )?;

    if candidates.is_empty() {
        // Sin coincidencias: importa los datos y entra directo.
        let encounter = open_encounter_for_appointment(conn, appointment_id)?;
        return Ok(AttendOutcome::Encounter { encounter_id: encounter.id });
    }

    Ok(AttendOutcome::NeedsResolution {
        appointment_patient: appt,
        candidates,
    })
}

/// Resuelve, desde la agenda, a que expediente pertenece una cita SIN abrir un
/// encuentro: el desenlace es abrir el expediente del paciente. Misma cascada
/// anti-duplicados que `attend_appointment`, pero en vez de crear un encuentro
/// solo asegura el expediente y devuelve su id:
/// 1. Si la cita ya tiene un encuentro, se devuelve el paciente de ese encuentro.
/// 2. Si el medico eligio vincular (`link_patient_id`), se vincula y se devuelve.
/// 3. Si eligio crear uno nuevo (`force_new`), se importa de la cita.
/// 4. En automatico: vinculo de portal recordado o expediente ya existente se
///    reusa; sin candidatos o con candidatos se pide decidir antes de crear.
pub fn resolve_appointment_patient(
    conn: &Connection,
    appointment_id: &str,
    link_patient_id: Option<&str>,
    force_new: bool,
) -> Result<ResolveOutcome, ClinicalError> {
    let (portal_id, appt) = read_appointment_patient(conn, appointment_id)?;

    // El medico eligio vincular a un expediente existente.
    if let Some(local_id) = link_patient_id {
        if !patient_exists(conn, local_id)? {
            return Err(ClinicalError::NotFound);
        }
        if let Some(pid) = &portal_id {
            if pid != local_id {
                link_portal_patient(conn, pid, local_id)?;
            }
        }
        return Ok(ResolveOutcome::Patient {
            patient_id: local_id.to_string(),
        });
    }

    // El medico eligio crear un expediente nuevo desde los datos de la cita.
    if force_new {
        let patient_id = import_appointment_patient(conn, appointment_id)?;
        return Ok(ResolveOutcome::Patient { patient_id });
    }

    // Si la cita ya tenia encuentro, el primer click en agenda sigue mostrando
    // la ventanita en vez de mandar directo a la linea del tiempo.
    if let Some(encounter_id) = encounter_id_for_appointment(conn, appointment_id)? {
        let patient_id = conn.query_row(
            "SELECT patient_id FROM encounters WHERE id = ?1",
            params![encounter_id],
            |row| row.get::<_, String>(0),
        )?;
        let mut candidates = Vec::new();
        push_resolution_candidate(conn, &mut candidates, &patient_id, &appt)?;
        return Ok(ResolveOutcome::NeedsResolution {
            appointment_patient: appt,
            candidates,
        });
    }

    // Resolucion por id del portal (cuenta de paciente o vinculo ya recordado):
    // se muestra como candidato, pero no navega automaticamente.
    let mut candidates = Vec::new();
    if let Some(pid) = &portal_id {
        if let Some(local_id) = lookup_patient_link(conn, pid)? {
            if patient_exists(conn, &local_id)? {
                push_resolution_candidate(conn, &mut candidates, &local_id, &appt)?;
            }
        }
        if patient_exists(conn, pid)? {
            push_resolution_candidate(conn, &mut candidates, pid, &appt)?;
        }
    }

    // Busca duplicados con los datos de la cita (nombre con mas peso).
    for candidate in match_patients_with_reasons(
        conn,
        appt.email.as_deref(),
        appt.phone.as_deref(),
        &appt.first_name,
        &appt.last_name,
    )? {
        if !candidates
            .iter()
            .any(|existing: &PatientMatch| existing.patient.id == candidate.patient.id)
        {
            candidates.push(candidate);
        }
    }

    Ok(ResolveOutcome::NeedsResolution {
        appointment_patient: appt,
        candidates,
    })
}

pub fn get_encounter_detail(
    conn: &Connection,
    encounter_id: &str,
) -> Result<EncounterDetail, ClinicalError> {
    let encounter = read_encounter(conn, encounter_id)?;

    let patient = conn
        .query_row(
            &format!("SELECT {PATIENT_COLUMNS} FROM {PATIENT_SOURCE} WHERE p.id = ?1"),
            params![encounter.patient_id],
            patient_from_row,
        )
        .optional()?
        .ok_or(ClinicalError::NotFound)?;

    let (appointment_reason, appointment_start, medical_history, preconsulta) =
        match &encounter.appointment_id {
            Some(appointment_id) => {
                let pair: Option<(Option<String>, String)> = conn
                    .query_row(
                        "SELECT reason, scheduled_start FROM appointments WHERE id = ?1",
                        params![appointment_id],
                        |row| Ok((row.get(0)?, row.get(1)?)),
                    )
                    .optional()?;
                // Una cita puede tener dos sobres: el formulario de antecedentes
                // (kind medical-history/generic) y la preconsulta guiada por IA
                // (kind ai-preconsulta). Se separan para no mostrarlos cruzados.
                let mut medical_history: Option<String> = None;
                let mut preconsulta: Option<String> = None;
                let mut statement = conn.prepare(
                    "SELECT responses_json, kind FROM precheckins WHERE appointment_id = ?1",
                )?;
                let rows = statement.query_map(params![appointment_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?;
                for row in rows {
                    let (responses_json, kind) = row?;
                    if kind == "ai-preconsulta" {
                        preconsulta = Some(responses_json);
                    } else {
                        medical_history = Some(responses_json);
                    }
                }
                (
                    pair.as_ref().and_then(|(reason, _)| reason.clone()),
                    pair.map(|(_, start)| start),
                    medical_history,
                    preconsulta,
                )
            }
            None => (None, None, None, None),
        };

    let note = conn
        .query_row(
            "SELECT version, created_at, subjective, objective, assessment, plan,
                    diagnosis, instructions, specialty_payload
             FROM note_versions WHERE encounter_id = ?1
             ORDER BY version DESC LIMIT 1",
            params![encounter_id],
            |row| {
                let specialty_raw: String = row.get(8)?;
                Ok(NoteVersion {
                    version: row.get(0)?,
                    created_at: row.get(1)?,
                    content: NoteContent {
                        subjective: row.get(2)?,
                        objective: row.get(3)?,
                        assessment: row.get(4)?,
                        plan: row.get(5)?,
                        diagnosis: row.get(6)?,
                        instructions: row.get(7)?,
                        specialty: serde_json::from_str(&specialty_raw).unwrap_or_default(),
                    },
                })
            },
        )
        .optional()?;

    let note_version_count: i64 = conn.query_row(
        "SELECT count(*) FROM note_versions WHERE encounter_id = ?1",
        params![encounter_id],
        |row| row.get(0),
    )?;

    let prescription: Option<String> = conn
        .query_row(
            "SELECT content FROM prescriptions WHERE encounter_id = ?1",
            params![encounter_id],
            |row| row.get(0),
        )
        .optional()?;

    // Expediente desde la cita: encuentros previos del mismo paciente con su
    // diagnostico mas reciente. Solo aparecen los que tienen algo escrito (al
    // menos una version de nota); los encuentros abiertos y vacios no ensucian
    // el historial.
    let mut statement = conn.prepare(
        "SELECT e.id, e.signed_at, e.status,
                COALESCE((SELECT diagnosis FROM note_versions n
                          WHERE n.encounter_id = e.id
                          ORDER BY n.version DESC LIMIT 1), '')
         FROM encounters e
         WHERE e.patient_id = ?1 AND e.id != ?2
           AND EXISTS (SELECT 1 FROM note_versions nv WHERE nv.encounter_id = e.id)
         ORDER BY e.opened_at DESC",
    )?;
    let history = statement
        .query_map(params![encounter.patient_id, encounter_id], |row| {
            Ok(HistoryEntry {
                encounter_id: row.get(0)?,
                signed_at: row.get(1)?,
                status: row.get(2)?,
                diagnosis: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(EncounterDetail {
        encounter,
        patient,
        appointment_reason,
        appointment_start,
        medical_history,
        preconsulta,
        note,
        note_version_count,
        prescription,
        history,
    })
}

/* ---------- Directorio de pacientes ---------- */

/// Normaliza un campo opcional de texto: recorta y convierte vacio en NULL.
fn normalize_optional(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Lista los pacientes del expediente con un filtro opcional por nombre o
/// telefono. Solo lee la base local; nada sale a la red.
pub fn list_patients(
    conn: &Connection,
    search: Option<&str>,
) -> Result<Vec<PatientSummary>, ClinicalError> {
    let like = search
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| format!("%{s}%"));

    let mut statement = conn.prepare(
        "SELECT p.id, pi.first_name, pi.last_name, pi.phone, pi.email, pi.birth_date,
                p.allergies,
                COUNT(e.id) AS encounter_count,
                MAX(e.opened_at) AS last_visit
         FROM patients p
         JOIN patient_identities pi ON pi.id = p.id
         LEFT JOIN encounters e ON e.patient_id = p.id
            AND EXISTS (SELECT 1 FROM note_versions nv WHERE nv.encounter_id = e.id)
         WHERE ?1 IS NULL
            OR pi.first_name LIKE ?1
            OR pi.last_name LIKE ?1
            OR pi.phone LIKE ?1
            OR (pi.first_name || ' ' || pi.last_name) LIKE ?1
         GROUP BY p.id
         ORDER BY pi.last_name COLLATE NOCASE, pi.first_name COLLATE NOCASE",
    )?;

    let rows = statement
        .query_map(params![like], |row| {
            Ok(PatientSummary {
                id: row.get(0)?,
                first_name: row.get(1)?,
                last_name: row.get(2)?,
                phone: row.get(3)?,
                email: row.get(4)?,
                birth_date: row.get(5)?,
                allergies: row.get(6)?,
                encounter_count: row.get(7)?,
                last_visit: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}

fn patient_summary_by_id(
    conn: &Connection,
    patient_id: &str,
) -> Result<Option<PatientSummary>, ClinicalError> {
    Ok(list_patients(conn, None)?
        .into_iter()
        .find(|patient| patient.id == patient_id))
}

fn match_flags_for_summary(
    patient: &PatientSummary,
    appt: &AppointmentPatient,
) -> (bool, bool, bool) {
    let appointment_name = normalize_name(&appt.first_name, &appt.last_name);
    let patient_name = normalize_name(&patient.first_name, &patient.last_name);
    let matched_name = !appointment_name.is_empty() && appointment_name == patient_name;

    let appointment_phone = appt
        .phone
        .as_deref()
        .map(normalize_phone)
        .filter(|phone| !phone.is_empty());
    let patient_phone = patient
        .phone
        .as_deref()
        .map(normalize_phone)
        .filter(|phone| !phone.is_empty());
    let matched_phone =
        matches!((&appointment_phone, &patient_phone), (Some(left), Some(right)) if left == right);

    let appointment_email = appt
        .email
        .as_deref()
        .map(normalize_text)
        .filter(|email| !email.is_empty());
    let patient_email = patient
        .email
        .as_deref()
        .map(normalize_text)
        .filter(|email| !email.is_empty());
    let matched_email =
        matches!((&appointment_email, &patient_email), (Some(left), Some(right)) if left == right);

    (matched_name, matched_phone, matched_email)
}

fn push_resolution_candidate(
    conn: &Connection,
    candidates: &mut Vec<PatientMatch>,
    patient_id: &str,
    appt: &AppointmentPatient,
) -> Result<(), ClinicalError> {
    if candidates
        .iter()
        .any(|candidate| candidate.patient.id == patient_id)
    {
        return Ok(());
    }

    if let Some(patient) = patient_summary_by_id(conn, patient_id)? {
        let (matched_name, matched_phone, matched_email) = match_flags_for_summary(&patient, appt);
        candidates.push(PatientMatch {
            patient,
            matched_name,
            matched_phone,
            matched_email,
        });
    }
    Ok(())
}

/// Ficha de un paciente: sus datos mas el historial de encuentros con su
/// diagnostico mas reciente, ordenado del mas nuevo al mas antiguo.
pub fn get_patient_profile(
    conn: &Connection,
    patient_id: &str,
) -> Result<PatientProfile, ClinicalError> {
    let patient = conn
        .query_row(
            &format!("SELECT {PATIENT_COLUMNS} FROM {PATIENT_SOURCE} WHERE p.id = ?1"),
            params![patient_id],
            patient_from_row,
        )
        .optional()?
        .ok_or(ClinicalError::NotFound)?;

    // Solo encuentros con algo escrito (al menos una version de nota): un
    // encuentro abierto y vacio no se registra en el historial.
    let mut statement = conn.prepare(
        "SELECT e.id, e.signed_at, e.status,
                COALESCE((SELECT diagnosis FROM note_versions n
                          WHERE n.encounter_id = e.id
                          ORDER BY n.version DESC LIMIT 1), '')
         FROM encounters e
         WHERE e.patient_id = ?1
           AND EXISTS (SELECT 1 FROM note_versions nv WHERE nv.encounter_id = e.id)
         ORDER BY e.opened_at DESC",
    )?;
    let history = statement
        .query_map(params![patient_id], |row| {
            Ok(HistoryEntry {
                encounter_id: row.get(0)?,
                signed_at: row.get(1)?,
                status: row.get(2)?,
                diagnosis: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(PatientProfile { patient, history })
}

/// Solo digitos: normaliza telefonos para comparar `614 000 1111` con
/// `6140001111`.
fn normalize_phone(value: &str) -> String {
    value.chars().filter(|c| c.is_ascii_digit()).collect()
}

fn normalize_text(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_name(first: &str, last: &str) -> String {
    format!("{} {}", normalize_text(first), normalize_text(last))
        .trim()
        .to_string()
}

/// Candidato a duplicado con la razon de la coincidencia. El nombre es la
/// senal mas fuerte (correo/telefono pueden ser de un tutor: ninos, adultos
/// mayores), asi que se etiqueta cada motivo por separado y los que coinciden
/// por nombre encabezan la lista.
#[derive(Debug, Serialize)]
pub struct PatientMatch {
    #[serde(flatten)]
    pub patient: PatientSummary,
    pub matched_name: bool,
    pub matched_phone: bool,
    pub matched_email: bool,
}

/// Busca pacientes locales que probablemente sean la misma persona, con la
/// razon de cada coincidencia. Coincide por nombre completo, telefono o correo
/// normalizados. No fusiona ni descarta nada: solo propone candidatos.
pub fn match_patients_with_reasons(
    conn: &Connection,
    email: Option<&str>,
    phone: Option<&str>,
    first_name: &str,
    last_name: &str,
) -> Result<Vec<PatientMatch>, ClinicalError> {
    let email_n = email.map(normalize_text).filter(|s| !s.is_empty());
    let phone_n = phone.map(normalize_phone).filter(|s| !s.is_empty());
    let name_n = {
        let n = normalize_name(first_name, last_name);
        if n.is_empty() {
            None
        } else {
            Some(n)
        }
    };

    if email_n.is_none() && phone_n.is_none() && name_n.is_none() {
        return Ok(Vec::new());
    }

    let candidates = list_patients(conn, None)?;
    let mut matches: Vec<PatientMatch> = candidates
        .into_iter()
        .filter_map(|p| {
            let p_email = p.email.as_deref().map(normalize_text).filter(|s| !s.is_empty());
            let p_phone = p.phone.as_deref().map(normalize_phone).filter(|s| !s.is_empty());
            let p_name = normalize_name(&p.first_name, &p.last_name);

            let matched_email = matches!((&email_n, &p_email), (Some(e), Some(pe)) if e == pe);
            let matched_phone = matches!((&phone_n, &p_phone), (Some(ph), Some(pp)) if ph == pp);
            let matched_name =
                name_n.as_ref().is_some_and(|n| !p_name.is_empty() && n == &p_name);

            if matched_name || matched_phone || matched_email {
                Some(PatientMatch {
                    patient: p,
                    matched_name,
                    matched_phone,
                    matched_email,
                })
            } else {
                None
            }
        })
        .collect();

    // El nombre pesa mas: los candidatos que coinciden por nombre van primero.
    matches.sort_by_key(|m| std::cmp::Reverse(m.matched_name));
    Ok(matches)
}

/// Igual que [`match_patients_with_reasons`] pero devolviendo solo el resumen
/// del paciente (lo usa el alta manual del directorio).
pub fn find_patient_matches(
    conn: &Connection,
    email: Option<&str>,
    phone: Option<&str>,
    first_name: &str,
    last_name: &str,
) -> Result<Vec<PatientSummary>, ClinicalError> {
    Ok(match_patients_with_reasons(conn, email, phone, first_name, last_name)?
        .into_iter()
        .map(|m| m.patient)
        .collect())
}

/// Da de alta un paciente capturado a mano (no llego por una cita del portal).
/// El paciente queda en el expediente cifrado local, listo para abrir una
/// consulta walk-in desde el directorio.
pub fn create_patient(
    conn: &Connection,
    input: &NewPatientInput,
) -> Result<PatientRecord, ClinicalError> {
    let first_name = input.first_name.trim().to_string();
    let last_name = input.last_name.trim().to_string();
    if first_name.is_empty() && last_name.is_empty() {
        return Err(ClinicalError::Invalid(
            "el paciente necesita al menos un nombre o apellido".into(),
        ));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let phone = normalize_optional(&input.phone);
    let email = normalize_optional(&input.email);
    let birth_date = normalize_optional(&input.birth_date);
    let sex = normalize_optional(&input.sex);

    let timestamp = now();
    conn.execute(
        "INSERT INTO patient_identities
            (id, first_name, last_name, phone, email, birth_date, sex, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        params![id, first_name, last_name, phone, email, birth_date, sex, timestamp],
    )?;
    conn.execute(
        "INSERT INTO patients (id, created_at, updated_at) VALUES (?1, ?2, ?2)",
        params![id, timestamp],
    )?;

    audit(conn, "patient", &id, "created", Some("manual"))?;

    Ok(PatientRecord {
        id,
        first_name,
        last_name,
        phone,
        email,
        is_minor: is_minor(birth_date.as_deref()),
        birth_date,
        allergies: None,
        medical_background: None,
        family_background: None,
        guardian: None,
    })
}

/* ---------- Linea del tiempo clinica ---------- */

const TIMELINE_CATEGORIES: &[&str] =
    &["NOTE", "DIAGNOSIS", "PROCEDURE", "MEDICATION", "LAB", "ALERT", "MILESTONE"];

fn validate_timeline_input(input: &TimelineEventInput) -> Result<String, ClinicalError> {
    if input.title.trim().is_empty() {
        return Err(ClinicalError::Invalid("el evento necesita un titulo".into()));
    }
    if input.event_date.trim().is_empty() {
        return Err(ClinicalError::Invalid("el evento necesita una fecha".into()));
    }
    let category = input.category.trim().to_uppercase();
    let category = if category.is_empty() {
        "NOTE".to_string()
    } else if TIMELINE_CATEGORIES.contains(&category.as_str()) {
        category
    } else {
        return Err(ClinicalError::Invalid(format!(
            "categoria de evento no valida: {category}"
        )));
    };
    Ok(category)
}

fn read_timeline_event(conn: &Connection, event_id: &str) -> Result<TimelineEvent, ClinicalError> {
    conn.query_row(
        "SELECT id, patient_id, event_date, category, title, detail, created_at, updated_at
         FROM timeline_events WHERE id = ?1",
        params![event_id],
        |row| {
            Ok(TimelineEvent {
                id: row.get(0)?,
                patient_id: row.get(1)?,
                event_date: row.get(2)?,
                category: row.get(3)?,
                title: row.get(4)?,
                detail: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )
    .optional()?
    .ok_or(ClinicalError::NotFound)
}

/// Lista la linea del tiempo de un paciente, del evento mas reciente al mas
/// antiguo (por fecha clinica capturada por el medico).
pub fn list_timeline_events(
    conn: &Connection,
    patient_id: &str,
) -> Result<Vec<TimelineEvent>, ClinicalError> {
    let mut statement = conn.prepare(
        "SELECT id, patient_id, event_date, category, title, detail, created_at, updated_at
         FROM timeline_events
         WHERE patient_id = ?1
         ORDER BY event_date DESC, created_at DESC",
    )?;
    let rows = statement
        .query_map(params![patient_id], |row| {
            Ok(TimelineEvent {
                id: row.get(0)?,
                patient_id: row.get(1)?,
                event_date: row.get(2)?,
                category: row.get(3)?,
                title: row.get(4)?,
                detail: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Agrega un evento a la linea del tiempo de un paciente existente.
pub fn add_timeline_event(
    conn: &Connection,
    patient_id: &str,
    input: &TimelineEventInput,
) -> Result<TimelineEvent, ClinicalError> {
    let category = validate_timeline_input(input)?;

    let patient_exists: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM patients WHERE id = ?1)",
        params![patient_id],
        |row| row.get(0),
    )?;
    if !patient_exists {
        return Err(ClinicalError::NotFound);
    }

    let id = uuid::Uuid::new_v4().to_string();
    let detail = normalize_optional(&input.detail);
    conn.execute(
        "INSERT INTO timeline_events
            (id, patient_id, event_date, category, title, detail, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            id,
            patient_id,
            input.event_date.trim(),
            category,
            input.title.trim(),
            detail,
            now()
        ],
    )?;

    audit(conn, "timeline_event", &id, "created", Some(&category))?;
    read_timeline_event(conn, &id)
}

/// Modifica un evento existente de la linea del tiempo.
pub fn update_timeline_event(
    conn: &Connection,
    event_id: &str,
    input: &TimelineEventInput,
) -> Result<TimelineEvent, ClinicalError> {
    let category = validate_timeline_input(input)?;
    let detail = normalize_optional(&input.detail);

    let changed = conn.execute(
        "UPDATE timeline_events
         SET event_date = ?2, category = ?3, title = ?4, detail = ?5, updated_at = ?6
         WHERE id = ?1",
        params![
            event_id,
            input.event_date.trim(),
            category,
            input.title.trim(),
            detail,
            now()
        ],
    )?;
    if changed == 0 {
        return Err(ClinicalError::NotFound);
    }

    audit(conn, "timeline_event", event_id, "updated", None)?;
    read_timeline_event(conn, event_id)
}

/// Elimina un evento de la linea del tiempo.
pub fn delete_timeline_event(conn: &Connection, event_id: &str) -> Result<(), ClinicalError> {
    let changed = conn.execute(
        "DELETE FROM timeline_events WHERE id = ?1",
        params![event_id],
    )?;
    if changed == 0 {
        return Err(ClinicalError::NotFound);
    }

    audit(conn, "timeline_event", event_id, "deleted", None)?;
    Ok(())
}

/* ---------- Nota SOAP, receta y antecedentes ---------- */

#[derive(Debug, Serialize, Clone)]
pub struct PatientMedicalHistoryVersion {
    pub id: String,
    pub patient_id: String,
    pub version: i64,
    pub payload_json: String,
    pub source: String,
    pub encounter_id: Option<String>,
    pub source_appointment_id: Option<String>,
    pub reconciled_source_hash: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SavePatientMedicalHistoryInput {
    pub payload_json: String,
    pub source: String,
    pub encounter_id: Option<String>,
    pub source_appointment_id: Option<String>,
    pub reconciled_source_hash: Option<String>,
    pub ai_run_id: Option<String>,
}

pub fn medical_history_source_hash(payload_json: &str) -> String {
    Sha256::digest(payload_json.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn medical_history_version_from_row(
    row: &rusqlite::Row,
) -> rusqlite::Result<PatientMedicalHistoryVersion> {
    Ok(PatientMedicalHistoryVersion {
        id: row.get(0)?,
        patient_id: row.get(1)?,
        version: row.get(2)?,
        payload_json: row.get(3)?,
        source: row.get(4)?,
        encounter_id: row.get(5)?,
        source_appointment_id: row.get(6)?,
        reconciled_source_hash: row.get(7)?,
        created_at: row.get(8)?,
    })
}

pub fn latest_patient_medical_history(
    conn: &Connection,
    patient_id: &str,
) -> Result<Option<PatientMedicalHistoryVersion>, ClinicalError> {
    conn.query_row(
        "SELECT id, patient_id, version, payload_json, source, encounter_id,
                source_appointment_id, reconciled_source_hash, created_at
         FROM patient_medical_history_versions
         WHERE patient_id = ?1
         ORDER BY version DESC
         LIMIT 1",
        params![patient_id],
        medical_history_version_from_row,
    )
    .optional()
    .map_err(ClinicalError::from)
}

pub fn save_patient_medical_history_version(
    conn: &mut Connection,
    patient_id: &str,
    input: &SavePatientMedicalHistoryInput,
) -> Result<PatientMedicalHistoryVersion, ClinicalError> {
    serde_json::from_str::<serde_json::Value>(&input.payload_json)
        .map_err(|_| ClinicalError::Invalid("antecedentes invalidos".into()))?;
    if !matches!(
        input.source.as_str(),
        "DOCTOR_EDIT" | "PATIENT_INITIAL" | "PATIENT_RECONCILIATION"
    ) {
        return Err(ClinicalError::Invalid(
            "fuente de antecedentes invalida".into(),
        ));
    }
    let patient_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM patients WHERE id = ?1)",
        params![patient_id],
        |row| row.get(0),
    )?;
    if !patient_exists {
        return Err(ClinicalError::NotFound);
    }
    if let Some(encounter_id) = &input.encounter_id {
        let encounter = read_encounter(conn, encounter_id)?;
        if encounter.patient_id != patient_id {
            return Err(ClinicalError::Invalid(
                "el encuentro no pertenece al paciente".into(),
            ));
        }
        ensure_open(&encounter)?;
    }
    if let Some(ai_run_id) = input.ai_run_id.as_deref() {
        let valid_run: bool = conn.query_row(
            "SELECT EXISTS(
                SELECT 1 FROM ai_runs
                WHERE id = ?1 AND patient_id = ?2 AND encounter_id = ?3
                  AND usage_type = 'CLINICAL_AID'
             )",
            params![ai_run_id, patient_id, input.encounter_id],
            |row| row.get(0),
        )?;
        if !valid_run || input.source != "DOCTOR_EDIT" {
            return Err(ClinicalError::Invalid(
                "la propuesta IA no corresponde al paciente y encuentro".into(),
            ));
        }
    }
    if let (Some(appointment_id), Some(expected_hash)) = (
        input.source_appointment_id.as_deref(),
        input.reconciled_source_hash.as_deref(),
    ) {
        let current_payload: Option<String> = conn
            .query_row(
                "SELECT responses_json FROM precheckins
                 WHERE appointment_id = ?1 AND kind IN ('medical-history', 'generic')
                 ORDER BY CASE kind WHEN 'medical-history' THEN 0 ELSE 1 END
                 LIMIT 1",
                params![appointment_id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(current_payload) = current_payload else {
            return Err(ClinicalError::Invalid(
                "el cuestionario del paciente ya no esta disponible".into(),
            ));
        };
        if medical_history_source_hash(&current_payload) != expected_hash {
            return Err(ClinicalError::Invalid(
                "el cuestionario del paciente cambio; recarga antes de guardar".into(),
            ));
        }
    }

    let tx = conn.transaction()?;
    let next_version: i64 = tx.query_row(
        "SELECT COALESCE(MAX(version), 0) + 1
         FROM patient_medical_history_versions WHERE patient_id = ?1",
        params![patient_id],
        |row| row.get(0),
    )?;
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now();
    tx.execute(
        "INSERT INTO patient_medical_history_versions (
            id, patient_id, version, payload_json, source, encounter_id,
            source_appointment_id, reconciled_source_hash, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            id,
            patient_id,
            next_version,
            input.payload_json,
            input.source,
            input.encounter_id,
            input.source_appointment_id,
            input.reconciled_source_hash,
            created_at
        ],
    )?;
    audit(
        &tx,
        "patient_medical_history",
        patient_id,
        "version-saved",
        Some(&format!(
            "v{next_version};source={};ai_run_id={}",
            input.source,
            input.ai_run_id.as_deref().unwrap_or("none")
        )),
    )?;
    tx.commit()?;

    Ok(PatientMedicalHistoryVersion {
        id,
        patient_id: patient_id.to_string(),
        version: next_version,
        payload_json: input.payload_json.clone(),
        source: input.source.clone(),
        encounter_id: input.encounter_id.clone(),
        source_appointment_id: input.source_appointment_id.clone(),
        reconciled_source_hash: input.reconciled_source_hash.clone(),
        created_at,
    })
}

pub fn save_note(
    conn: &Connection,
    encounter_id: &str,
    content: &NoteContent,
) -> Result<i64, ClinicalError> {
    let encounter = read_encounter(conn, encounter_id)?;
    ensure_open(&encounter)?;

    let next_version: i64 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) + 1 FROM note_versions WHERE encounter_id = ?1",
        params![encounter_id],
        |row| row.get(0),
    )?;

    let specialty_payload =
        serde_json::to_string(&content.specialty).unwrap_or_else(|_| "{}".to_string());

    conn.execute(
        "INSERT INTO note_versions
            (encounter_id, version, subjective, objective, assessment, plan,
             diagnosis, instructions, specialty_payload, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            encounter_id,
            next_version,
            content.subjective,
            content.objective,
            content.assessment,
            content.plan,
            content.diagnosis,
            content.instructions,
            specialty_payload,
            now()
        ],
    )?;

    audit(
        conn,
        "note",
        encounter_id,
        "version-saved",
        Some(&format!("v{next_version}")),
    )?;
    Ok(next_version)
}

pub fn save_prescription(
    conn: &Connection,
    encounter_id: &str,
    content: &str,
) -> Result<(), ClinicalError> {
    let encounter = read_encounter(conn, encounter_id)?;
    ensure_open(&encounter)?;

    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM prescriptions WHERE encounter_id = ?1",
            params![encounter_id],
            |row| row.get(0),
        )
        .optional()?;

    match existing {
        Some(id) => {
            conn.execute(
                "UPDATE prescriptions SET content = ?2, created_at = ?3 WHERE id = ?1",
                params![id, content, now()],
            )?;
        }
        None => {
            conn.execute(
                "INSERT INTO prescriptions (id, encounter_id, content, created_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![uuid::Uuid::new_v4().to_string(), encounter_id, content, now()],
            )?;
        }
    }

    audit(conn, "prescription", encounter_id, "saved", None)?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct PatientBackgroundInput {
    pub allergies: Option<String>,
    pub medical_background: Option<String>,
    pub family_background: Option<String>,
    pub birth_date: Option<String>,
}

pub fn update_patient_background(
    conn: &Connection,
    patient_id: &str,
    input: &PatientBackgroundInput,
) -> Result<(), ClinicalError> {
    // Los antecedentes son CLINICO; la fecha de nacimiento es identidad y vive
    // del otro lado de la frontera, asi que se actualiza por separado.
    let timestamp = now();
    let changed = conn.execute(
        "UPDATE patients
         SET allergies = ?2, medical_background = ?3, family_background = ?4,
             updated_at = ?5
         WHERE id = ?1",
        params![
            patient_id,
            input.allergies,
            input.medical_background,
            input.family_background,
            timestamp
        ],
    )?;

    conn.execute(
        "UPDATE patient_identities SET birth_date = ?2, updated_at = ?3 WHERE id = ?1",
        params![patient_id, input.birth_date, timestamp],
    )?;

    if changed == 0 {
        return Err(ClinicalError::NotFound);
    }

    audit(conn, "patient", patient_id, "background-updated", None)?;
    Ok(())
}

/* ---------- Firma y cierre ---------- */

/// Firma y cierra el encuentro. El hash SHA-256 del contenido final (nota +
/// receta) queda guardado como evidencia de integridad: cualquier alteracion
/// posterior del contenido ya no coincide con la firma.
pub fn sign_encounter(conn: &Connection, encounter_id: &str) -> Result<Encounter, ClinicalError> {
    let encounter = read_encounter(conn, encounter_id)?;
    ensure_open(&encounter)?;

    let detail = get_encounter_detail(conn, encounter_id)?;
    let note = detail
        .note
        .ok_or_else(|| ClinicalError::Invalid("no se puede firmar un encuentro sin nota".into()))?;

    let hash = signature_hash(encounter_id, &encounter.patient_id, &note, &detail.prescription);

    conn.execute(
        "UPDATE encounters SET status = 'SIGNED', signed_at = ?2, signed_hash = ?3 WHERE id = ?1",
        params![encounter_id, now(), hash],
    )?;

    audit(conn, "encounter", encounter_id, "signed", Some(&hash))?;
    read_encounter(conn, encounter_id)
}

/// Recalcula el hash de un encuentro firmado y lo compara con la firma
/// guardada. `true` = el contenido no ha sido alterado desde la firma.
pub fn verify_signature(conn: &Connection, encounter_id: &str) -> Result<bool, ClinicalError> {
    let encounter = read_encounter(conn, encounter_id)?;
    let Some(stored_hash) = encounter.signed_hash.clone() else {
        return Ok(false);
    };

    let detail = get_encounter_detail(conn, encounter_id)?;
    let Some(note) = detail.note else {
        return Ok(false);
    };

    let hash = signature_hash(encounter_id, &encounter.patient_id, &note, &detail.prescription);

    Ok(hash == stored_hash)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;
    use rusqlite::params;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-clinical-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        open_encrypted(&path, "clave-de-prueba").unwrap()
    }

    fn seed_appointment(conn: &Connection, appointment_id: &str, patient_id: &str) {
        conn.execute(
            "INSERT INTO appointments (id, status, scheduled_start, scheduled_end,
                service_name, reason, patient_id, patient_first_name,
                patient_last_name, patient_phone, updated_at)
             VALUES (?1, 'CONFIRMED', '2026-06-22T15:00:00Z', '2026-06-22T15:30:00Z',
                'Consulta', 'Dolor lumbar', ?2, 'Hugo', 'Paz', '6140001111', '0')",
            params![appointment_id, patient_id],
        )
        .unwrap();
    }

    #[test]
    fn opens_encounter_once_per_appointment_and_creates_patient() {
        let conn = test_conn("open");
        seed_appointment(&conn, "appt-1", "pat-1");

        let first = open_encounter_for_appointment(&conn, "appt-1").unwrap();
        let second = open_encounter_for_appointment(&conn, "appt-1").unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(first.status, "OPEN");

        let detail = get_encounter_detail(&conn, &first.id).unwrap();
        assert_eq!(detail.patient.first_name, "Hugo");
        assert_eq!(detail.appointment_reason.as_deref(), Some("Dolor lumbar"));
    }

    #[test]
    fn minor_is_derived_from_birth_date() {
        use chrono::Datelike;
        let year = chrono::Utc::now().year();
        let a_minor = format!("{}-01-01", year - 8);
        let an_adult = format!("{}-01-01", year - 40);
        // Justo en el limite: alguien que cumple exactamente 18 ya es mayor.
        let just_eighteen = format!("{}-01-01", year - MINOR_AGE_THRESHOLD as i32);

        assert!(is_minor(Some(&a_minor)));
        assert!(!is_minor(Some(&an_adult)));
        assert!(!is_minor(Some(&just_eighteen)));
        // Sin fecha o invalida: no se puede afirmar que sea menor.
        assert!(!is_minor(None));
        assert!(!is_minor(Some("")));
        assert!(!is_minor(Some("fecha-mala")));
    }

    #[test]
    fn importing_a_minor_from_an_appointment_keeps_the_guardian_in_the_record() {
        let conn = test_conn("guardian-import");
        conn.execute(
            "INSERT INTO appointments (id, status, scheduled_start, scheduled_end,
                service_name, reason, patient_id, patient_first_name, patient_last_name,
                patient_phone, patient_birth_date, guardian_name, guardian_relationship,
                guardian_phone, guardian_email, updated_at)
             VALUES ('appt-m', 'CONFIRMED', '2026-07-01T15:00:00Z', '2026-07-01T15:30:00Z',
                'Consulta', 'Control', 'pat-m', 'Lucia', 'Paz', '6140002222', '2018-03-04',
                'Hugo Paz', 'Padre', '6140002222', 'hugo@example.com', '0')",
            [],
        )
        .unwrap();

        let encounter = open_encounter_for_appointment(&conn, "appt-m").unwrap();
        let detail = get_encounter_detail(&conn, &encounter.id).unwrap();

        // La identidad es la del menor; el responsable es entidad propia.
        assert_eq!(detail.patient.first_name, "Lucia");
        assert_eq!(detail.patient.birth_date.as_deref(), Some("2018-03-04"));
        let guardian = detail.patient.guardian.expect("el responsable debe viajar");
        assert_eq!(guardian.name, "Hugo Paz");
        assert_eq!(guardian.relationship.as_deref(), Some("Padre"));
        assert_eq!(guardian.email.as_deref(), Some("hugo@example.com"));

        // El paciente sin responsable no inventa uno.
        let profile = get_patient_profile(&conn, "pat-m").unwrap();
        assert!(profile.patient.guardian.is_some());
    }

    #[test]
    fn note_versions_increment_and_latest_wins() {
        let conn = test_conn("versions");
        seed_appointment(&conn, "appt-2", "pat-2");
        let encounter = open_encounter_for_appointment(&conn, "appt-2").unwrap();

        let v1 = save_note(
            &conn,
            &encounter.id,
            &NoteContent {
                subjective: "Dolor".into(),
                diagnosis: "Lumbalgia".into(),
                ..Default::default()
            },
        )
        .unwrap();
        let v2 = save_note(
            &conn,
            &encounter.id,
            &NoteContent {
                subjective: "Dolor irradiado".into(),
                diagnosis: "Lumbalgia mecanica".into(),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!((v1, v2), (1, 2));

        let detail = get_encounter_detail(&conn, &encounter.id).unwrap();
        assert_eq!(detail.note.as_ref().unwrap().version, 2);
        assert_eq!(detail.note.unwrap().content.diagnosis, "Lumbalgia mecanica");
        assert_eq!(detail.note_version_count, 2);
    }

    #[test]
    fn signing_freezes_the_encounter_and_verifies_integrity() {
        let conn = test_conn("sign");
        seed_appointment(&conn, "appt-3", "pat-3");
        let encounter = open_encounter_for_appointment(&conn, "appt-3").unwrap();

        // No se firma sin nota.
        assert!(matches!(
            sign_encounter(&conn, &encounter.id),
            Err(ClinicalError::Invalid(_))
        ));

        save_note(
            &conn,
            &encounter.id,
            &NoteContent {
                diagnosis: "Lumbalgia".into(),
                plan: "AINEs 5 dias".into(),
                ..Default::default()
            },
        )
        .unwrap();
        save_prescription(&conn, &encounter.id, "Naproxeno 250mg c/12h x5d").unwrap();

        let signed = sign_encounter(&conn, &encounter.id).unwrap();
        assert_eq!(signed.status, "SIGNED");
        assert!(signed.signed_hash.is_some());

        // Congelado: nota y receta rechazadas tras la firma.
        assert!(matches!(
            save_note(&conn, &encounter.id, &NoteContent::default()),
            Err(ClinicalError::AlreadySigned)
        ));
        assert!(matches!(
            save_prescription(&conn, &encounter.id, "otra"),
            Err(ClinicalError::AlreadySigned)
        ));

        // La firma verifica; si alguien altera el contenido, deja de verificar.
        assert!(verify_signature(&conn, &encounter.id).unwrap());
        conn.execute(
            "UPDATE note_versions SET diagnosis = 'alterado' WHERE encounter_id = ?1",
            params![encounter.id],
        )
        .unwrap();
        assert!(!verify_signature(&conn, &encounter.id).unwrap());
    }

    #[test]
    fn patient_background_updates_and_history_lists_other_encounters() {
        let conn = test_conn("history");
        seed_appointment(&conn, "appt-4", "pat-4");
        seed_appointment(&conn, "appt-5", "pat-4");

        let first = open_encounter_for_appointment(&conn, "appt-4").unwrap();
        save_note(
            &conn,
            &first.id,
            &NoteContent {
                diagnosis: "Gastritis".into(),
                ..Default::default()
            },
        )
        .unwrap();
        sign_encounter(&conn, &first.id).unwrap();

        let second = open_encounter_for_appointment(&conn, "appt-5").unwrap();

        update_patient_background(
            &conn,
            "pat-4",
            &PatientBackgroundInput {
                allergies: Some("Penicilina".into()),
                medical_background: Some("HTA en tratamiento".into()),
                family_background: None,
                birth_date: Some("1980-04-12".into()),
            },
        )
        .unwrap();

        let detail = get_encounter_detail(&conn, &second.id).unwrap();
        assert_eq!(detail.patient.allergies.as_deref(), Some("Penicilina"));
        assert_eq!(detail.history.len(), 1);
        assert_eq!(detail.history[0].diagnosis, "Gastritis");
        assert_eq!(detail.history[0].status, "SIGNED");

        // La auditoria registro los eventos criticos.
        let audit_count: i64 = conn
            .query_row("SELECT count(*) FROM clinical_audit", [], |row| row.get(0))
            .unwrap();
        assert!(audit_count >= 5, "se esperaban >=5 eventos, hubo {audit_count}");
    }

    #[test]
    fn patient_medical_history_versions_increment_and_keep_precheckin_immutable() {
        let mut conn = test_conn("patient-medical-history");
        seed_appointment(&conn, "appt-mh", "pat-mh");
        let encounter = open_encounter_for_appointment(&conn, "appt-mh").unwrap();
        let patient_payload = r#"{"allergies":"Penicilina","identification":{"estado":"Jalisco"}}"#;
        conn.execute(
            "INSERT INTO precheckins (appointment_id, responses_json, kind, received_at)
             VALUES (?1, ?2, 'medical-history', '2026-06-19T15:00:00Z')",
            params!["appt-mh", patient_payload],
        )
        .unwrap();
        let source_hash = medical_history_source_hash(patient_payload);

        let first = save_patient_medical_history_version(
            &mut conn,
            "pat-mh",
            &SavePatientMedicalHistoryInput {
                payload_json: r#"{"allergies":"Penicilina"}"#.into(),
                source: "PATIENT_INITIAL".into(),
                encounter_id: Some(encounter.id.clone()),
                source_appointment_id: Some("appt-mh".into()),
                reconciled_source_hash: Some(source_hash.clone()),
                ai_run_id: None,
            },
        )
        .unwrap();
        let second = save_patient_medical_history_version(
            &mut conn,
            "pat-mh",
            &SavePatientMedicalHistoryInput {
                payload_json: r#"{"allergies":"Sulfas"}"#.into(),
                source: "DOCTOR_EDIT".into(),
                encounter_id: Some(encounter.id),
                source_appointment_id: Some("appt-mh".into()),
                reconciled_source_hash: Some(source_hash),
                ai_run_id: None,
            },
        )
        .unwrap();

        assert_eq!(first.version, 1);
        assert_eq!(second.version, 2);
        assert_eq!(
            latest_patient_medical_history(&conn, "pat-mh")
                .unwrap()
                .unwrap()
                .payload_json,
            r#"{"allergies":"Sulfas"}"#
        );
        let original: String = conn
            .query_row(
                "SELECT responses_json FROM precheckins
                 WHERE appointment_id = 'appt-mh' AND kind = 'medical-history'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(original, patient_payload);
        let audit_details: String = conn
            .query_row(
                "SELECT details FROM clinical_audit
                 WHERE entity = 'patient_medical_history'
                 ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!audit_details.contains("Sulfas"));
    }

    #[test]
    fn patient_medical_history_rejects_unknown_patient_and_signed_encounter() {
        let mut conn = test_conn("patient-medical-history-guards");
        let input = SavePatientMedicalHistoryInput {
            payload_json: "{}".into(),
            source: "DOCTOR_EDIT".into(),
            encounter_id: None,
            source_appointment_id: None,
            reconciled_source_hash: None,
            ai_run_id: None,
        };
        assert!(matches!(
            save_patient_medical_history_version(&mut conn, "missing", &input),
            Err(ClinicalError::NotFound)
        ));

        seed_appointment(&conn, "appt-signed-mh", "pat-signed-mh");
        let encounter = open_encounter_for_appointment(&conn, "appt-signed-mh").unwrap();
        save_note(&conn, &encounter.id, &NoteContent::default()).unwrap();
        sign_encounter(&conn, &encounter.id).unwrap();
        let signed_input = SavePatientMedicalHistoryInput {
            encounter_id: Some(encounter.id),
            ..input
        };
        assert!(matches!(
            save_patient_medical_history_version(&mut conn, "pat-signed-mh", &signed_input),
            Err(ClinicalError::AlreadySigned)
        ));
    }

    #[test]
    fn specialty_payload_roundtrips_and_is_covered_by_signature() {
        let conn = test_conn("specialty");
        seed_appointment(&conn, "appt-6", "pat-6");
        let encounter = open_encounter_for_appointment(&conn, "appt-6").unwrap();

        // Plantilla de medicina general como blob opaco.
        save_note(
            &conn,
            &encounter.id,
            &NoteContent {
                diagnosis: "Sano".into(),
                specialty: serde_json::json!({
                    "riskFactors": "Tabaquismo, sedentarismo",
                    "preventivePlan": "Cesacion tabaquica, actividad fisica 150 min/sem"
                }),
                ..Default::default()
            },
        )
        .unwrap();

        // El payload regresa intacto desde la base cifrada.
        let detail = get_encounter_detail(&conn, &encounter.id).unwrap();
        let specialty = &detail.note.as_ref().unwrap().content.specialty;
        assert_eq!(specialty["riskFactors"], "Tabaquismo, sedentarismo");

        sign_encounter(&conn, &encounter.id).unwrap();
        assert!(verify_signature(&conn, &encounter.id).unwrap());

        // Alterar el payload de especialidad rompe la firma (esta cubierto).
        conn.execute(
            "UPDATE note_versions
             SET specialty_payload = '{\"riskFactors\":\"alterado\"}'
             WHERE encounter_id = ?1",
            params![encounter.id],
        )
        .unwrap();
        assert!(!verify_signature(&conn, &encounter.id).unwrap());
    }

    #[test]
    fn directory_creates_searches_and_profiles_patients() {
        let conn = test_conn("directory");

        // Alta manual: el paciente queda en el expediente local.
        let created = create_patient(
            &conn,
            &NewPatientInput {
                first_name: " Ana ".into(),
                last_name: "Lopez".into(),
                phone: Some(" 614 555 0000 ".into()),
                email: Some("".into()),
                birth_date: Some("1992-07-01".into()),
                sex: Some("F".into()),
            },
        )
        .unwrap();
        assert_eq!(created.first_name, "Ana"); // recortado
        assert_eq!(created.phone.as_deref(), Some("614 555 0000"));
        assert_eq!(created.email, None); // vacio -> NULL

        // Un paciente sin nombre ni apellido es invalido.
        assert!(matches!(
            create_patient(
                &conn,
                &NewPatientInput {
                    first_name: "  ".into(),
                    last_name: "".into(),
                    phone: None,
                    email: None,
                    birth_date: None,
                    sex: None,
                },
            ),
            Err(ClinicalError::Invalid(_))
        ));

        // Una consulta walk-in para el paciente aparece en su ficha.
        let encounter = open_encounter_for_patient(&conn, &created.id).unwrap();
        save_note(
            &conn,
            &encounter.id,
            &NoteContent {
                diagnosis: "Migrana".into(),
                ..Default::default()
            },
        )
        .unwrap();

        // El directorio lista a Ana con su recuento de consultas.
        let all = list_patients(&conn, None).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].encounter_count, 1);
        assert!(all[0].last_visit.is_some());

        // La busqueda filtra por nombre y por telefono.
        assert_eq!(list_patients(&conn, Some("ana")).unwrap().len(), 1);
        assert_eq!(list_patients(&conn, Some("555")).unwrap().len(), 1);
        assert_eq!(list_patients(&conn, Some("zzz")).unwrap().len(), 0);

        // La ficha trae los datos y el historial del paciente.
        let profile = get_patient_profile(&conn, &created.id).unwrap();
        assert_eq!(profile.patient.last_name, "Lopez");
        assert_eq!(profile.history.len(), 1);
        assert_eq!(profile.history[0].diagnosis, "Migrana");

        // Un paciente inexistente no tiene ficha.
        assert!(matches!(
            get_patient_profile(&conn, "no-existe"),
            Err(ClinicalError::NotFound)
        ));
    }

    #[test]
    fn attend_appointment_resolves_links_and_remembers() {
        let conn = test_conn("attend");

        // Expediente existente del paciente (alta previa a mano).
        let local = create_patient(
            &conn,
            &NewPatientInput {
                first_name: "Hugo".into(),
                last_name: "Paz".into(),
                phone: Some("6140001111".into()),
                email: None,
                birth_date: None,
                sex: None,
            },
        )
        .unwrap();

        // Cita del portal de la MISMA persona pero con OTRO id (el portal no
        // dedujo). seed_appointment usa nombre "Hugo Paz" y tel "6140001111".
        seed_appointment(&conn, "appt-1", "portal-xyz");

        // Atender en automatico: detecta el duplicado por nombre y telefono.
        match attend_appointment(&conn, "appt-1", None, false).unwrap() {
            AttendOutcome::NeedsResolution { candidates, .. } => {
                assert_eq!(candidates.len(), 1);
                assert!(candidates[0].matched_name);
                assert!(candidates[0].matched_phone);
                assert_eq!(candidates[0].patient.id, local.id);
            }
            AttendOutcome::Encounter { .. } => panic!("debio pedir resolucion"),
        }

        // El medico vincula la cita al expediente existente.
        let enc = match attend_appointment(&conn, "appt-1", Some(&local.id), false).unwrap() {
            AttendOutcome::Encounter { encounter_id } => encounter_id,
            _ => panic!("debio abrir encuentro"),
        };
        // El encuentro quedo sobre el expediente local, no sobre el id del portal.
        let detail = get_encounter_detail(&conn, &enc).unwrap();
        assert_eq!(detail.patient.id, local.id);
        // No se creo un expediente con el id del portal.
        assert!(!patient_exists(&conn, "portal-xyz").unwrap());

        // Una segunda cita del MISMO id de portal se resuelve sola (vinculo
        // recordado), sin volver a pedir resolucion.
        seed_appointment(&conn, "appt-2", "portal-xyz");
        let enc2 = match attend_appointment(&conn, "appt-2", None, false).unwrap() {
            AttendOutcome::Encounter { encounter_id } => encounter_id,
            _ => panic!("el vinculo recordado debio resolver solo"),
        };
        assert_eq!(get_encounter_detail(&conn, &enc2).unwrap().patient.id, local.id);

        // Reabrir la misma cita devuelve el mismo encuentro (idempotente).
        match attend_appointment(&conn, "appt-1", None, false).unwrap() {
            AttendOutcome::Encounter { encounter_id } => assert_eq!(encounter_id, enc),
            _ => panic!("debio reabrir el encuentro existente"),
        }
    }

    #[test]
    fn attend_appointment_creates_when_no_match() {
        let conn = test_conn("attend-new");
        seed_appointment(&conn, "appt-9", "portal-new");

        // Sin coincidencias en el directorio: crea e ingresa directo.
        let enc = match attend_appointment(&conn, "appt-9", None, false).unwrap() {
            AttendOutcome::Encounter { encounter_id } => encounter_id,
            _ => panic!("sin duplicados debio crear y entrar"),
        };
        // Se importo el paciente con el id del portal (preserva enlaces de buzon).
        assert!(patient_exists(&conn, "portal-new").unwrap());
        assert_eq!(get_encounter_detail(&conn, &enc).unwrap().patient.id, "portal-new");
    }

    fn encounter_count_for(conn: &Connection, appointment_id: &str) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM encounters WHERE appointment_id = ?1",
            params![appointment_id],
            |row| row.get(0),
        )
        .unwrap()
    }

    #[test]
    fn resolve_appointment_patient_warns_then_links_without_encounter() {
        let conn = test_conn("resolve-link");

        // Expediente previo de la misma persona, con otro id que el del portal.
        let local = create_patient(
            &conn,
            &NewPatientInput {
                first_name: "Hugo".into(),
                last_name: "Paz".into(),
                phone: Some("6140001111".into()),
                email: None,
                birth_date: None,
                sex: None,
            },
        )
        .unwrap();
        seed_appointment(&conn, "appt-1", "portal-xyz");

        // En automatico detecta el posible duplicado y avisa al medico.
        match resolve_appointment_patient(&conn, "appt-1", None, false).unwrap() {
            ResolveOutcome::NeedsResolution { candidates, .. } => {
                assert_eq!(candidates.len(), 1);
                assert!(candidates[0].matched_name);
                assert!(candidates[0].matched_phone);
                assert_eq!(candidates[0].patient.id, local.id);
            }
            ResolveOutcome::Patient { .. } => panic!("debio pedir resolucion"),
        }

        // El medico confirma que es el expediente previo: se abre ese expediente.
        match resolve_appointment_patient(&conn, "appt-1", Some(&local.id), false).unwrap() {
            ResolveOutcome::Patient { patient_id } => assert_eq!(patient_id, local.id),
            _ => panic!("debio resolver al expediente vinculado"),
        }
        // No se creo un expediente con el id del portal y NO se abrio encuentro.
        assert!(!patient_exists(&conn, "portal-xyz").unwrap());
        assert_eq!(encounter_count_for(&conn, "appt-1"), 0);

        // Una segunda cita del MISMO id de portal ya conoce el vinculo, pero
        // desde la agenda igual debe mostrar la ventanita antes de navegar.
        seed_appointment(&conn, "appt-2", "portal-xyz");
        match resolve_appointment_patient(&conn, "appt-2", None, false).unwrap() {
            ResolveOutcome::NeedsResolution { candidates, .. } => {
                assert_eq!(candidates.len(), 1);
                assert_eq!(candidates[0].patient.id, local.id);
            }
            ResolveOutcome::Patient { .. } => panic!("debio mostrar resolucion, no navegar"),
        }
    }

    #[test]
    fn resolve_appointment_patient_creates_without_encounter() {
        let conn = test_conn("resolve-new");
        seed_appointment(&conn, "appt-9", "portal-new");

        // Sin coincidencias: la agenda no importa ni abre nada automaticamente.
        // El medico debe confirmar si crea un expediente nuevo.
        match resolve_appointment_patient(&conn, "appt-9", None, false).unwrap() {
            ResolveOutcome::NeedsResolution {
                appointment_patient,
                candidates,
            } => {
                assert_eq!(appointment_patient.first_name, "Hugo");
                assert!(candidates.is_empty());
            }
            ResolveOutcome::Patient { .. } => panic!("debio pedir confirmacion para crear"),
        }
        assert!(!patient_exists(&conn, "portal-new").unwrap());
        assert_eq!(encounter_count_for(&conn, "appt-9"), 0);

        // El medico confirma crear el expediente nuevo.
        match resolve_appointment_patient(&conn, "appt-9", None, true).unwrap() {
            ResolveOutcome::Patient { patient_id } => assert_eq!(patient_id, "portal-new"),
            _ => panic!("force_new debio crear expediente nuevo"),
        }
        assert!(patient_exists(&conn, "portal-new").unwrap());
        assert_eq!(encounter_count_for(&conn, "appt-9"), 0);

        // Si el id del portal ya existe como expediente local, tampoco debe
        // navegar automaticamente desde la agenda.
        seed_appointment(&conn, "appt-11", "portal-new");
        match resolve_appointment_patient(&conn, "appt-11", None, false).unwrap() {
            ResolveOutcome::NeedsResolution { candidates, .. } => {
                assert_eq!(candidates.len(), 1);
                assert_eq!(candidates[0].patient.id, "portal-new");
            }
            ResolveOutcome::Patient { .. } => panic!("debio mostrar resolucion, no navegar"),
        }

        // force_new sobre una persona con duplicado tambien evita el encuentro.
        create_patient(
            &conn,
            &NewPatientInput {
                first_name: "Hugo".into(),
                last_name: "Paz".into(),
                phone: Some("6140001111".into()),
                email: None,
                birth_date: None,
                sex: None,
            },
        )
        .unwrap();
        seed_appointment(&conn, "appt-10", "portal-dup");
        match resolve_appointment_patient(&conn, "appt-10", None, true).unwrap() {
            ResolveOutcome::Patient { patient_id } => assert_eq!(patient_id, "portal-dup"),
            _ => panic!("force_new debio crear expediente nuevo"),
        }
        assert_eq!(encounter_count_for(&conn, "appt-10"), 0);
    }

    #[test]
    fn find_patient_matches_detects_likely_duplicates() {
        let conn = test_conn("dup-matches");
        create_patient(
            &conn,
            &NewPatientInput {
                first_name: "Maria Elena".into(),
                last_name: "Duarte".into(),
                phone: Some("614 000 2222".into()),
                email: Some("maria@example.com".into()),
                birth_date: None,
                sex: None,
            },
        )
        .unwrap();

        // Coincide por telefono aunque tenga otro formato.
        assert_eq!(
            find_patient_matches(&conn, None, Some("6140002222"), "Otra", "Persona")
                .unwrap()
                .len(),
            1
        );
        // Coincide por correo aunque cambie mayusculas/espacios.
        assert_eq!(
            find_patient_matches(&conn, Some(" MARIA@example.com "), None, "X", "Y")
                .unwrap()
                .len(),
            1
        );
        // Coincide por nombre completo (sin distinguir mayusculas).
        assert_eq!(
            find_patient_matches(&conn, None, None, "maria elena", "duarte")
                .unwrap()
                .len(),
            1
        );
        // Sin coincidencia: otra persona con otros datos.
        assert_eq!(
            find_patient_matches(&conn, Some("otro@example.com"), Some("555"), "Juan", "Perez")
                .unwrap()
                .len(),
            0
        );
        // Sin datos no devuelve nada (no propone a todo el directorio).
        assert_eq!(find_patient_matches(&conn, None, None, "", "").unwrap().len(), 0);
    }

    #[test]
    fn empty_encounters_stay_out_of_history_and_counts() {
        let conn = test_conn("empty-encounter");
        let patient = create_patient(
            &conn,
            &NewPatientInput {
                first_name: "Carlos".into(),
                last_name: "Vega".into(),
                phone: None,
                email: None,
                birth_date: None,
                sex: None,
            },
        )
        .unwrap();

        // Un encuentro abierto pero sin nota no cuenta como consulta.
        open_encounter_for_patient(&conn, &patient.id).unwrap();
        let listed = list_patients(&conn, None).unwrap();
        assert_eq!(listed[0].encounter_count, 0);
        assert!(listed[0].last_visit.is_none());
        assert_eq!(get_patient_profile(&conn, &patient.id).unwrap().history.len(), 0);

        // En cuanto se escribe algo, el encuentro aparece en el historial.
        let encounter = open_encounter_for_patient(&conn, &patient.id).unwrap();
        save_note(
            &conn,
            &encounter.id,
            &NoteContent {
                subjective: "Refiere tos".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(get_patient_profile(&conn, &patient.id).unwrap().history.len(), 1);
        assert_eq!(list_patients(&conn, None).unwrap()[0].encounter_count, 1);
    }

    #[test]
    fn timeline_events_add_edit_delete_and_validate() {
        let conn = test_conn("timeline");
        let patient = create_patient(
            &conn,
            &NewPatientInput {
                first_name: "Beatriz".into(),
                last_name: "Ramos".into(),
                phone: None,
                email: None,
                birth_date: None,
                sex: None,
            },
        )
        .unwrap();

        // Alta: la categoria se normaliza a mayusculas y el detalle vacio es NULL.
        let event = add_timeline_event(
            &conn,
            &patient.id,
            &TimelineEventInput {
                event_date: "2024-02-10".into(),
                category: "diagnosis".into(),
                title: "Diabetes tipo 2".into(),
                detail: Some("".into()),
            },
        )
        .unwrap();
        assert_eq!(event.category, "DIAGNOSIS");
        assert_eq!(event.detail, None);

        // Validaciones: titulo vacio, fecha vacia y categoria desconocida.
        let base = || TimelineEventInput {
            event_date: "2024-02-10".into(),
            category: "NOTE".into(),
            title: "Algo".into(),
            detail: None,
        };
        assert!(matches!(
            add_timeline_event(&conn, &patient.id, &TimelineEventInput { title: "  ".into(), ..base() }),
            Err(ClinicalError::Invalid(_))
        ));
        assert!(matches!(
            add_timeline_event(&conn, &patient.id, &TimelineEventInput { event_date: "".into(), ..base() }),
            Err(ClinicalError::Invalid(_))
        ));
        assert!(matches!(
            add_timeline_event(&conn, &patient.id, &TimelineEventInput { category: "INVENTADA".into(), ..base() }),
            Err(ClinicalError::Invalid(_))
        ));

        // Un evento para un paciente inexistente se rechaza.
        assert!(matches!(
            add_timeline_event(&conn, "no-existe", &base()),
            Err(ClinicalError::NotFound)
        ));

        // Segundo evento mas reciente: encabeza la lista (orden por fecha desc).
        add_timeline_event(
            &conn,
            &patient.id,
            &TimelineEventInput {
                event_date: "2025-09-01".into(),
                category: "ALERT".into(),
                title: "Control glucemico deficiente".into(),
                detail: Some("HbA1c 9.2".into()),
            },
        )
        .unwrap();
        let listed = list_timeline_events(&conn, &patient.id).unwrap();
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].event_date, "2025-09-01");

        // Edicion: cambia titulo y detalle.
        let updated = update_timeline_event(
            &conn,
            &event.id,
            &TimelineEventInput {
                event_date: "2024-02-10".into(),
                category: "DIAGNOSIS".into(),
                title: "Diabetes mellitus tipo 2".into(),
                detail: Some("Controlada con metformina".into()),
            },
        )
        .unwrap();
        assert_eq!(updated.title, "Diabetes mellitus tipo 2");
        assert_eq!(updated.detail.as_deref(), Some("Controlada con metformina"));

        // Baja: elimina el evento; un id inexistente da NotFound.
        delete_timeline_event(&conn, &event.id).unwrap();
        assert_eq!(list_timeline_events(&conn, &patient.id).unwrap().len(), 1);
        assert!(matches!(
            delete_timeline_event(&conn, &event.id),
            Err(ClinicalError::NotFound)
        ));
    }
}
