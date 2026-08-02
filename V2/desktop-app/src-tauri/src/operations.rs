//! Operacion presencial (paso 10): recepcion, lista de espera, consulta sin
//! cita, estados operativos, recursos fisicos, caja diaria, cobros, recibos y
//! anticipos. Clase de residencia: OPERATIVO — todo vive en la base cifrada
//! local y nada de este modulo toca la red.
//!
//! Regla del paso 10: la operacion presencial extiende el nucleo cita-
//! expediente, no lo modifica. Las visitas y cobros referencian citas y
//! encuentros por id, pero el flujo clinico existente queda intacto.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum OperationsError {
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Invalid(String),
    #[error("no encontrado")]
    NotFound,
    #[error("no hay una caja abierta; abre la caja del dia antes de cobrar")]
    NoOpenCashSession,
    #[error("ya hay una caja abierta; cierrala antes de abrir otra")]
    CashSessionAlreadyOpen,
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Reusa la bitacora local generica para registrar eventos operativos
/// criticos (cobros, apertura/cierre de caja). Solo IDs y metadatos, nunca
/// contenido clinico (REGLAS_DESARROLLO.md §4.2).
fn audit(
    conn: &Connection,
    entity: &str,
    entity_id: &str,
    action: &str,
    details: Option<&str>,
) -> Result<(), OperationsError> {
    conn.execute(
        "INSERT INTO clinical_audit (entity, entity_id, action, at, details)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![entity, entity_id, action, now(), details],
    )?;
    Ok(())
}

/* ---------- Estados operativos de la visita ---------- */

/// Estados de una visita en recepcion. WAITING (llego, en espera) →
/// IN_PROGRESS (en consulta) → DONE (salida); CANCELLED es terminal.
const VISIT_STATES: &[&str] = &["WAITING", "IN_PROGRESS", "DONE", "CANCELLED"];
const PAYMENT_METHODS: &[&str] = &["CASH", "CARD", "TRANSFER"];
const PAYMENT_KINDS: &[&str] = &["PAYMENT", "DEPOSIT", "REFUND"];

/* ---------- Tipos ---------- */

/// Puesto de trabajo con su propio cajon y su propia serie de folios. En
/// `ESTACION_UNICA` hay una; en el despliegue de dos equipos, una por maquina.
#[derive(Debug, Serialize)]
pub struct Station {
    pub id: String,
    pub code: String,
    pub name: String,
    pub mode: String,
}

#[derive(Debug, Serialize)]
pub struct Resource {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub active: bool,
}

#[derive(Debug, Serialize)]
pub struct Visit {
    pub id: String,
    pub appointment_id: Option<String>,
    pub patient_id: Option<String>,
    pub patient_name: String,
    pub patient_phone: Option<String>,
    pub reason: Option<String>,
    pub service_name: Option<String>,
    pub state: String,
    pub priority: i64,
    pub resource_id: Option<String>,
    pub resource_name: Option<String>,
    pub encounter_id: Option<String>,
    pub arrived_at: String,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CashSession {
    pub id: String,
    pub opened_at: String,
    pub opening_float_cents: i64,
    pub closed_at: Option<String>,
    pub closing_counted_cents: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Payment {
    pub id: String,
    pub cash_session_id: String,
    pub visit_id: Option<String>,
    pub patient_id: Option<String>,
    pub amount_cents: i64,
    pub method: String,
    pub kind: String,
    pub concept: Option<String>,
    pub budget_id: Option<String>,
    pub receipt_number: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct MethodTotal {
    pub method: String,
    pub total_cents: i64,
}

/// Cierre de caja: totales netos por metodo (cobros + anticipos − reembolsos),
/// conteo de movimientos y total esperado en efectivo.
#[derive(Debug, Serialize)]
pub struct CashSummary {
    pub session: CashSession,
    pub payment_count: i64,
    pub net_total_cents: i64,
    pub by_method: Vec<MethodTotal>,
    pub expected_cash_cents: i64,
}

/* ---------- Recursos fisicos ---------- */

#[derive(Debug, Deserialize)]
pub struct NewResource {
    pub name: String,
    pub kind: String,
}

pub fn create_resource(conn: &Connection, input: &NewResource) -> Result<Resource, OperationsError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(OperationsError::Invalid("el recurso necesita un nombre".into()));
    }
    let kind = match input.kind.trim().to_uppercase().as_str() {
        "ROOM" | "EQUIPMENT" | "OTHER" => input.kind.trim().to_uppercase(),
        _ => return Err(OperationsError::Invalid("tipo de recurso invalido".into())),
    };
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO resources (id, name, kind, active, created_at)
         VALUES (?1, ?2, ?3, 1, ?4)",
        params![id, name, kind, now()],
    )?;
    Ok(Resource { id, name: name.to_string(), kind, active: true })
}

pub fn set_resource_active(
    conn: &Connection,
    resource_id: &str,
    active: bool,
) -> Result<(), OperationsError> {
    let changed = conn.execute(
        "UPDATE resources SET active = ?2 WHERE id = ?1",
        params![resource_id, active as i64],
    )?;
    if changed == 0 {
        return Err(OperationsError::NotFound);
    }
    Ok(())
}

pub fn list_resources(conn: &Connection) -> Result<Vec<Resource>, OperationsError> {
    let mut statement = conn.prepare(
        "SELECT id, name, kind, active FROM resources ORDER BY active DESC, name ASC",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok(Resource {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                active: row.get::<_, i64>(3)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/* ---------- Visitas: recepcion, lista de espera, walk-in ---------- */

fn read_visit(conn: &Connection, visit_id: &str) -> Result<Visit, OperationsError> {
    conn.query_row(
        "SELECT v.id, v.appointment_id, v.patient_id, v.patient_name, v.patient_phone,
                v.reason, v.service_name, v.state, v.priority, v.resource_id, r.name,
                v.encounter_id, v.arrived_at, v.started_at, v.ended_at
         FROM visits v
         LEFT JOIN resources r ON r.id = v.resource_id
         WHERE v.id = ?1",
        params![visit_id],
        |row| {
            Ok(Visit {
                id: row.get(0)?,
                appointment_id: row.get(1)?,
                patient_id: row.get(2)?,
                patient_name: row.get(3)?,
                patient_phone: row.get(4)?,
                reason: row.get(5)?,
                service_name: row.get(6)?,
                state: row.get(7)?,
                priority: row.get(8)?,
                resource_id: row.get(9)?,
                resource_name: row.get(10)?,
                encounter_id: row.get(11)?,
                arrived_at: row.get(12)?,
                started_at: row.get(13)?,
                ended_at: row.get(14)?,
            })
        },
    )
    .optional()?
    .ok_or(OperationsError::NotFound)
}

/// Tablero de recepcion: visitas activas (en espera o en consulta) ordenadas
/// por prioridad y hora de llegada — esta es la lista de espera del dia.
pub fn list_active_visits(conn: &Connection) -> Result<Vec<Visit>, OperationsError> {
    let mut statement = conn.prepare(
        "SELECT v.id, v.appointment_id, v.patient_id, v.patient_name, v.patient_phone,
                v.reason, v.service_name, v.state, v.priority, v.resource_id, r.name,
                v.encounter_id, v.arrived_at, v.started_at, v.ended_at
         FROM visits v
         LEFT JOIN resources r ON r.id = v.resource_id
         WHERE v.state IN ('WAITING', 'IN_PROGRESS')
         ORDER BY v.priority DESC, v.arrived_at ASC",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok(Visit {
                id: row.get(0)?,
                appointment_id: row.get(1)?,
                patient_id: row.get(2)?,
                patient_name: row.get(3)?,
                patient_phone: row.get(4)?,
                reason: row.get(5)?,
                service_name: row.get(6)?,
                state: row.get(7)?,
                priority: row.get(8)?,
                resource_id: row.get(9)?,
                resource_name: row.get(10)?,
                encounter_id: row.get(11)?,
                arrived_at: row.get(12)?,
                started_at: row.get(13)?,
                ended_at: row.get(14)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Registra la llegada de un paciente con cita: crea la visita en estado
/// WAITING. Idempotente por cita (indice unico): si ya llego, devuelve la
/// visita existente.
pub fn check_in_appointment(
    conn: &Connection,
    appointment_id: &str,
    priority: i64,
) -> Result<Visit, OperationsError> {
    if let Some(existing) = conn
        .query_row(
            "SELECT id FROM visits WHERE appointment_id = ?1",
            params![appointment_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        return read_visit(conn, &existing);
    }

    let appointment = conn
        .query_row(
            "SELECT patient_id, patient_first_name, patient_last_name, patient_phone,
                    service_name, reason
             FROM appointments WHERE id = ?1",
            params![appointment_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            },
        )
        .optional()?
        .ok_or(OperationsError::NotFound)?;

    let (patient_id, first, last, phone, service, reason) = appointment;
    let patient_name = format!("{first} {last}").trim().to_string();
    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = now();
    conn.execute(
        "INSERT INTO visits
            (id, appointment_id, patient_id, patient_name, patient_phone, reason,
             service_name, state, priority, arrived_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'WAITING', ?8, ?9, ?9, ?9)",
        params![
            id, appointment_id, patient_id, patient_name, phone, reason, service,
            priority, timestamp
        ],
    )?;
    audit(conn, "visit", &id, "checked-in", Some(appointment_id))?;
    read_visit(conn, &id)
}

#[derive(Debug, Deserialize)]
pub struct WalkInInput {
    pub patient_name: String,
    pub patient_phone: Option<String>,
    pub reason: Option<String>,
    pub service_name: Option<String>,
    pub priority: Option<i64>,
}

/// Registra una consulta sin cita (RF17). Crea un paciente local minimo y la
/// visita en espera. El expediente se abre despues con `start_visit_encounter`.
pub fn register_walk_in(conn: &Connection, input: &WalkInInput) -> Result<Visit, OperationsError> {
    let name = input.patient_name.trim();
    if name.is_empty() {
        return Err(OperationsError::Invalid(
            "la consulta sin cita necesita el nombre del paciente".into(),
        ));
    }

    // Recepcion crea la identidad (CONTACTO) y nada mas: el expediente clinico
    // nace en la estacion clinica al abrir el primer encuentro (paso 27). Este
    // modulo no escribe ni lee una sola tabla CLINICO.
    let patient_id = uuid::Uuid::new_v4().to_string();
    let (first, last) = match name.split_once(' ') {
        Some((f, l)) => (f.to_string(), l.to_string()),
        None => (name.to_string(), String::new()),
    };
    let timestamp = now();
    conn.execute(
        "INSERT INTO patient_identities
            (id, first_name, last_name, phone, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![patient_id, first, last, input.patient_phone, timestamp],
    )?;

    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO visits
            (id, appointment_id, patient_id, patient_name, patient_phone, reason,
             service_name, state, priority, arrived_at, created_at, updated_at)
         VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, 'WAITING', ?7, ?8, ?8, ?8)",
        params![
            id, patient_id, name, input.patient_phone, input.reason, input.service_name,
            input.priority.unwrap_or(0), timestamp
        ],
    )?;
    audit(conn, "visit", &id, "walk-in", None)?;
    read_visit(conn, &id)
}

/// Registra una consulta sin cita vinculada a un expediente que ya existe (el
/// recepcionista identifico al paciente y evito un duplicado). No crea paciente
/// nuevo: solo la visita en espera.
pub fn register_walk_in_for_patient(
    conn: &Connection,
    input: &WalkInInput,
    patient_id: &str,
) -> Result<Visit, OperationsError> {
    let name = input.patient_name.trim();
    if name.is_empty() {
        return Err(OperationsError::Invalid(
            "la consulta sin cita necesita el nombre del paciente".into(),
        ));
    }
    let exists: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM patient_identities WHERE id = ?1)",
        params![patient_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(OperationsError::NotFound);
    }

    let timestamp = now();
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO visits
            (id, appointment_id, patient_id, patient_name, patient_phone, reason,
             service_name, state, priority, arrived_at, created_at, updated_at)
         VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, 'WAITING', ?7, ?8, ?8, ?8)",
        params![
            id, patient_id, name, input.patient_phone, input.reason, input.service_name,
            input.priority.unwrap_or(0), timestamp
        ],
    )?;
    audit(conn, "visit", &id, "walk-in-linked", Some(patient_id))?;
    read_visit(conn, &id)
}

/// Cambia el estado operativo de la visita y fija las marcas de tiempo:
/// IN_PROGRESS sella `started_at`, DONE/CANCELLED sellan `ended_at`.
pub fn set_visit_state(
    conn: &Connection,
    visit_id: &str,
    state: &str,
) -> Result<Visit, OperationsError> {
    if !VISIT_STATES.contains(&state) {
        return Err(OperationsError::Invalid("estado de visita invalido".into()));
    }
    let visit = read_visit(conn, visit_id)?;
    if visit.state == "DONE" || visit.state == "CANCELLED" {
        return Err(OperationsError::Invalid(
            "la visita ya esta cerrada y no cambia de estado".into(),
        ));
    }

    let timestamp = now();
    match state {
        "IN_PROGRESS" => conn.execute(
            "UPDATE visits SET state = ?2, started_at = COALESCE(started_at, ?3), updated_at = ?3
             WHERE id = ?1",
            params![visit_id, state, timestamp],
        )?,
        "DONE" | "CANCELLED" => conn.execute(
            "UPDATE visits SET state = ?2, ended_at = ?3, updated_at = ?3 WHERE id = ?1",
            params![visit_id, state, timestamp],
        )?,
        _ => conn.execute(
            "UPDATE visits SET state = ?2, updated_at = ?3 WHERE id = ?1",
            params![visit_id, state, timestamp],
        )?,
    };
    audit(conn, "visit", visit_id, "state-changed", Some(state))?;
    read_visit(conn, visit_id)
}

pub fn assign_resource(
    conn: &Connection,
    visit_id: &str,
    resource_id: Option<&str>,
) -> Result<Visit, OperationsError> {
    if let Some(rid) = resource_id {
        let exists: bool = conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM resources WHERE id = ?1 AND active = 1)",
            params![rid],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(OperationsError::Invalid("recurso inexistente o inactivo".into()));
        }
    }
    let changed = conn.execute(
        "UPDATE visits SET resource_id = ?2, updated_at = ?3 WHERE id = ?1",
        params![visit_id, resource_id, now()],
    )?;
    if changed == 0 {
        return Err(OperationsError::NotFound);
    }
    read_visit(conn, visit_id)
}

/// Lee una visita que aun esta activa (en espera o en consulta). Se usa al
/// iniciar la consulta desde recepcion.
pub fn read_active_visit(conn: &Connection, visit_id: &str) -> Result<Visit, OperationsError> {
    let visit = read_visit(conn, visit_id)?;
    if visit.state == "DONE" || visit.state == "CANCELLED" {
        return Err(OperationsError::Invalid("la visita ya esta cerrada".into()));
    }
    Ok(visit)
}

/// Enlaza el expediente recien abierto con la visita y la marca en consulta.
pub fn link_visit_encounter(
    conn: &Connection,
    visit_id: &str,
    encounter_id: &str,
) -> Result<(), OperationsError> {
    let timestamp = now();
    // Sincroniza el paciente de la visita con el del encuentro: si al atender
    // se resolvio un duplicado (la cita se vinculo a otro expediente), la visita
    // y sus cobros quedan asociados al paciente correcto.
    let changed = conn.execute(
        "UPDATE visits
         SET encounter_id = ?2, state = 'IN_PROGRESS',
             patient_id = (SELECT patient_id FROM encounters WHERE id = ?2),
             started_at = COALESCE(started_at, ?3), updated_at = ?3
         WHERE id = ?1",
        params![visit_id, encounter_id, timestamp],
    )?;
    if changed == 0 {
        return Err(OperationsError::NotFound);
    }
    audit(conn, "visit", visit_id, "encounter-started", Some(encounter_id))?;
    Ok(())
}

/* ---------- Caja diaria ---------- */

fn read_session(conn: &Connection, session_id: &str) -> Result<CashSession, OperationsError> {
    conn.query_row(
        "SELECT id, opened_at, opening_float_cents, closed_at, closing_counted_cents, notes
         FROM cash_sessions WHERE id = ?1",
        params![session_id],
        |row| {
            Ok(CashSession {
                id: row.get(0)?,
                opened_at: row.get(1)?,
                opening_float_cents: row.get(2)?,
                closed_at: row.get(3)?,
                closing_counted_cents: row.get(4)?,
                notes: row.get(5)?,
            })
        },
    )
    .optional()?
    .ok_or(OperationsError::NotFound)
}

/// Caja abierta **de esta estacion**. Con dos cajones, que la otra estacion
/// tenga la suya abierta no es asunto de esta: cada una abre, cobra y cierra la
/// propia, y ninguna cierra la de la otra.
pub fn get_open_session(conn: &Connection) -> Result<Option<CashSession>, OperationsError> {
    let station = local_station(conn)?;
    conn.query_row(
        "SELECT id, opened_at, opening_float_cents, closed_at, closing_counted_cents, notes
         FROM cash_sessions WHERE closed_at IS NULL AND station_id = ?1",
        params![station.id],
        |row| {
            Ok(CashSession {
                id: row.get(0)?,
                opened_at: row.get(1)?,
                opening_float_cents: row.get(2)?,
                closed_at: row.get(3)?,
                closing_counted_cents: row.get(4)?,
                notes: row.get(5)?,
            })
        },
    )
    .optional()
    .map_err(OperationsError::from)
}

pub fn open_cash_session(
    conn: &Connection,
    opening_float_cents: i64,
) -> Result<CashSession, OperationsError> {
    if opening_float_cents < 0 {
        return Err(OperationsError::Invalid("el fondo de caja no puede ser negativo".into()));
    }
    if get_open_session(conn)?.is_some() {
        return Err(OperationsError::CashSessionAlreadyOpen);
    }
    let station = local_station(conn)?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO cash_sessions (id, opened_at, opening_float_cents, station_id)
         VALUES (?1, ?2, ?3, ?4)",
        params![id, now(), opening_float_cents, station.id],
    )?;
    audit(conn, "cash_session", &id, "opened", None)?;
    read_session(conn, &id)
}

/// Cierra la caja abierta con el efectivo contado y devuelve el resumen del
/// dia. El folio de recibos y los movimientos quedan congelados.
pub fn close_cash_session(
    conn: &Connection,
    counted_cash_cents: i64,
    notes: Option<&str>,
) -> Result<CashSummary, OperationsError> {
    let session = get_open_session(conn)?.ok_or(OperationsError::NoOpenCashSession)?;
    conn.execute(
        "UPDATE cash_sessions SET closed_at = ?2, closing_counted_cents = ?3, notes = ?4
         WHERE id = ?1",
        params![session.id, now(), counted_cash_cents, notes],
    )?;
    audit(conn, "cash_session", &session.id, "closed", None)?;
    cash_summary(conn, &session.id)
}

/// Resumen de una sesion de caja: totales netos por metodo y efectivo esperado
/// (fondo inicial + cobros en efectivo − reembolsos en efectivo).
pub fn cash_summary(conn: &Connection, session_id: &str) -> Result<CashSummary, OperationsError> {
    let session = read_session(conn, session_id)?;

    // Reembolsos restan; cobros y anticipos suman.
    let signed = "CASE WHEN kind = 'REFUND' THEN -amount_cents ELSE amount_cents END";

    let mut statement = conn.prepare(&format!(
        "SELECT method, SUM({signed}) FROM payments
         WHERE cash_session_id = ?1 GROUP BY method ORDER BY method"
    ))?;
    let by_method = statement
        .query_map(params![session_id], |row| {
            Ok(MethodTotal { method: row.get(0)?, total_cents: row.get(1)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let payment_count: i64 = conn.query_row(
        "SELECT count(*) FROM payments WHERE cash_session_id = ?1",
        params![session_id],
        |row| row.get(0),
    )?;
    let net_total_cents: i64 = conn.query_row(
        &format!("SELECT COALESCE(SUM({signed}), 0) FROM payments WHERE cash_session_id = ?1"),
        params![session_id],
        |row| row.get(0),
    )?;
    let cash_net: i64 = conn.query_row(
        &format!(
            "SELECT COALESCE(SUM({signed}), 0) FROM payments
             WHERE cash_session_id = ?1 AND method = 'CASH'"
        ),
        params![session_id],
        |row| row.get(0),
    )?;

    Ok(CashSummary {
        expected_cash_cents: session.opening_float_cents + cash_net,
        session,
        payment_count,
        net_total_cents,
        by_method,
    })
}

/* ---------- Cobros, recibos y anticipos ---------- */

#[derive(Debug, Deserialize)]
pub struct PaymentInput {
    pub visit_id: Option<String>,
    pub appointment_id: Option<String>,
    pub patient_id: Option<String>,
    pub amount_cents: i64,
    pub method: String,
    pub kind: String,
    pub concept: Option<String>,
    /// Abono a un presupuesto dental (paso 26): se valida contra su saldo.
    #[serde(default)]
    pub budget_id: Option<String>,
}

/// Folio de recibo monotono y persistente (sobrevive borrados; aqui no hay
/// borrados). Se guarda el siguiente valor en `app_meta`.
/// La estacion de este equipo. Hoy hay una sola; en el despliegue de dos
/// equipos cada uno tiene la suya y ese id es el que separa las series de folio
/// y los cortes de caja.
pub fn local_station(conn: &Connection) -> Result<Station, OperationsError> {
    conn.query_row(
        "SELECT id, code, name, mode FROM stations ORDER BY created_at, id LIMIT 1",
        [],
        |row| {
            Ok(Station {
                id: row.get(0)?,
                code: row.get(1)?,
                name: row.get(2)?,
                mode: row.get(3)?,
            })
        },
    )
    .optional()?
    .ok_or(OperationsError::NotFound)
}

/// Folio monotono **dentro de su estacion**. Con dos cajones un contador unico
/// haria que ambos emitieran R-000001; el prefijo separa las series y cada una
/// sigue siendo monotona, que es lo que un folio necesita.
fn next_receipt_number(conn: &Connection, station: &Station) -> Result<String, OperationsError> {
    let key = format!("receipt_seq_{}", station.code);
    let current: i64 = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .and_then(|raw| raw.parse().ok())
        .unwrap_or(0);
    let next = current + 1;
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![key, next.to_string()],
    )?;
    Ok(format!("R-{}-{next:06}", station.code))
}

/// Abonos netos ya aplicados a un extracto de cobro. Vive aqui, del lado
/// operativo, porque cobros y asignaciones son ambos OPERATIVO: la caja puede
/// responder cuanto lleva pagado un presupuesto sin abrir el expediente.
pub fn billable_paid_cents(
    conn: &Connection,
    billable_id: &str,
) -> Result<i64, OperationsError> {
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(CASE WHEN p.kind = 'REFUND' THEN -a.amount_cents
                                  ELSE a.amount_cents END), 0)
         FROM payment_allocations a
         JOIN payments p ON p.id = a.payment_id
         WHERE a.billable_id = ?1",
        params![billable_id],
        |row| row.get(0),
    )?)
}

/// Revisa un movimiento contra el extracto de cobro. Es un **aviso en captura**,
/// no una garantia: con dos cajones cobrando a la vez, dos abonos que por
/// separado caben en el saldo pueden juntos excederlo, y para cuando el segundo
/// se entera el dinero ya se recibio. Un cobro es un hecho, no una solicitud
/// (paso 27, §4.2 del plan). El excedente termina en saldo a favor.
fn validate_billable_payment(
    conn: &Connection,
    billable_id: &str,
    kind: &str,
    amount_cents: i64,
) -> Result<(), OperationsError> {
    let (status, total): (String, i64) = conn
        .query_row(
            "SELECT status, total_cents FROM billable_items WHERE id = ?1",
            params![billable_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or_else(|| OperationsError::Invalid("presupuesto no encontrado".into()))?;

    if status != "ACCEPTED" {
        return Err(OperationsError::Invalid(
            "solo se abona a un presupuesto aceptado".into(),
        ));
    }

    let paid = billable_paid_cents(conn, billable_id)?;
    if kind == "REFUND" {
        if amount_cents > paid {
            return Err(OperationsError::Invalid(
                "el reembolso excede lo abonado al presupuesto".into(),
            ));
        }
    } else if amount_cents > total - paid {
        return Err(OperationsError::Invalid(
            "el abono excede el saldo del presupuesto".into(),
        ));
    }
    Ok(())
}

/* ---------- Saldo a favor del paciente ---------- */

/// Dinero recibido del paciente que aun no se aplica a ningun presupuesto.
///
/// No es una tabla ni un campo: es la diferencia entre lo cobrado y lo
/// asignado, asi que no hay nada que mantener sincronizado entre estaciones y
/// no puede quedar desalineado con la caja. Los reembolsos restan.
pub fn patient_credit_cents(
    conn: &Connection,
    patient_id: &str,
) -> Result<i64, OperationsError> {
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(
                (CASE WHEN p.kind = 'REFUND' THEN -1 ELSE 1 END) *
                (p.amount_cents - COALESCE((SELECT SUM(a.amount_cents)
                    FROM payment_allocations a WHERE a.payment_id = p.id), 0))
            ), 0)
         FROM payments p WHERE p.patient_id = ?1",
        params![patient_id],
        |row| row.get(0),
    )?)
}

/// Aplica saldo a favor a un presupuesto aceptado. **No hay cobro ni folio
/// nuevo**: el dinero ya se recibio y ya tiene su recibo; esto solo decide a
/// que se destina, creando asignaciones contra los cobros que aun tienen
/// remanente, del mas viejo al mas nuevo.
///
/// A diferencia de un cobro --que es un hecho consumado y solo admite aviso--
/// aplicar saldo es una decision, y por eso si se valida en firme.
pub fn apply_credit_to_billable(
    conn: &mut Connection,
    patient_id: &str,
    billable_id: &str,
    amount_cents: i64,
) -> Result<i64, OperationsError> {
    if amount_cents <= 0 {
        return Err(OperationsError::Invalid(
            "el monto a aplicar debe ser mayor que cero".into(),
        ));
    }

    let (status, total): (String, i64) = conn
        .query_row(
            "SELECT status, total_cents FROM billable_items WHERE id = ?1",
            params![billable_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or_else(|| OperationsError::Invalid("presupuesto no encontrado".into()))?;
    if status != "ACCEPTED" {
        return Err(OperationsError::Invalid(
            "solo se aplica saldo a un presupuesto aceptado".into(),
        ));
    }

    let pending = total - billable_paid_cents(conn, billable_id)?;
    if amount_cents > pending {
        return Err(OperationsError::Invalid(
            "el monto excede el saldo del presupuesto".into(),
        ));
    }
    if amount_cents > patient_credit_cents(conn, patient_id)? {
        return Err(OperationsError::Invalid(
            "el paciente no tiene saldo a favor suficiente".into(),
        ));
    }

    let remainders: Vec<(String, i64)> = {
        let mut statement = conn.prepare(
            "SELECT p.id,
                    p.amount_cents - COALESCE((SELECT SUM(a.amount_cents)
                        FROM payment_allocations a WHERE a.payment_id = p.id), 0)
             FROM payments p
             WHERE p.patient_id = ?1 AND p.kind != 'REFUND'
             ORDER BY p.created_at, p.id",
        )?;
        let rows = statement
            .query_map(params![patient_id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };

    let tx = conn.transaction()?;

    let timestamp = now();
    let mut left = amount_cents;
    for (payment_id, remainder) in remainders {
        if left == 0 {
            break;
        }
        if remainder <= 0 {
            continue;
        }
        let take = remainder.min(left);
        tx.execute(
            "INSERT INTO payment_allocations
                (id, payment_id, billable_id, amount_cents, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                uuid::Uuid::new_v4().to_string(),
                payment_id,
                billable_id,
                take,
                timestamp
            ],
        )?;
        left -= take;
    }

    if left > 0 {
        // El saldo alcanzaba pero no cabe en los remanentes disponibles: algo
        // se movio entre la lectura y el reparto. Se deshace todo.
        return Err(OperationsError::Invalid(
            "el saldo a favor cambio durante la aplicacion".into(),
        ));
    }

    audit(
        &tx,
        "billable",
        billable_id,
        "credit_applied",
        Some(&amount_cents.to_string()),
    )?;
    tx.commit()?;
    Ok(amount_cents)
}

/* ---------- Recibo entregable al paciente ---------- */

/// Cuanto dice el recibo sobre el tratamiento. El recibo se entrega al
/// paciente, asi que el concepto sale de la estacion clinica hacia la
/// operativa: es la clase FACTURABLE, y su nivel se decide a proposito.
///
/// En odontologia el detalle es normal y esperado. En medicina general un
/// recibo que nombra el procedimiento es un problema de privacidad, y por eso
/// el default fuera de odontologia es generico: un consultorio recien instalado
/// nunca empieza filtrando de menos.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReceiptDetail {
    /// "Corona de porcelana, pieza 26"
    Detailed,
    /// "Tratamiento dental", "Consulta medica"
    Generic,
    /// Sin concepto: solo el monto.
    AmountOnly,
}

impl ReceiptDetail {
    pub fn from_stored(value: Option<&str>, clinical_profile: Option<&str>) -> Self {
        match value {
            Some("DETAILED") => Self::Detailed,
            Some("GENERIC") => Self::Generic,
            Some("AMOUNT_ONLY") => Self::AmountOnly,
            // Sin ajuste explicito manda el perfil clinico.
            _ => match clinical_profile {
                Some("ODONTOLOGY") => Self::Detailed,
                _ => Self::Generic,
            },
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Detailed => "DETAILED",
            Self::Generic => "GENERIC",
            Self::AmountOnly => "AMOUNT_ONLY",
        }
    }
}

/// Texto del concepto segun el nivel. Puro y probado: es la regla que decide
/// que sale de la estacion clinica, y no debe depender de la base.
pub fn receipt_concept(
    detail: ReceiptDetail,
    billable_concept: Option<&str>,
    payment_concept: Option<&str>,
    clinical_profile: Option<&str>,
) -> Option<String> {
    match detail {
        ReceiptDetail::AmountOnly => None,
        ReceiptDetail::Generic => Some(
            match clinical_profile {
                Some("ODONTOLOGY") => "Tratamiento dental",
                _ => "Consulta medica",
            }
            .to_string(),
        ),
        ReceiptDetail::Detailed => billable_concept
            .or(payment_concept)
            .map(|text| text.trim().to_string())
            .filter(|text| !text.is_empty()),
    }
}

/// Ajuste local guardado en `sync_state`. Se lee aqui en vez de pasar por
/// `sync::get_state` para no arrastrar su tipo de error a este modulo.
fn setting(conn: &Connection, key: &str) -> Result<Option<String>, OperationsError> {
    Ok(conn
        .query_row(
            "SELECT value FROM sync_state WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()?)
}

#[derive(Debug, Serialize)]
pub struct Receipt {
    pub receipt_number: String,
    pub issued_at: String,
    pub kind: String,
    pub method: String,
    pub amount_cents: i64,
    pub concept: Option<String>,
    pub patient_name: Option<String>,
    pub clinic_name: Option<String>,
    pub clinic_address: Option<String>,
    pub clinic_phone: Option<String>,
    pub clinic_license: Option<String>,
}

/// Reune todo lo que el recibo imprime. Lee identidad (CONTACTO) y el extracto
/// de cobro (FACTURABLE), nunca el expediente.
pub fn build_receipt(conn: &Connection, payment_id: &str) -> Result<Receipt, OperationsError> {
    let (receipt_number, issued_at, kind, method, amount_cents, payment_concept, patient_id): (
        String,
        String,
        String,
        String,
        i64,
        Option<String>,
        Option<String>,
    ) = conn
        .query_row(
            "SELECT receipt_number, created_at, kind, method, amount_cents, concept, patient_id
             FROM payments WHERE id = ?1",
            params![payment_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            },
        )
        .optional()?
        .ok_or(OperationsError::NotFound)?;

    let patient_name: Option<String> = match &patient_id {
        Some(id) => conn
            .query_row(
                "SELECT TRIM(first_name || ' ' || last_name)
                 FROM patient_identities WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()?,
        None => None,
    };

    let billable_concept: Option<String> = conn
        .query_row(
            "SELECT b.concept FROM payment_allocations a
             JOIN billable_items b ON b.id = a.billable_id
             WHERE a.payment_id = ?1 ORDER BY a.created_at, a.id LIMIT 1",
            params![payment_id],
            |row| row.get(0),
        )
        .optional()?;

    let stored_detail = setting(conn, "receipt_detail")?;
    let clinical_profile = setting(conn, "clinical_profile")?;
    let detail = ReceiptDetail::from_stored(stored_detail.as_deref(), clinical_profile.as_deref());

    Ok(Receipt {
        receipt_number,
        issued_at,
        kind,
        method,
        amount_cents,
        concept: receipt_concept(
            detail,
            billable_concept.as_deref(),
            payment_concept.as_deref(),
            clinical_profile.as_deref(),
        ),
        patient_name,
        clinic_name: setting(conn, "clinic_name")?,
        clinic_address: setting(conn, "clinic_address")?,
        clinic_phone: setting(conn, "clinic_phone")?,
        clinic_license: setting(conn, "clinic_license")?,
    })
}

/* ---------- Reembolso del saldo a favor ---------- */

/// Vigencia de una solicitud. Una autorizacion vieja no deberia poder cobrarse
/// semanas despues: para entonces el saldo pudo gastarse y el contexto cambio.
const REFUND_REQUEST_TTL_DAYS: i64 = 7;

// Estados: PENDING -> AUTHORIZED -> EMITTED, con REJECTED como salida. No hay
// constante que los valide porque nunca entran desde fuera: los fija el propio
// flujo, a diferencia de los metodos y tipos de cobro, que si vienen del cliente.

#[derive(Debug, Serialize)]
pub struct RefundRequest {
    pub id: String,
    pub patient_id: String,
    pub amount_cents: i64,
    pub reason: Option<String>,
    pub status: String,
    pub requested_by: Option<String>,
    pub requested_at: String,
    pub authorized_by: Option<String>,
    pub authorized_at: Option<String>,
    pub payment_id: Option<String>,
    pub expires_at: String,
}

fn read_refund_request(
    conn: &Connection,
    request_id: &str,
) -> Result<RefundRequest, OperationsError> {
    conn.query_row(
        "SELECT id, patient_id, amount_cents, reason, status, requested_by,
                requested_at, authorized_by, authorized_at, payment_id, expires_at
         FROM refund_requests WHERE id = ?1",
        params![request_id],
        |row| {
            Ok(RefundRequest {
                id: row.get(0)?,
                patient_id: row.get(1)?,
                amount_cents: row.get(2)?,
                reason: row.get(3)?,
                status: row.get(4)?,
                requested_by: row.get(5)?,
                requested_at: row.get(6)?,
                authorized_by: row.get(7)?,
                authorized_at: row.get(8)?,
                payment_id: row.get(9)?,
                expires_at: row.get(10)?,
            })
        },
    )
    .optional()?
    .ok_or(OperationsError::NotFound)
}

/// Captura la intencion de devolver saldo a favor. **No sale dinero aqui**: sin
/// la autorizacion del medico la solicitud se queda esperando.
pub fn request_refund(
    conn: &Connection,
    patient_id: &str,
    amount_cents: i64,
    reason: Option<&str>,
    requested_by: Option<&str>,
) -> Result<RefundRequest, OperationsError> {
    if amount_cents <= 0 {
        return Err(OperationsError::Invalid(
            "el monto del reembolso debe ser mayor que cero".into(),
        ));
    }
    if amount_cents > patient_credit_cents(conn, patient_id)? {
        return Err(OperationsError::Invalid(
            "el paciente no tiene saldo a favor suficiente".into(),
        ));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let requested_at = chrono::Utc::now();
    let expires_at = requested_at + chrono::Duration::days(REFUND_REQUEST_TTL_DAYS);
    conn.execute(
        "INSERT INTO refund_requests
            (id, patient_id, amount_cents, reason, status, requested_by,
             requested_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, 'PENDING', ?5, ?6, ?7)",
        params![
            id,
            patient_id,
            amount_cents,
            reason,
            requested_by,
            requested_at.to_rfc3339(),
            expires_at.to_rfc3339()
        ],
    )?;
    audit(conn, "refund_request", &id, "requested", None)?;
    read_refund_request(conn, &id)
}

/// Autoriza o rechaza la solicitud. Solo el medico llega aqui: la compuerta de
/// comandos de la rebanada 2 lo hara cumplir por rol; hoy queda registrado
/// quien autorizo para que la bitacora ya sea la definitiva.
pub fn decide_refund_request(
    conn: &Connection,
    request_id: &str,
    authorize: bool,
    authorized_by: Option<&str>,
) -> Result<RefundRequest, OperationsError> {
    let request = read_refund_request(conn, request_id)?;
    if request.status != "PENDING" {
        return Err(OperationsError::Invalid(
            "solo una solicitud pendiente puede decidirse".into(),
        ));
    }
    let now_ts = chrono::Utc::now();
    if is_expired(&request.expires_at, now_ts) {
        return Err(OperationsError::Invalid("la solicitud expiro".into()));
    }

    let status = if authorize { "AUTHORIZED" } else { "REJECTED" };
    conn.execute(
        "UPDATE refund_requests
         SET status = ?2, authorized_by = ?3, authorized_at = ?4,
             resolved_at = CASE WHEN ?2 = 'REJECTED' THEN ?4 ELSE resolved_at END
         WHERE id = ?1",
        params![request_id, status, authorized_by, now_ts.to_rfc3339()],
    )?;
    audit(
        conn,
        "refund_request",
        request_id,
        "decided",
        Some(status),
    )?;
    read_refund_request(conn, request_id)
}

fn is_expired(expires_at: &str, now_ts: chrono::DateTime<chrono::Utc>) -> bool {
    match chrono::DateTime::parse_from_rfc3339(expires_at) {
        Ok(deadline) => now_ts > deadline.with_timezone(&chrono::Utc),
        // Una fecha ilegible se trata como vencida: es el lado seguro cuando de
        // por medio hay dinero saliendo.
        Err(_) => true,
    }
}

/// Emite el reembolso ya autorizado y entrega el efectivo. La autorizacion es
/// **de un solo uso**: se consume al crear la fila de `payments`, de modo que
/// una misma aprobacion no pueda aplicarse dos veces por los dos caminos
/// (medico presente y solicitud pendiente).
pub fn emit_authorized_refund(
    conn: &mut Connection,
    request_id: &str,
    method: &str,
) -> Result<Payment, OperationsError> {
    let request = read_refund_request(conn, request_id)?;
    if request.status != "AUTHORIZED" {
        return Err(OperationsError::Invalid(
            "el reembolso necesita autorizacion del medico".into(),
        ));
    }
    if is_expired(&request.expires_at, chrono::Utc::now()) {
        return Err(OperationsError::Invalid(
            "la autorizacion expiro; hay que pedirla de nuevo".into(),
        ));
    }

    // El saldo pudo aplicarse a un tratamiento entre la autorizacion y la
    // entrega. Sale dinero: se revalida, no se asume.
    if request.amount_cents > patient_credit_cents(conn, &request.patient_id)? {
        return Err(OperationsError::Invalid(
            "el saldo a favor ya no alcanza para este reembolso".into(),
        ));
    }

    let method = method.trim().to_uppercase();
    if !PAYMENT_METHODS.contains(&method.as_str()) {
        return Err(OperationsError::Invalid("metodo de pago invalido".into()));
    }
    let station = local_station(conn)?;
    let session = get_open_session(conn)?.ok_or(OperationsError::NoOpenCashSession)?;

    let tx = conn.transaction()?;
    let receipt_number = next_receipt_number(&tx, &station)?;
    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = now();
    tx.execute(
        "INSERT INTO payments
            (id, cash_session_id, visit_id, appointment_id, patient_id, amount_cents,
             method, kind, concept, receipt_number, created_at, station_id)
         VALUES (?1, ?2, NULL, NULL, ?3, ?4, ?5, 'REFUND', ?6, ?7, ?8, ?9)",
        params![
            id,
            session.id,
            request.patient_id,
            request.amount_cents,
            method,
            request.reason,
            receipt_number,
            timestamp,
            station.id
        ],
    )?;

    // Consumir la autorizacion es parte de la misma transaccion que emite el
    // pago: o quedan ambas cosas, o ninguna.
    let consumed = tx.execute(
        "UPDATE refund_requests
         SET status = 'EMITTED', payment_id = ?2, resolved_at = ?3
         WHERE id = ?1 AND status = 'AUTHORIZED'",
        params![request_id, id, timestamp],
    )?;
    if consumed != 1 {
        return Err(OperationsError::Invalid(
            "la autorizacion ya se habia usado".into(),
        ));
    }

    audit(&tx, "payment", &id, "refund_emitted", Some(request_id))?;
    tx.commit()?;

    Ok(Payment {
        id,
        cash_session_id: session.id,
        visit_id: None,
        patient_id: Some(request.patient_id),
        amount_cents: request.amount_cents,
        method,
        kind: "REFUND".into(),
        concept: request.reason,
        budget_id: None,
        receipt_number,
        created_at: timestamp,
    })
}

pub fn list_pending_refund_requests(
    conn: &Connection,
) -> Result<Vec<RefundRequest>, OperationsError> {
    let mut statement = conn.prepare(
        "SELECT id FROM refund_requests
         WHERE status IN ('PENDING', 'AUTHORIZED') ORDER BY requested_at",
    )?;
    let ids = statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    ids.iter()
        .map(|id| read_refund_request(conn, id))
        .collect()
}

pub fn register_payment(
    conn: &Connection,
    input: &PaymentInput,
) -> Result<Payment, OperationsError> {
    if input.amount_cents <= 0 {
        return Err(OperationsError::Invalid("el monto debe ser mayor que cero".into()));
    }
    let method = input.method.trim().to_uppercase();
    if !PAYMENT_METHODS.contains(&method.as_str()) {
        return Err(OperationsError::Invalid("metodo de pago invalido".into()));
    }
    let kind = input.kind.trim().to_uppercase();
    if !PAYMENT_KINDS.contains(&kind.as_str()) {
        return Err(OperationsError::Invalid("tipo de cobro invalido".into()));
    }

    // Un movimiento ligado a un presupuesto se valida contra su extracto de
    // cobro (FACTURABLE), nunca contra el expediente: este modulo no puede leer
    // una tabla CLINICO ni llamar a quien la lea (paso 27).
    if let Some(billable_id) = &input.budget_id {
        validate_billable_payment(conn, billable_id, &kind, input.amount_cents)?;
    }

    let station = local_station(conn)?;
    let session = get_open_session(conn)?.ok_or(OperationsError::NoOpenCashSession)?;
    let receipt_number = next_receipt_number(conn, &station)?;
    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = now();
    conn.execute(
        "INSERT INTO payments
            (id, cash_session_id, visit_id, appointment_id, patient_id, amount_cents,
             method, kind, concept, receipt_number, created_at, station_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            id, session.id, input.visit_id, input.appointment_id, input.patient_id,
            input.amount_cents, method, kind, input.concept,
            receipt_number, timestamp, station.id
        ],
    )?;

    // El cobro queda asentado; aplicarlo a un presupuesto es un acto aparte y
    // reversible. Lo que no se asigne es saldo a favor del paciente.
    if let Some(billable_id) = &input.budget_id {
        conn.execute(
            "INSERT INTO payment_allocations
                (id, payment_id, billable_id, amount_cents, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                uuid::Uuid::new_v4().to_string(),
                id,
                billable_id,
                input.amount_cents,
                timestamp
            ],
        )?;
    }

    audit(conn, "payment", &id, "registered", Some(&receipt_number))?;

    Ok(Payment {
        id,
        cash_session_id: session.id,
        visit_id: input.visit_id.clone(),
        patient_id: input.patient_id.clone(),
        amount_cents: input.amount_cents,
        method,
        kind,
        concept: input.concept.clone(),
        budget_id: input.budget_id.clone(),
        receipt_number,
        created_at: timestamp,
    })
}

pub fn list_session_payments(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<Payment>, OperationsError> {
    // El presupuesto al que se aplico el cobro ya no es columna suya: sale de
    // las asignaciones, que pueden cambiar sin reescribir el recibo. Un cobro
    // repartido entre varios presupuestos reportara el primero; el desglose
    // completo se lee de `payment_allocations`.
    let mut statement = conn.prepare(
        "SELECT p.id, p.cash_session_id, p.visit_id, p.patient_id, p.amount_cents,
                p.method, p.kind, p.concept,
                (SELECT a.billable_id FROM payment_allocations a
                 WHERE a.payment_id = p.id ORDER BY a.created_at, a.id LIMIT 1),
                p.receipt_number, p.created_at
         FROM payments p WHERE p.cash_session_id = ?1 ORDER BY p.created_at DESC",
    )?;
    let rows = statement
        .query_map(params![session_id], |row| {
            Ok(Payment {
                id: row.get(0)?,
                cash_session_id: row.get(1)?,
                visit_id: row.get(2)?,
                patient_id: row.get(3)?,
                amount_cents: row.get(4)?,
                method: row.get(5)?,
                kind: row.get(6)?,
                concept: row.get(7)?,
                budget_id: row.get(8)?,
                receipt_number: row.get(9)?,
                created_at: row.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-operations-tests");
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
        conn.execute(
            "INSERT INTO patient_identities (id, first_name, last_name, created_at, updated_at)
             VALUES (?1, 'Hugo', 'Paz', '0', '0')",
            params![patient_id],
        )
        .unwrap();
    }

    #[test]
    fn check_in_is_idempotent_per_appointment() {
        let conn = test_conn("checkin");
        seed_appointment(&conn, "appt-1", "pat-1");

        let first = check_in_appointment(&conn, "appt-1", 0).unwrap();
        let second = check_in_appointment(&conn, "appt-1", 0).unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(first.state, "WAITING");
        assert_eq!(first.patient_name, "Hugo Paz");
        assert_eq!(list_active_visits(&conn).unwrap().len(), 1);
    }

    #[test]
    fn walk_in_creates_patient_and_visit() {
        let conn = test_conn("walkin");
        let visit = register_walk_in(
            &conn,
            &WalkInInput {
                patient_name: "Maria Duarte".into(),
                patient_phone: Some("614 222 3333".into()),
                reason: Some("Dolor de garganta".into()),
                service_name: None,
                priority: Some(1),
            },
        )
        .unwrap();
        assert!(visit.appointment_id.is_none());
        let patient_id = visit.patient_id.clone().unwrap();

        // Recepcion crea la identidad (CONTACTO) y NADA clinico: el expediente
        // no existe todavia. Esta es la frontera del paso 27.
        let has_identity: bool = conn
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM patient_identities WHERE id = ?1)",
                params![patient_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(has_identity, "recepcion registra la identidad");

        let has_clinical: bool = conn
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM patients WHERE id = ?1)",
                params![patient_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!has_clinical, "recepcion no abre expediente clinico");

        // El expediente nace cuando el medico atiende, no antes.
        let encounter = crate::clinical::open_encounter_for_patient(&conn, &patient_id).unwrap();
        assert!(encounter.appointment_id.is_none());
        assert_eq!(encounter.patient_id, patient_id);

        let has_clinical_now: bool = conn
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM patients WHERE id = ?1)",
                params![patient_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(has_clinical_now, "atender materializa el expediente");
    }

    #[test]
    fn walk_in_for_patient_links_without_creating_a_new_patient() {
        let conn = test_conn("walkin-link");
        conn.execute(
            "INSERT INTO patient_identities (id, first_name, last_name, created_at, updated_at)
             VALUES ('pat-1', 'Ana', 'Lopez', '0', '0')",
            [],
        )
        .unwrap();
        let before: i64 = conn
            .query_row("SELECT count(*) FROM patient_identities", [], |r| r.get(0))
            .unwrap();

        let visit = register_walk_in_for_patient(
            &conn,
            &WalkInInput {
                patient_name: "Ana Lopez".into(),
                patient_phone: None,
                reason: Some("Control".into()),
                service_name: None,
                priority: None,
            },
            "pat-1",
        )
        .unwrap();
        assert_eq!(visit.patient_id.as_deref(), Some("pat-1"));
        assert!(visit.appointment_id.is_none());

        let after: i64 = conn
            .query_row("SELECT count(*) FROM patient_identities", [], |r| r.get(0))
            .unwrap();
        assert_eq!(before, after, "no debe crear un paciente nuevo");

        // Vincular a un paciente inexistente se rechaza.
        assert!(matches!(
            register_walk_in_for_patient(
                &conn,
                &WalkInInput {
                    patient_name: "X".into(),
                    patient_phone: None,
                    reason: None,
                    service_name: None,
                    priority: None,
                },
                "no-existe",
            ),
            Err(OperationsError::NotFound)
        ));
    }

    #[test]
    fn walk_in_requires_name() {
        let conn = test_conn("walkin-name");
        assert!(matches!(
            register_walk_in(
                &conn,
                &WalkInInput {
                    patient_name: "   ".into(),
                    patient_phone: None,
                    reason: None,
                    service_name: None,
                    priority: None,
                }
            ),
            Err(OperationsError::Invalid(_))
        ));
    }

    #[test]
    fn visit_state_transitions_and_freezes_when_closed() {
        let conn = test_conn("states");
        seed_appointment(&conn, "appt-2", "pat-2");
        let visit = check_in_appointment(&conn, "appt-2", 0).unwrap();

        let in_progress = set_visit_state(&conn, &visit.id, "IN_PROGRESS").unwrap();
        assert_eq!(in_progress.state, "IN_PROGRESS");
        assert!(in_progress.started_at.is_some());

        let done = set_visit_state(&conn, &visit.id, "DONE").unwrap();
        assert_eq!(done.state, "DONE");
        assert!(done.ended_at.is_some());
        assert_eq!(list_active_visits(&conn).unwrap().len(), 0);

        // Cerrada: ya no transiciona.
        assert!(matches!(
            set_visit_state(&conn, &visit.id, "WAITING"),
            Err(OperationsError::Invalid(_))
        ));
        assert!(matches!(
            set_visit_state(&conn, &visit.id, "NOPE"),
            Err(OperationsError::Invalid(_))
        ));
    }

    #[test]
    fn resource_assignment_validates_resource() {
        let conn = test_conn("resources");
        let room = create_resource(&conn, &NewResource { name: "Consultorio 1".into(), kind: "room".into() }).unwrap();
        assert!(room.active);
        let visit = register_walk_in(
            &conn,
            &WalkInInput {
                patient_name: "Ana Soto".into(),
                patient_phone: None,
                reason: None,
                service_name: None,
                priority: None,
            },
        )
        .unwrap();

        let assigned = assign_resource(&conn, &visit.id, Some(&room.id)).unwrap();
        assert_eq!(assigned.resource_name.as_deref(), Some("Consultorio 1"));

        // Recurso inactivo no se puede asignar.
        set_resource_active(&conn, &room.id, false).unwrap();
        assert!(matches!(
            assign_resource(&conn, &visit.id, Some(&room.id)),
            Err(OperationsError::Invalid(_))
        ));
    }

    #[test]
    fn only_one_cash_session_open_at_a_time() {
        let conn = test_conn("cash-single");
        open_cash_session(&conn, 50000).unwrap();
        assert!(matches!(
            open_cash_session(&conn, 0),
            Err(OperationsError::CashSessionAlreadyOpen)
        ));
    }

    #[test]
    fn payment_requires_open_session_and_generates_unique_receipts() {
        let conn = test_conn("payments");
        // Sin caja abierta no se puede cobrar.
        assert!(matches!(
            register_payment(
                &conn,
                &PaymentInput {
                    visit_id: None,
                    appointment_id: None,
                    patient_id: None,
                    amount_cents: 30000,
                    method: "cash".into(),
                    kind: "PAYMENT".into(),
                    concept: None,
                    budget_id: None,
                }
            ),
            Err(OperationsError::NoOpenCashSession)
        ));

        open_cash_session(&conn, 50000).unwrap();
        let p1 = register_payment(
            &conn,
            &PaymentInput {
                visit_id: None,
                appointment_id: None,
                patient_id: None,
                amount_cents: 30000,
                method: "cash".into(),
                kind: "PAYMENT".into(),
                concept: Some("Consulta general".into()),
                budget_id: None,
            },
        )
        .unwrap();
        let p2 = register_payment(
            &conn,
            &PaymentInput {
                visit_id: None,
                appointment_id: None,
                patient_id: None,
                amount_cents: 20000,
                method: "card".into(),
                kind: "DEPOSIT".into(),
                concept: None,
                budget_id: None,
            },
        )
        .unwrap();
        // El folio lleva el codigo de su estacion: con dos cajones, un contador
        // unico haria que ambos emitieran R-000001.
        assert_eq!(p1.receipt_number, "R-A-000001");
        assert_eq!(p2.receipt_number, "R-A-000002");
        assert_eq!(p2.method, "CARD");
        assert_eq!(p2.kind, "DEPOSIT");

        // Monto invalido se rechaza.
        assert!(matches!(
            register_payment(
                &conn,
                &PaymentInput {
                    visit_id: None,
                    appointment_id: None,
                    patient_id: None,
                    amount_cents: 0,
                    method: "cash".into(),
                    kind: "PAYMENT".into(),
                    concept: None,
                    budget_id: None,
                }
            ),
            Err(OperationsError::Invalid(_))
        ));
    }

    #[test]
    fn cash_close_totals_net_of_refunds_and_freezes_day() {
        let conn = test_conn("cash-close");
        let session = open_cash_session(&conn, 100_00).unwrap();

        let pay = |amount: i64, method: &str, kind: &str| {
            register_payment(
                &conn,
                &PaymentInput {
                    visit_id: None,
                    appointment_id: None,
                    patient_id: None,
                    amount_cents: amount,
                    method: method.into(),
                    kind: kind.into(),
                    concept: None,
                    budget_id: None,
                },
            )
            .unwrap();
        };
        pay(300_00, "CASH", "PAYMENT");
        pay(200_00, "CASH", "DEPOSIT");
        pay(150_00, "CARD", "PAYMENT");
        pay(50_00, "CASH", "REFUND"); // reembolso en efectivo

        let summary = cash_summary(&conn, &session.id).unwrap();
        assert_eq!(summary.payment_count, 4);
        // Neto: 300 + 200 + 150 - 50 = 600 (en pesos) => 600_00 centavos.
        assert_eq!(summary.net_total_cents, 600_00);
        // Efectivo esperado: fondo 100 + (300 + 200 - 50) = 550 => 550_00.
        assert_eq!(summary.expected_cash_cents, 550_00);

        let cash_total = summary
            .by_method
            .iter()
            .find(|m| m.method == "CASH")
            .unwrap()
            .total_cents;
        assert_eq!(cash_total, 450_00);

        let closed = close_cash_session(&conn, 550_00, Some("Cuadra")).unwrap();
        assert!(closed.session.closed_at.is_some());
        assert_eq!(closed.session.closing_counted_cents, Some(550_00));

        // Dia congelado: no hay caja abierta para cobrar.
        assert!(get_open_session(&conn).unwrap().is_none());
        assert!(matches!(
            close_cash_session(&conn, 0, None),
            Err(OperationsError::NoOpenCashSession)
        ));
    }

    /// Siembra un extracto de cobro aceptado sin tocar nada clinico: es
    /// exactamente lo que la estacion de recepcion tendra a la mano.
    fn seed_billable(conn: &Connection, id: &str, patient_id: &str, total: i64) {
        conn.execute(
            "INSERT INTO billable_items
                (id, patient_id, concept, total_cents, status, created_at, updated_at)
             VALUES (?1, ?2, 'Corona de porcelana', ?3, 'ACCEPTED', '0', '0')",
            params![id, patient_id, total],
        )
        .unwrap();
    }

    #[test]
    fn payment_is_a_fact_and_its_allocation_is_a_separate_decision() {
        let conn = test_conn("allocation");
        open_cash_session(&conn, 0).unwrap();
        seed_billable(&conn, "bill-1", "p1", 150_000);

        let payment = register_payment(
            &conn,
            &PaymentInput {
                visit_id: None,
                appointment_id: None,
                patient_id: Some("p1".into()),
                amount_cents: 50_000,
                method: "CASH".into(),
                kind: "PAYMENT".into(),
                concept: None,
                budget_id: Some("bill-1".into()),
            },
        )
        .unwrap();

        // El cobro quedo asentado con folio, y su aplicacion es una fila aparte.
        assert_eq!(billable_paid_cents(&conn, "bill-1").unwrap(), 50_000);
        let allocated: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(amount_cents), 0) FROM payment_allocations
                 WHERE payment_id = ?1",
                params![payment.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(allocated, 50_000);

        // Reasignar es cambiar la decision contable, no el hecho: el cobro y su
        // folio quedan intactos y lo que se suelta es saldo a favor.
        conn.execute(
            "DELETE FROM payment_allocations WHERE payment_id = ?1",
            params![payment.id],
        )
        .unwrap();

        assert_eq!(billable_paid_cents(&conn, "bill-1").unwrap(), 0);
        let (amount, receipt): (i64, String) = conn
            .query_row(
                "SELECT amount_cents, receipt_number FROM payments WHERE id = ?1",
                params![payment.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(amount, 50_000, "el cobro no se toca nunca");
        assert_eq!(receipt, payment.receipt_number);

        let credit: i64 = conn
            .query_row(
                "SELECT p.amount_cents - COALESCE((SELECT SUM(a.amount_cents)
                        FROM payment_allocations a WHERE a.payment_id = p.id), 0)
                 FROM payments p WHERE p.id = ?1",
                params![payment.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(credit, 50_000, "lo no asignado es saldo a favor");
    }

    #[test]
    fn unallocated_money_becomes_credit_and_can_be_applied_elsewhere() {
        let mut conn = test_conn("credit");
        open_cash_session(&conn, 0).unwrap();
        seed_billable(&conn, "bill-1", "p1", 100_000);
        seed_billable(&conn, "bill-2", "p1", 80_000);

        // Un cobro sin presupuesto es dinero recibido sin destino: saldo a favor.
        register_payment(
            &conn,
            &PaymentInput {
                visit_id: None,
                appointment_id: None,
                patient_id: Some("p1".into()),
                amount_cents: 30_000,
                method: "CASH".into(),
                kind: "DEPOSIT".into(),
                concept: Some("Anticipo".into()),
                budget_id: None,
            },
        )
        .unwrap();
        assert_eq!(patient_credit_cents(&conn, "p1").unwrap(), 30_000);

        // Aplicarlo no emite recibo nuevo: el folio sigue siendo uno solo.
        let receipts_before: i64 = conn
            .query_row("SELECT count(*) FROM payments", [], |r| r.get(0))
            .unwrap();
        apply_credit_to_billable(&mut conn, "p1", "bill-1", 20_000).unwrap();
        let receipts_after: i64 = conn
            .query_row("SELECT count(*) FROM payments", [], |r| r.get(0))
            .unwrap();
        assert_eq!(receipts_before, receipts_after, "no nace un cobro nuevo");

        assert_eq!(billable_paid_cents(&conn, "bill-1").unwrap(), 20_000);
        assert_eq!(patient_credit_cents(&conn, "p1").unwrap(), 10_000);

        // El resto puede ir a otro presupuesto del mismo paciente.
        apply_credit_to_billable(&mut conn, "p1", "bill-2", 10_000).unwrap();
        assert_eq!(billable_paid_cents(&conn, "bill-2").unwrap(), 10_000);
        assert_eq!(patient_credit_cents(&conn, "p1").unwrap(), 0);

        // Sin saldo no se aplica nada.
        assert!(apply_credit_to_billable(&mut conn, "p1", "bill-1", 1).is_err());
    }

    #[test]
    fn applying_credit_is_a_decision_and_is_validated_in_full() {
        // Un cobro es un hecho consumado y solo admite aviso; aplicar saldo es
        // una decision y por eso si se valida en firme (paso 27, §4.2).
        let mut conn = test_conn("credit-gate");
        open_cash_session(&conn, 0).unwrap();
        seed_billable(&conn, "bill-1", "p1", 50_000);

        register_payment(
            &conn,
            &PaymentInput {
                visit_id: None,
                appointment_id: None,
                patient_id: Some("p1".into()),
                amount_cents: 90_000,
                method: "CASH".into(),
                kind: "DEPOSIT".into(),
                concept: None,
                budget_id: None,
            },
        )
        .unwrap();

        // Hay saldo de sobra, pero el presupuesto no admite mas que su total.
        assert!(apply_credit_to_billable(&mut conn, "p1", "bill-1", 60_000).is_err());
        apply_credit_to_billable(&mut conn, "p1", "bill-1", 50_000).unwrap();
        assert_eq!(patient_credit_cents(&conn, "p1").unwrap(), 40_000);

        // Un presupuesto que no esta aceptado no recibe saldo.
        conn.execute(
            "UPDATE billable_items SET status = 'PROPOSED' WHERE id = 'bill-1'",
            [],
        )
        .unwrap();
        assert!(apply_credit_to_billable(&mut conn, "p1", "bill-1", 1).is_err());

        // Y montos no positivos se rechazan.
        conn.execute(
            "UPDATE billable_items SET status = 'ACCEPTED' WHERE id = 'bill-1'",
            [],
        )
        .unwrap();
        assert!(apply_credit_to_billable(&mut conn, "p1", "bill-1", 0).is_err());
        assert!(apply_credit_to_billable(&mut conn, "p1", "bill-1", -5).is_err());
    }

    #[test]
    fn a_refund_takes_credit_back() {
        let conn = test_conn("credit-refund");
        open_cash_session(&conn, 0).unwrap();

        let deposit = |amount: i64, kind: &str| {
            register_payment(
                &conn,
                &PaymentInput {
                    visit_id: None,
                    appointment_id: None,
                    patient_id: Some("p1".into()),
                    amount_cents: amount,
                    method: "CASH".into(),
                    kind: kind.into(),
                    concept: None,
                    budget_id: None,
                },
            )
            .unwrap()
        };

        deposit(40_000, "DEPOSIT");
        assert_eq!(patient_credit_cents(&conn, "p1").unwrap(), 40_000);

        deposit(15_000, "REFUND");
        assert_eq!(patient_credit_cents(&conn, "p1").unwrap(), 25_000);
    }

    /// Deja al paciente con saldo a favor y la caja abierta.
    fn seed_credit(conn: &Connection, amount: i64) {
        open_cash_session(conn, 0).unwrap();
        register_payment(
            conn,
            &PaymentInput {
                visit_id: None,
                appointment_id: None,
                patient_id: Some("p1".into()),
                amount_cents: amount,
                method: "CASH".into(),
                kind: "DEPOSIT".into(),
                concept: None,
                budget_id: None,
            },
        )
        .unwrap();
    }

    /// Tablas CLINICO. La estacion de recepcion no tendra ninguna cuando la
    /// rebanada 3 parta el archivo; aqui se simula borrandolas.
    const CLINICAL_TABLES: &[&str] = &[
        "note_versions",
        "prescriptions",
        "documents",
        "precheckins",
        "patient_medical_history_versions",
        "consultation_transcriptions",
        "ai_runs",
        "ai_consents",
        "ai_benchmark_results",
        "ai_benchmark_runs",
        "arco_requests",
        "timeline_events",
        "patient_links",
        "dental_budget_items",
        "dental_budgets",
        "encounters",
        "patients",
    ];

    /// **Prueba de frontera del paso 27.** No busca texto en el codigo: deja la
    /// base sin una sola tabla CLINICO y corre la operacion completa de una
    /// jornada. Si algun dia alguien vuelve a meter el expediente en la caja,
    /// esto falla con "no such table" y nombra la tabla exacta.
    ///
    /// Es la version fuerte de lo que pedia el plan, y prueba por adelantado
    /// que la rebanada 3 puede partir el archivo sin romper recepcion.
    #[test]
    fn the_operational_surface_runs_with_no_clinical_tables_at_all() {
        let mut conn = test_conn("frontera");

        // Recepcion registra a quien llega: identidad, nada clinico.
        let visit = register_walk_in(
            &conn,
            &WalkInInput {
                patient_name: "Ana Ruiz".into(),
                patient_phone: Some("6141112222".into()),
                reason: Some("Dolor".into()),
                service_name: None,
                priority: None,
            },
        )
        .unwrap();
        let patient_id = visit.patient_id.clone().unwrap();
        seed_billable(&conn, "bill-1", &patient_id, 100_000);

        // Se corta el expediente de raiz. Sin IF EXISTS a proposito: un nombre
        // mal escrito tiene que reventar aqui y no volver esta prueba una
        // mentira que pasa sola.
        conn.pragma_update(None, "foreign_keys", "OFF").unwrap();
        for table in CLINICAL_TABLES {
            conn.execute(&format!("DROP TABLE {table}"), [])
                .unwrap_or_else(|e| panic!("no se pudo borrar {table}: {e}"));
        }
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        let left: i64 = conn
            .query_row(
                &format!(
                    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ({})",
                    CLINICAL_TABLES
                        .iter()
                        .map(|t| format!("'{t}'"))
                        .collect::<Vec<_>>()
                        .join(",")
                ),
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(left, 0, "quedaron tablas clinicas; la prueba no probaria nada");

        // A partir de aqui, todo lo que corra prueba que la caja vive sin el
        // expediente. Cualquier consulta que lo nombre revienta.
        let resource = create_resource(&conn, &NewResource { name: "Consultorio 1".into(), kind: "ROOM".into() }).unwrap();
        assign_resource(&conn, &visit.id, Some(&resource.id)).unwrap();
        assert!(!list_active_visits(&conn).unwrap().is_empty());

        open_cash_session(&conn, 50_000).unwrap();
        let payment = register_payment(
            &conn,
            &PaymentInput {
                visit_id: Some(visit.id.clone()),
                appointment_id: None,
                patient_id: Some(patient_id.clone()),
                amount_cents: 60_000,
                method: "CASH".into(),
                kind: "PAYMENT".into(),
                concept: Some("Abono".into()),
                budget_id: Some("bill-1".into()),
            },
        )
        .unwrap();

        // Cobro, saldo, recibo y reembolso: la jornada entera sin expediente.
        assert_eq!(billable_paid_cents(&conn, "bill-1").unwrap(), 60_000);
        assert_eq!(list_session_payments(&conn, &payment.cash_session_id).unwrap().len(), 1);

        let receipt = build_receipt(&conn, &payment.id).unwrap();
        assert_eq!(receipt.patient_name.as_deref(), Some("Ana Ruiz"));
        assert_eq!(receipt.amount_cents, 60_000);

        register_payment(
            &conn,
            &PaymentInput {
                visit_id: None,
                appointment_id: None,
                patient_id: Some(patient_id.clone()),
                amount_cents: 20_000,
                method: "CASH".into(),
                kind: "DEPOSIT".into(),
                concept: None,
                budget_id: None,
            },
        )
        .unwrap();
        assert_eq!(patient_credit_cents(&conn, &patient_id).unwrap(), 20_000);
        apply_credit_to_billable(&mut conn, &patient_id, "bill-1", 20_000).unwrap();
        assert_eq!(billable_paid_cents(&conn, "bill-1").unwrap(), 80_000);

        let request = request_refund(&conn, &patient_id, 5_000, None, None);
        assert!(request.is_err(), "sin saldo libre no hay reembolso");

        set_visit_state(&conn, &visit.id, "DONE").unwrap();
        let summary = close_cash_session(&conn, 130_000, None).unwrap();
        assert_eq!(summary.payment_count, 2);
        assert_eq!(summary.net_total_cents, 80_000);
        assert_eq!(summary.expected_cash_cents, 130_000);
    }

    #[test]
    fn each_station_keeps_its_own_drawer_and_its_own_receipt_series() {
        // El medico tambien cobra, asi que hay dos cajones. Las dos garantias
        // que eran locales -- una caja abierta a la vez, un folio unico -- solo
        // valen dentro de su estacion.
        let conn = test_conn("estaciones");
        conn.execute(
            "INSERT INTO stations (id, code, name, mode, created_at)
             VALUES ('station-b', 'B', 'Consultorio del medico', 'CLINICAL', '2030-01-01')",
            [],
        )
        .unwrap();

        // La estacion local es la primera por fecha de alta: la de recepcion.
        let local = local_station(&conn).unwrap();
        assert_eq!(local.code, "A");

        open_cash_session(&conn, 0).unwrap();
        let charge = || {
            register_payment(
                &conn,
                &PaymentInput {
                    visit_id: None,
                    appointment_id: None,
                    patient_id: None,
                    amount_cents: 10_000,
                    method: "CASH".into(),
                    kind: "PAYMENT".into(),
                    concept: None,
                    budget_id: None,
                },
            )
            .unwrap()
        };
        assert_eq!(charge().receipt_number, "R-A-000001");
        assert_eq!(charge().receipt_number, "R-A-000002");

        // La otra estacion abre su propia caja: el indice unico es por
        // estacion, no global. Antes esto habria sido CashSessionAlreadyOpen.
        conn.execute(
            "INSERT INTO cash_sessions (id, opened_at, opening_float_cents, station_id)
             VALUES ('sesion-b', '2030-01-01', 0, 'station-b')",
            [],
        )
        .unwrap();

        let abiertas: i64 = conn
            .query_row(
                "SELECT count(*) FROM cash_sessions WHERE closed_at IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(abiertas, 2, "un cajon por estacion, ambos abiertos");

        // Y ninguna estacion ve la caja de la otra como suya.
        let mia = get_open_session(&conn).unwrap().unwrap();
        assert_ne!(mia.id, "sesion-b");

        // Dos cajas abiertas en la MISMA estacion siguen prohibidas.
        assert!(matches!(
            open_cash_session(&conn, 0),
            Err(OperationsError::CashSessionAlreadyOpen)
        ));

        // El corte del dia es por cajon: solo cuenta lo cobrado en el suyo.
        let summary = close_cash_session(&conn, 20_000, None).unwrap();
        assert_eq!(summary.payment_count, 2);
        assert_eq!(summary.net_total_cents, 20_000);
    }

    #[test]
    fn receipt_detail_defaults_to_the_clinical_profile() {
        // Un consultorio recien instalado nunca empieza filtrando de menos:
        // fuera de odontologia el default es generico.
        assert_eq!(
            ReceiptDetail::from_stored(None, Some("ODONTOLOGY")),
            ReceiptDetail::Detailed
        );
        assert_eq!(
            ReceiptDetail::from_stored(None, Some("GENERAL_MEDICINE")),
            ReceiptDetail::Generic
        );
        assert_eq!(ReceiptDetail::from_stored(None, None), ReceiptDetail::Generic);

        // El ajuste explicito del consultorio manda sobre el default.
        assert_eq!(
            ReceiptDetail::from_stored(Some("AMOUNT_ONLY"), Some("ODONTOLOGY")),
            ReceiptDetail::AmountOnly
        );
        assert_eq!(
            ReceiptDetail::from_stored(Some("DETAILED"), Some("GENERAL_MEDICINE")),
            ReceiptDetail::Detailed
        );
    }

    #[test]
    fn the_concept_says_only_what_its_level_allows() {
        let treatment = Some("Corona de porcelana, pieza 26");

        // Detallado deja pasar el tratamiento; es la decision del consultorio.
        assert_eq!(
            receipt_concept(ReceiptDetail::Detailed, treatment, None, Some("ODONTOLOGY")),
            Some("Corona de porcelana, pieza 26".to_string())
        );

        // Generico lo reemplaza: el recibo cuadra sin nombrar el procedimiento.
        assert_eq!(
            receipt_concept(ReceiptDetail::Generic, treatment, None, Some("ODONTOLOGY")),
            Some("Tratamiento dental".to_string())
        );
        assert_eq!(
            receipt_concept(ReceiptDetail::Generic, treatment, None, Some("GENERAL_MEDICINE")),
            Some("Consulta medica".to_string())
        );

        // Solo monto no dice nada, ni siquiera generico.
        assert_eq!(
            receipt_concept(ReceiptDetail::AmountOnly, treatment, None, Some("ODONTOLOGY")),
            None
        );

        // Sin presupuesto detras, el detalle cae al concepto que capturo la caja.
        assert_eq!(
            receipt_concept(ReceiptDetail::Detailed, None, Some("Consulta de control"), None),
            Some("Consulta de control".to_string())
        );
        // Y un concepto en blanco no se imprime como cadena vacia.
        assert_eq!(
            receipt_concept(ReceiptDetail::Detailed, None, Some("   "), None),
            None
        );
    }

    #[test]
    fn receipt_gathers_folio_patient_and_concept_without_touching_the_record() {
        let conn = test_conn("receipt");
        conn.execute(
            "INSERT INTO patient_identities (id, first_name, last_name, created_at, updated_at)
             VALUES ('p1', 'Ana', 'Ruiz', '0', '0')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sync_state (key, value) VALUES
                ('clinic_name', 'Consultorio Ruiz'),
                ('clinic_license', 'CED-12345'),
                ('receipt_detail', 'DETAILED'),
                ('clinical_profile', 'ODONTOLOGY')",
            [],
        )
        .unwrap();
        open_cash_session(&conn, 0).unwrap();
        seed_billable(&conn, "bill-1", "p1", 150_000);

        let payment = register_payment(
            &conn,
            &PaymentInput {
                visit_id: None,
                appointment_id: None,
                patient_id: Some("p1".into()),
                amount_cents: 50_000,
                method: "CARD".into(),
                kind: "PAYMENT".into(),
                concept: None,
                budget_id: Some("bill-1".into()),
            },
        )
        .unwrap();

        let receipt = build_receipt(&conn, &payment.id).unwrap();
        assert_eq!(receipt.receipt_number, payment.receipt_number);
        assert_eq!(receipt.patient_name.as_deref(), Some("Ana Ruiz"));
        assert_eq!(receipt.concept.as_deref(), Some("Corona de porcelana"));
        assert_eq!(receipt.amount_cents, 50_000);
        assert_eq!(receipt.method, "CARD");
        assert_eq!(receipt.clinic_name.as_deref(), Some("Consultorio Ruiz"));
        assert_eq!(receipt.clinic_license.as_deref(), Some("CED-12345"));

        // Bajar el nivel oculta el tratamiento sin tocar el cobro.
        conn.execute(
            "UPDATE sync_state SET value = 'AMOUNT_ONLY' WHERE key = 'receipt_detail'",
            [],
        )
        .unwrap();
        let discreet = build_receipt(&conn, &payment.id).unwrap();
        assert_eq!(discreet.concept, None);
        assert_eq!(discreet.amount_cents, 50_000);
        assert_eq!(discreet.receipt_number, payment.receipt_number);
    }

    #[test]
    fn a_refund_needs_the_doctors_authorization_before_any_cash_leaves() {
        let mut conn = test_conn("refund-gate");
        seed_credit(&conn, 40_000);

        let request = request_refund(&conn, "p1", 15_000, Some("Cancelo tratamiento"), None).unwrap();
        assert_eq!(request.status, "PENDING");

        // Sin autorizar no sale un peso.
        assert!(emit_authorized_refund(&mut conn, &request.id, "CASH").is_err());
        assert_eq!(patient_credit_cents(&conn, "p1").unwrap(), 40_000);

        let authorized =
            decide_refund_request(&conn, &request.id, true, Some("dra-ruiz")).unwrap();
        assert_eq!(authorized.status, "AUTHORIZED");
        assert_eq!(authorized.authorized_by.as_deref(), Some("dra-ruiz"));

        let payment = emit_authorized_refund(&mut conn, &request.id, "CASH").unwrap();
        assert_eq!(payment.kind, "REFUND");
        assert_eq!(payment.amount_cents, 15_000);
        assert!(!payment.receipt_number.is_empty(), "el reembolso lleva folio");

        // El saldo bajo por el reembolso entregado.
        assert_eq!(patient_credit_cents(&conn, "p1").unwrap(), 25_000);
    }

    #[test]
    fn an_authorization_can_only_be_spent_once() {
        // Sin esto, la misma aprobacion podria cobrarse dos veces: una por el
        // camino del medico presente y otra por la solicitud pendiente.
        let mut conn = test_conn("refund-once");
        seed_credit(&conn, 50_000);

        let request = request_refund(&conn, "p1", 10_000, None, None).unwrap();
        decide_refund_request(&conn, &request.id, true, Some("dra-ruiz")).unwrap();

        emit_authorized_refund(&mut conn, &request.id, "CASH").unwrap();
        assert!(
            emit_authorized_refund(&mut conn, &request.id, "CASH").is_err(),
            "la autorizacion se consume al emitir"
        );

        // Un solo movimiento de reembolso, no dos.
        let refunds: i64 = conn
            .query_row(
                "SELECT count(*) FROM payments WHERE kind = 'REFUND'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(refunds, 1);
        assert_eq!(patient_credit_cents(&conn, "p1").unwrap(), 40_000);
    }

    #[test]
    fn a_rejected_request_never_becomes_money() {
        let mut conn = test_conn("refund-rejected");
        seed_credit(&conn, 30_000);

        let request = request_refund(&conn, "p1", 10_000, None, None).unwrap();
        let decided = decide_refund_request(&conn, &request.id, false, Some("dra-ruiz")).unwrap();
        assert_eq!(decided.status, "REJECTED");

        assert!(emit_authorized_refund(&mut conn, &request.id, "CASH").is_err());
        // Decidir dos veces tampoco: ya no esta pendiente.
        assert!(decide_refund_request(&conn, &request.id, true, None).is_err());
        assert_eq!(patient_credit_cents(&conn, "p1").unwrap(), 30_000);
    }

    #[test]
    fn credit_spent_between_authorization_and_delivery_blocks_the_refund() {
        // Sale dinero: el saldo se revalida al entregar, no se asume. Entre la
        // firma del medico y el mostrador el paciente pudo aplicarlo a un
        // tratamiento.
        let mut conn = test_conn("refund-stale");
        seed_credit(&conn, 20_000);
        seed_billable(&conn, "bill-1", "p1", 20_000);

        let request = request_refund(&conn, "p1", 20_000, None, None).unwrap();
        decide_refund_request(&conn, &request.id, true, Some("dra-ruiz")).unwrap();

        apply_credit_to_billable(&mut conn, "p1", "bill-1", 20_000).unwrap();
        assert_eq!(patient_credit_cents(&conn, "p1").unwrap(), 0);

        assert!(emit_authorized_refund(&mut conn, &request.id, "CASH").is_err());
    }

    #[test]
    fn a_refund_request_cannot_exceed_the_available_credit() {
        let conn = test_conn("refund-limit");
        seed_credit(&conn, 10_000);

        assert!(request_refund(&conn, "p1", 15_000, None, None).is_err());
        assert!(request_refund(&conn, "p1", 0, None, None).is_err());
        assert!(request_refund(&conn, "p1", 10_000, None, None).is_ok());

        let pending = list_pending_refund_requests(&conn).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].amount_cents, 10_000);
    }

    #[test]
    fn session_payments_report_the_budget_from_the_allocation() {
        // Ninguna prueba leia la lista de movimientos de la caja, asi que al
        // soltar payments.budget_id la consulta quedo rota sin que nada
        // avisara. El presupuesto ahora sale de la asignacion.
        let conn = test_conn("session-list");
        let session = open_cash_session(&conn, 0).unwrap();
        seed_billable(&conn, "bill-1", "p1", 100_000);

        register_payment(
            &conn,
            &PaymentInput {
                visit_id: None,
                appointment_id: None,
                patient_id: Some("p1".into()),
                amount_cents: 40_000,
                method: "CASH".into(),
                kind: "PAYMENT".into(),
                concept: Some("Abono".into()),
                budget_id: Some("bill-1".into()),
            },
        )
        .unwrap();
        register_payment(
            &conn,
            &PaymentInput {
                visit_id: None,
                appointment_id: None,
                patient_id: Some("p1".into()),
                amount_cents: 20_000,
                method: "CARD".into(),
                kind: "PAYMENT".into(),
                concept: Some("Consulta".into()),
                budget_id: None,
            },
        )
        .unwrap();

        let payments = list_session_payments(&conn, &session.id).unwrap();
        assert_eq!(payments.len(), 2);

        let linked = payments
            .iter()
            .find(|p| p.amount_cents == 40_000)
            .expect("el abono al presupuesto");
        assert_eq!(linked.budget_id.as_deref(), Some("bill-1"));

        let loose = payments
            .iter()
            .find(|p| p.amount_cents == 20_000)
            .expect("el cobro suelto");
        assert_eq!(loose.budget_id, None);
    }

    #[test]
    fn cash_validates_budgets_without_reading_the_clinical_record() {
        let conn = test_conn("billable-gate");
        open_cash_session(&conn, 0).unwrap();
        seed_billable(&conn, "bill-1", "p1", 100_000);

        let charge = |amount: i64, kind: &str| {
            register_payment(
                &conn,
                &PaymentInput {
                    visit_id: None,
                    appointment_id: None,
                    patient_id: Some("p1".into()),
                    amount_cents: amount,
                    method: "CASH".into(),
                    kind: kind.into(),
                    concept: None,
                    budget_id: Some("bill-1".into()),
                },
            )
        };

        // No hay una sola fila en dental_budgets y la caja cobra igual: el
        // extracto le basta. Esa es la frontera.
        let budgets: i64 = conn
            .query_row("SELECT count(*) FROM dental_budgets", [], |row| row.get(0))
            .unwrap();
        assert_eq!(budgets, 0);

        charge(60_000, "PAYMENT").unwrap();
        assert!(charge(60_000, "PAYMENT").is_err(), "avisa del sobreabono");
        assert!(charge(90_000, "REFUND").is_err(), "no reembolsa de mas");

        // Un extracto no aceptado no recibe abonos.
        conn.execute(
            "UPDATE billable_items SET status = 'REJECTED' WHERE id = 'bill-1'",
            [],
        )
        .unwrap();
        assert!(charge(1_000, "PAYMENT").is_err());
    }
}
