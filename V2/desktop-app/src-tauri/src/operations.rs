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

    // Paciente local minimo: una consulta sin cita siempre genera expediente.
    let patient_id = uuid::Uuid::new_v4().to_string();
    let (first, last) = match name.split_once(' ') {
        Some((f, l)) => (f.to_string(), l.to_string()),
        None => (name.to_string(), String::new()),
    };
    let timestamp = now();
    conn.execute(
        "INSERT INTO patients (id, first_name, last_name, phone, created_at, updated_at)
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
        "SELECT EXISTS (SELECT 1 FROM patients WHERE id = ?1)",
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

pub fn get_open_session(conn: &Connection) -> Result<Option<CashSession>, OperationsError> {
    conn.query_row(
        "SELECT id, opened_at, opening_float_cents, closed_at, closing_counted_cents, notes
         FROM cash_sessions WHERE closed_at IS NULL",
        [],
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
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO cash_sessions (id, opened_at, opening_float_cents) VALUES (?1, ?2, ?3)",
        params![id, now(), opening_float_cents],
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
}

/// Folio de recibo monotono y persistente (sobrevive borrados; aqui no hay
/// borrados). Se guarda el siguiente valor en `app_meta`.
fn next_receipt_number(conn: &Connection) -> Result<String, OperationsError> {
    let current: i64 = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'receipt_seq'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .and_then(|raw| raw.parse().ok())
        .unwrap_or(0);
    let next = current + 1;
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES ('receipt_seq', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
        params![next.to_string()],
    )?;
    Ok(format!("R-{next:06}"))
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

    let session = get_open_session(conn)?.ok_or(OperationsError::NoOpenCashSession)?;
    let receipt_number = next_receipt_number(conn)?;
    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = now();
    conn.execute(
        "INSERT INTO payments
            (id, cash_session_id, visit_id, appointment_id, patient_id, amount_cents,
             method, kind, concept, receipt_number, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            id, session.id, input.visit_id, input.appointment_id, input.patient_id,
            input.amount_cents, method, kind, input.concept, receipt_number, timestamp
        ],
    )?;
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
        receipt_number,
        created_at: timestamp,
    })
}

pub fn list_session_payments(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<Payment>, OperationsError> {
    let mut statement = conn.prepare(
        "SELECT id, cash_session_id, visit_id, patient_id, amount_cents, method, kind,
                concept, receipt_number, created_at
         FROM payments WHERE cash_session_id = ?1 ORDER BY created_at DESC",
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
                receipt_number: row.get(8)?,
                created_at: row.get(9)?,
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
            "INSERT INTO patients (id, first_name, last_name, created_at, updated_at)
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
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM patients WHERE id = ?1)",
                params![patient_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(exists);

        // Walk-in abre expediente sin cita.
        let encounter = crate::clinical::open_encounter_for_patient(&conn, &patient_id).unwrap();
        assert!(encounter.appointment_id.is_none());
        assert_eq!(encounter.patient_id, patient_id);
    }

    #[test]
    fn walk_in_for_patient_links_without_creating_a_new_patient() {
        let conn = test_conn("walkin-link");
        conn.execute(
            "INSERT INTO patients (id, first_name, last_name, created_at, updated_at)
             VALUES ('pat-1', 'Ana', 'Lopez', '0', '0')",
            [],
        )
        .unwrap();
        let before: i64 = conn
            .query_row("SELECT count(*) FROM patients", [], |r| r.get(0))
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
            .query_row("SELECT count(*) FROM patients", [], |r| r.get(0))
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
            },
        )
        .unwrap();
        assert_eq!(p1.receipt_number, "R-000001");
        assert_eq!(p2.receipt_number, "R-000002");
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
}
