//! Presupuestos dentales y saldos por paciente (paso 26 rebanada 3).
//!
//! Clase de residencia: OPERATIVO — presupuestos, partidas y saldos viven en
//! la base cifrada local y nunca tocan la red. El dinero queda fuera del
//! payload clinico: el plan dental de la nota describe procedimientos, y este
//! modulo les pone precio en tablas propias.
//!
//! Los abonos NO se registran aqui: se asientan por la caja del paso 10
//! (`operations::register_payment`) con referencia `budget_id`, de modo que
//! exista una sola contabilidad. Este modulo solo valida esos abonos y lee sus
//! totales para calcular saldos.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum DentalError {
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Invalid(String),
    #[error("presupuesto no encontrado")]
    NotFound,
}

const BUDGET_STATUSES: &[&str] = &["PROPOSED", "ACCEPTED", "REJECTED"];
const ITEM_STATUSES: &[&str] = &["PLANNED", "IN_PROGRESS", "COMPLETED"];

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn audit(
    conn: &Connection,
    entity_id: &str,
    action: &str,
    details: Option<&str>,
) -> Result<(), DentalError> {
    conn.execute(
        "INSERT INTO clinical_audit (entity, entity_id, action, at, details)
         VALUES ('dental_budget', ?1, ?2, ?3, ?4)",
        params![entity_id, action, now(), details],
    )?;
    Ok(())
}

/* ---------- Tipos ---------- */

#[derive(Debug, Deserialize)]
pub struct BudgetItemInput {
    pub tooth_id: String,
    pub procedure: String,
    pub price_cents: i64,
}

#[derive(Debug, Deserialize)]
pub struct NewBudget {
    pub patient_id: String,
    pub encounter_id: Option<String>,
    pub label: String,
    pub notes: Option<String>,
    pub discount_cents: i64,
    /// Presupuestos alternativos del mismo plan comparten grupo: aceptar uno
    /// rechaza automaticamente a los demas propuestos del grupo.
    pub alternative_group: Option<String>,
    pub items: Vec<BudgetItemInput>,
}

#[derive(Debug, Serialize)]
pub struct BudgetItem {
    pub id: String,
    pub budget_id: String,
    pub tooth_id: String,
    pub procedure: String,
    pub price_cents: i64,
    pub status: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Budget {
    pub id: String,
    pub patient_id: String,
    pub encounter_id: Option<String>,
    pub label: String,
    pub status: String,
    pub discount_cents: i64,
    pub notes: Option<String>,
    pub alternative_group: Option<String>,
    pub created_at: String,
    pub decided_at: Option<String>,
    pub items: Vec<BudgetItem>,
    pub total_cents: i64,
    pub paid_cents: i64,
    pub balance_cents: i64,
}

/// Saldo dental global del paciente: solo cuentan los presupuestos aceptados.
#[derive(Debug, Serialize)]
pub struct DentalBalance {
    pub accepted_total_cents: i64,
    pub paid_cents: i64,
    pub balance_cents: i64,
    pub accepted_budgets: i64,
}

/* ---------- Lecturas ---------- */

fn read_items(conn: &Connection, budget_id: &str) -> Result<Vec<BudgetItem>, DentalError> {
    let mut statement = conn.prepare(
        "SELECT id, budget_id, tooth_id, procedure, price_cents, status, completed_at
         FROM dental_budget_items WHERE budget_id = ?1 ORDER BY rowid",
    )?;
    let rows = statement
        .query_map(params![budget_id], |row| {
            Ok(BudgetItem {
                id: row.get(0)?,
                budget_id: row.get(1)?,
                tooth_id: row.get(2)?,
                procedure: row.get(3)?,
                price_cents: row.get(4)?,
                status: row.get(5)?,
                completed_at: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Abonos netos aplicados a este presupuesto (reembolsos restan). Se leen de
/// las asignaciones, no de los cobros: un cobro es dinero recibido, y cuanto de
/// el corresponde a este presupuesto es una decision contable aparte (paso 27).
fn paid_cents(conn: &Connection, budget_id: &str) -> Result<i64, DentalError> {
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(CASE WHEN p.kind = 'REFUND' THEN -a.amount_cents
                                  ELSE a.amount_cents END), 0)
         FROM payment_allocations a
         JOIN payments p ON p.id = a.payment_id
         WHERE a.billable_id = ?1",
        params![budget_id],
        |row| row.get(0),
    )?)
}

/// Publica el extracto de cobro (clase FACTURABLE) que la estacion operativa
/// usa para cobrar sin poder leer el expediente. La estacion clinica es su
/// autoridad: aqui se crea y aqui se actualiza.
fn publish_billable(
    conn: &Connection,
    budget: &Budget,
    concept: &str,
) -> Result<(), DentalError> {
    conn.execute(
        "INSERT INTO billable_items
            (id, patient_id, concept, total_cents, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
            concept = excluded.concept,
            total_cents = excluded.total_cents,
            status = excluded.status,
            updated_at = excluded.updated_at",
        params![
            budget.id,
            budget.patient_id,
            concept,
            budget.total_cents,
            budget.status,
            now()
        ],
    )?;
    Ok(())
}

pub fn read_budget(conn: &Connection, budget_id: &str) -> Result<Budget, DentalError> {
    let row = conn
        .query_row(
            "SELECT id, patient_id, encounter_id, label, status, discount_cents, notes,
                    alternative_group, created_at, decided_at
             FROM dental_budgets WHERE id = ?1",
            params![budget_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, Option<String>>(9)?,
                ))
            },
        )
        .optional()?
        .ok_or(DentalError::NotFound)?;

    let items = read_items(conn, &row.0)?;
    let gross: i64 = items.iter().map(|item| item.price_cents).sum();
    let total = gross - row.5;
    let paid = paid_cents(conn, &row.0)?;
    Ok(Budget {
        id: row.0,
        patient_id: row.1,
        encounter_id: row.2,
        label: row.3,
        status: row.4,
        discount_cents: row.5,
        notes: row.6,
        alternative_group: row.7,
        created_at: row.8,
        decided_at: row.9,
        total_cents: total,
        paid_cents: paid,
        balance_cents: total - paid,
        items,
    })
}

pub fn list_patient_budgets(
    conn: &Connection,
    patient_id: &str,
) -> Result<Vec<Budget>, DentalError> {
    let mut statement = conn.prepare(
        "SELECT id FROM dental_budgets WHERE patient_id = ?1 ORDER BY created_at DESC, rowid DESC",
    )?;
    let ids = statement
        .query_map(params![patient_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    ids.iter().map(|id| read_budget(conn, id)).collect()
}

pub fn patient_dental_balance(
    conn: &Connection,
    patient_id: &str,
) -> Result<DentalBalance, DentalError> {
    let budgets = list_patient_budgets(conn, patient_id)?;
    let accepted: Vec<&Budget> = budgets
        .iter()
        .filter(|budget| budget.status == "ACCEPTED")
        .collect();
    let total: i64 = accepted.iter().map(|budget| budget.total_cents).sum();
    let paid: i64 = accepted.iter().map(|budget| budget.paid_cents).sum();
    Ok(DentalBalance {
        accepted_total_cents: total,
        paid_cents: paid,
        balance_cents: total - paid,
        accepted_budgets: accepted.len() as i64,
    })
}

/// Historial de payloads de especialidad del paciente (ultima version de la
/// nota por encuentro, del mas antiguo al mas reciente). Lo usa el indice de
/// placa para graficar la evolucion de higiene entre consultas; el porcentaje
/// se calcula en la UI con la misma funcion pura que la captura en vivo.
#[derive(Debug, Serialize)]
pub struct SpecialtyHistoryEntry {
    pub encounter_id: String,
    pub opened_at: String,
    pub signed_at: Option<String>,
    pub status: String,
    pub specialty_json: String,
}

pub fn specialty_history(
    conn: &Connection,
    patient_id: &str,
) -> Result<Vec<SpecialtyHistoryEntry>, DentalError> {
    let mut statement = conn.prepare(
        "SELECT e.id, e.opened_at, e.signed_at, e.status, nv.specialty_payload
         FROM encounters e
         JOIN note_versions nv ON nv.encounter_id = e.id
         WHERE e.patient_id = ?1
           AND nv.version = (
               SELECT MAX(version) FROM note_versions WHERE encounter_id = e.id
           )
         ORDER BY e.opened_at ASC, e.id ASC",
    )?;
    let rows = statement
        .query_map(params![patient_id], |row| {
            Ok(SpecialtyHistoryEntry {
                encounter_id: row.get(0)?,
                opened_at: row.get(1)?,
                signed_at: row.get(2)?,
                status: row.get(3)?,
                specialty_json: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/* ---------- Escrituras ---------- */

pub fn create_budget(conn: &Connection, input: &NewBudget) -> Result<Budget, DentalError> {
    if input.label.trim().is_empty() {
        return Err(DentalError::Invalid("el presupuesto necesita un nombre".into()));
    }
    if input.items.is_empty() {
        return Err(DentalError::Invalid(
            "el presupuesto necesita al menos una partida".into(),
        ));
    }
    for item in &input.items {
        if item.procedure.trim().is_empty() {
            return Err(DentalError::Invalid(
                "cada partida necesita un procedimiento".into(),
            ));
        }
        if item.price_cents < 0 {
            return Err(DentalError::Invalid("el precio no puede ser negativo".into()));
        }
    }
    let gross: i64 = input.items.iter().map(|item| item.price_cents).sum();
    if input.discount_cents < 0 || input.discount_cents > gross {
        return Err(DentalError::Invalid(
            "el descuento debe estar entre cero y el total".into(),
        ));
    }

    let patient_exists: bool = conn
        .query_row(
            "SELECT 1 FROM patients WHERE id = ?1",
            params![input.patient_id],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);
    if !patient_exists {
        return Err(DentalError::Invalid("paciente no encontrado".into()));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = now();
    conn.execute(
        "INSERT INTO dental_budgets
            (id, patient_id, encounter_id, label, status, discount_cents, notes,
             alternative_group, created_at)
         VALUES (?1, ?2, ?3, ?4, 'PROPOSED', ?5, ?6, ?7, ?8)",
        params![
            id,
            input.patient_id,
            input.encounter_id,
            input.label.trim(),
            input.discount_cents,
            input.notes,
            input.alternative_group,
            timestamp
        ],
    )?;
    for item in &input.items {
        conn.execute(
            "INSERT INTO dental_budget_items
                (id, budget_id, tooth_id, procedure, price_cents, status)
             VALUES (?1, ?2, ?3, ?4, ?5, 'PLANNED')",
            params![
                uuid::Uuid::new_v4().to_string(),
                id,
                item.tooth_id.trim(),
                item.procedure.trim(),
                item.price_cents
            ],
        )?;
    }
    audit(conn, &id, "created", None)?;
    let budget = read_budget(conn, &id)?;
    // El concepto que vera el recibo sale del nombre que el medico le puso al
    // presupuesto: es texto que el redacto, no un volcado de la nota.
    publish_billable(conn, &budget, input.label.trim())?;
    Ok(budget)
}

/// Acepta o rechaza un presupuesto propuesto. Aceptar uno rechaza en
/// automatico a los demas propuestos de su grupo de alternativas.
pub fn decide_budget(
    conn: &Connection,
    budget_id: &str,
    status: &str,
) -> Result<Budget, DentalError> {
    let status = status.trim().to_uppercase();
    if !BUDGET_STATUSES.contains(&status.as_str()) || status == "PROPOSED" {
        return Err(DentalError::Invalid("decision invalida".into()));
    }
    let current = read_budget(conn, budget_id)?;
    if current.status != "PROPOSED" {
        return Err(DentalError::Invalid(
            "solo un presupuesto propuesto puede decidirse".into(),
        ));
    }
    let timestamp = now();
    conn.execute(
        "UPDATE dental_budgets SET status = ?1, decided_at = ?2 WHERE id = ?3",
        params![status, timestamp, budget_id],
    )?;
    if status == "ACCEPTED" {
        if let Some(group) = &current.alternative_group {
            conn.execute(
                "UPDATE dental_budgets SET status = 'REJECTED', decided_at = ?1
                 WHERE alternative_group = ?2 AND patient_id = ?3
                   AND id != ?4 AND status = 'PROPOSED'",
                params![timestamp, group, current.patient_id, budget_id],
            )?;
        }
    }
    audit(conn, budget_id, "decided", Some(&status))?;
    let budget = read_budget(conn, budget_id)?;
    publish_billable(conn, &budget, &budget.label)?;

    // Aceptar uno rechaza a sus alternativas: sus extractos tienen que
    // enterarse, o la caja seguiria aceptando abonos contra un presupuesto
    // que ya no esta vigente.
    if status == "ACCEPTED" {
        if let Some(group) = &current.alternative_group {
            conn.execute(
                "UPDATE billable_items SET status = 'REJECTED', updated_at = ?1
                 WHERE id IN (SELECT id FROM dental_budgets
                              WHERE alternative_group = ?2 AND patient_id = ?3
                                AND id != ?4 AND status = 'REJECTED')",
                params![timestamp, group, current.patient_id, budget_id],
            )?;
        }
    }
    Ok(budget)
}

/// Avance clinico de una partida. Solo progresa dentro de un presupuesto
/// aceptado; regresar a PLANNED limpia la fecha de realizacion.
pub fn set_item_status(
    conn: &Connection,
    item_id: &str,
    status: &str,
) -> Result<Budget, DentalError> {
    let status = status.trim().to_uppercase();
    if !ITEM_STATUSES.contains(&status.as_str()) {
        return Err(DentalError::Invalid("estado de partida invalido".into()));
    }
    let budget_id: String = conn
        .query_row(
            "SELECT budget_id FROM dental_budget_items WHERE id = ?1",
            params![item_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or(DentalError::NotFound)?;
    let budget = read_budget(conn, &budget_id)?;
    if budget.status != "ACCEPTED" && status != "PLANNED" {
        return Err(DentalError::Invalid(
            "solo un presupuesto aceptado registra avance".into(),
        ));
    }
    let completed_at = if status == "COMPLETED" { Some(now()) } else { None };
    conn.execute(
        "UPDATE dental_budget_items SET status = ?1, completed_at = ?2 WHERE id = ?3",
        params![status, completed_at, item_id],
    )?;
    audit(conn, &budget_id, "item_status", Some(&status))?;
    read_budget(conn, &budget_id)
}

// La validacion de un movimiento contra el presupuesto ya no vive aqui: se
// mudo a `operations::validate_billable_payment`, que la resuelve contra el
// extracto de cobro (FACTURABLE) sin leer una sola tabla clinica. Era la unica
// puerta por la que la caja entraba al expediente.

/* ---------- Ordenes de laboratorio (rebanada 4) ---------- */

/// Flujo de una orden: POR ENVIAR -> ENVIADA -> RECIBIDA -> ENTREGADA, con
/// cancelacion permitida mientras no se entregue. Cada transicion sella su
/// fecha; no hay retrocesos (una equivocacion se cancela y se rehace).
const LAB_ORDER_STATUSES: &[&str] = &["PENDING", "SENT", "RECEIVED", "DELIVERED", "CANCELLED"];

#[derive(Debug, Deserialize)]
pub struct NewLabOrder {
    pub patient_id: String,
    pub encounter_id: Option<String>,
    pub tooth_id: String,
    pub work_type: String,
    pub lab_name: String,
    pub promised_at: Option<String>,
    pub cost_cents: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LabOrder {
    pub id: String,
    pub patient_id: String,
    pub encounter_id: Option<String>,
    pub tooth_id: String,
    pub work_type: String,
    pub lab_name: String,
    pub status: String,
    pub promised_at: Option<String>,
    pub sent_at: Option<String>,
    pub received_at: Option<String>,
    pub delivered_at: Option<String>,
    pub cost_cents: i64,
    pub notes: Option<String>,
    pub created_at: String,
}

/// Pendiente global (por enviar o enviada) con el nombre del paciente, para
/// la vista de recepcion: que ningun trabajo se pierda entre sesiones.
#[derive(Debug, Serialize)]
pub struct PendingLabOrder {
    #[serde(flatten)]
    pub order: LabOrder,
    pub patient_name: String,
}

const LAB_ORDER_COLUMNS: &str = "id, patient_id, encounter_id, tooth_id, work_type, lab_name,
    status, promised_at, sent_at, received_at, delivered_at, cost_cents, notes, created_at";

fn lab_order_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LabOrder> {
    Ok(LabOrder {
        id: row.get(0)?,
        patient_id: row.get(1)?,
        encounter_id: row.get(2)?,
        tooth_id: row.get(3)?,
        work_type: row.get(4)?,
        lab_name: row.get(5)?,
        status: row.get(6)?,
        promised_at: row.get(7)?,
        sent_at: row.get(8)?,
        received_at: row.get(9)?,
        delivered_at: row.get(10)?,
        cost_cents: row.get(11)?,
        notes: row.get(12)?,
        created_at: row.get(13)?,
    })
}

fn read_lab_order(conn: &Connection, order_id: &str) -> Result<LabOrder, DentalError> {
    conn.query_row(
        &format!("SELECT {LAB_ORDER_COLUMNS} FROM dental_lab_orders WHERE id = ?1"),
        params![order_id],
        lab_order_from_row,
    )
    .optional()?
    .ok_or(DentalError::NotFound)
}

pub fn create_lab_order(conn: &Connection, input: &NewLabOrder) -> Result<LabOrder, DentalError> {
    if input.work_type.trim().is_empty() {
        return Err(DentalError::Invalid("la orden necesita el tipo de trabajo".into()));
    }
    if input.lab_name.trim().is_empty() {
        return Err(DentalError::Invalid("la orden necesita el laboratorio destino".into()));
    }
    if input.cost_cents < 0 {
        return Err(DentalError::Invalid("el costo no puede ser negativo".into()));
    }
    let patient_exists: bool = conn
        .query_row(
            "SELECT 1 FROM patients WHERE id = ?1",
            params![input.patient_id],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);
    if !patient_exists {
        return Err(DentalError::Invalid("paciente no encontrado".into()));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = now();
    let tooth = input.tooth_id.trim();
    conn.execute(
        "INSERT INTO dental_lab_orders
            (id, patient_id, encounter_id, tooth_id, work_type, lab_name, status,
             promised_at, cost_cents, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'PENDING', ?7, ?8, ?9, ?10, ?10)",
        params![
            id,
            input.patient_id,
            input.encounter_id,
            if tooth.is_empty() { "GENERAL" } else { tooth },
            input.work_type.trim(),
            input.lab_name.trim(),
            input.promised_at,
            input.cost_cents,
            input.notes,
            timestamp
        ],
    )?;
    audit(conn, &id, "lab_order_created", Some(input.lab_name.trim()))?;
    read_lab_order(conn, &id)
}

pub fn set_lab_order_status(
    conn: &Connection,
    order_id: &str,
    status: &str,
) -> Result<LabOrder, DentalError> {
    let status = status.trim().to_uppercase();
    if !LAB_ORDER_STATUSES.contains(&status.as_str()) {
        return Err(DentalError::Invalid("estado de orden invalido".into()));
    }
    let order = read_lab_order(conn, order_id)?;
    let allowed = matches!(
        (order.status.as_str(), status.as_str()),
        ("PENDING", "SENT")
            | ("SENT", "RECEIVED")
            | ("RECEIVED", "DELIVERED")
            | ("PENDING", "CANCELLED")
            | ("SENT", "CANCELLED")
            | ("RECEIVED", "CANCELLED")
    );
    if !allowed {
        return Err(DentalError::Invalid(format!(
            "una orden {} no puede pasar a {}",
            order.status, status
        )));
    }
    let timestamp = now();
    let stamp_column = match status.as_str() {
        "SENT" => Some("sent_at"),
        "RECEIVED" => Some("received_at"),
        "DELIVERED" => Some("delivered_at"),
        _ => None,
    };
    match stamp_column {
        Some(column) => conn.execute(
            &format!(
                "UPDATE dental_lab_orders SET status = ?1, {column} = ?2, updated_at = ?2
                 WHERE id = ?3"
            ),
            params![status, timestamp, order_id],
        )?,
        None => conn.execute(
            "UPDATE dental_lab_orders SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, timestamp, order_id],
        )?,
    };
    audit(conn, order_id, "lab_order_status", Some(&status))?;
    read_lab_order(conn, order_id)
}

pub fn list_patient_lab_orders(
    conn: &Connection,
    patient_id: &str,
) -> Result<Vec<LabOrder>, DentalError> {
    let mut statement = conn.prepare(&format!(
        "SELECT {LAB_ORDER_COLUMNS} FROM dental_lab_orders
         WHERE patient_id = ?1 ORDER BY created_at DESC, rowid DESC"
    ))?;
    let rows = statement
        .query_map(params![patient_id], lab_order_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Trabajos aun fuera del consultorio (por enviar o enviados), los mas
/// proximos a su fecha prometida primero. Vista global de recepcion.
pub fn list_pending_lab_orders(conn: &Connection) -> Result<Vec<PendingLabOrder>, DentalError> {
    let mut statement = conn.prepare(&format!(
        "SELECT {LAB_ORDER_COLUMNS}, (SELECT TRIM(first_name || ' ' || last_name)
                FROM patient_identities WHERE id = patient_id) AS patient_name
         FROM dental_lab_orders
         WHERE status IN ('PENDING', 'SENT')
         ORDER BY promised_at IS NULL, promised_at ASC, created_at ASC"
    ))?;
    let rows = statement
        .query_map([], |row| {
            Ok(PendingLabOrder {
                order: lab_order_from_row(row)?,
                patient_name: row.get(14)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;
    use crate::operations::{self, PaymentInput};

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-dental-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", uuid::Uuid::new_v4()));
        open_encrypted(&path, "frase-de-prueba-123").unwrap()
    }

    fn seed_patient(conn: &Connection, patient_id: &str) {
        conn.execute(
            "INSERT INTO patient_identities (id, first_name, last_name, created_at, updated_at)
             VALUES (?1, 'Hugo', 'Paz', '2026-01-01', '2026-01-01')",
            params![patient_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO patients (id, created_at, updated_at)
             VALUES (?1, '2026-01-01', '2026-01-01')",
            params![patient_id],
        )
        .unwrap();
    }

    fn sample_budget(patient_id: &str, label: &str, group: Option<&str>) -> NewBudget {
        NewBudget {
            patient_id: patient_id.into(),
            encounter_id: None,
            label: label.into(),
            notes: None,
            discount_cents: 0,
            alternative_group: group.map(String::from),
            items: vec![
                BudgetItemInput {
                    tooth_id: "16".into(),
                    procedure: "Resina oclusal".into(),
                    price_cents: 90_000,
                },
                BudgetItemInput {
                    tooth_id: "55".into(),
                    procedure: "Extraccion".into(),
                    price_cents: 60_000,
                },
            ],
        }
    }

    fn open_cash(conn: &Connection) {
        operations::open_cash_session(conn, 0).unwrap();
    }

    fn try_pay(
        conn: &Connection,
        budget_id: &str,
        patient_id: &str,
        amount: i64,
        kind: &str,
    ) -> Result<crate::operations::Payment, crate::operations::OperationsError> {
        operations::register_payment(
            conn,
            &PaymentInput {
                visit_id: None,
                appointment_id: None,
                patient_id: Some(patient_id.into()),
                amount_cents: amount,
                method: "CASH".into(),
                kind: kind.into(),
                concept: Some("Abono presupuesto dental".into()),
                budget_id: Some(budget_id.into()),
            },
        )
    }

    fn pay(conn: &Connection, budget_id: &str, patient_id: &str, amount: i64, kind: &str) {
        try_pay(conn, budget_id, patient_id, amount, kind).unwrap();
    }

    #[test]
    fn budget_requires_label_items_and_valid_prices() {
        let conn = test_conn("validate");
        seed_patient(&conn, "p1");
        let mut empty_label = sample_budget("p1", "  ", None);
        assert!(create_budget(&conn, &empty_label).is_err());
        empty_label.label = "Opcion resina".into();
        empty_label.items.clear();
        assert!(create_budget(&conn, &empty_label).is_err());

        let mut negative = sample_budget("p1", "Opcion resina", None);
        negative.items[0].price_cents = -1;
        assert!(create_budget(&conn, &negative).is_err());

        let mut discount = sample_budget("p1", "Opcion resina", None);
        discount.discount_cents = 200_000;
        assert!(create_budget(&conn, &discount).is_err());

        assert!(create_budget(&conn, &sample_budget("ghost", "Opcion", None)).is_err());
    }

    #[test]
    fn budget_totals_and_discount() {
        let conn = test_conn("totals");
        seed_patient(&conn, "p1");
        let mut input = sample_budget("p1", "Opcion resina", None);
        input.discount_cents = 10_000;
        let budget = create_budget(&conn, &input).unwrap();
        assert_eq!(budget.status, "PROPOSED");
        assert_eq!(budget.total_cents, 140_000);
        assert_eq!(budget.paid_cents, 0);
        assert_eq!(budget.balance_cents, 140_000);
        assert_eq!(budget.items.len(), 2);
    }

    #[test]
    fn accepting_one_alternative_rejects_the_other_proposals() {
        let conn = test_conn("alternatives");
        seed_patient(&conn, "p1");
        let a = create_budget(&conn, &sample_budget("p1", "Amalgama", Some("g1"))).unwrap();
        let b = create_budget(&conn, &sample_budget("p1", "Resina", Some("g1"))).unwrap();
        let c = create_budget(&conn, &sample_budget("p1", "Corona", Some("g1"))).unwrap();
        // Un rechazo manual previo se conserva.
        decide_budget(&conn, &c.id, "REJECTED").unwrap();

        let accepted = decide_budget(&conn, &b.id, "ACCEPTED").unwrap();
        assert_eq!(accepted.status, "ACCEPTED");
        assert_eq!(read_budget(&conn, &a.id).unwrap().status, "REJECTED");
        assert_eq!(read_budget(&conn, &c.id).unwrap().status, "REJECTED");

        // Un presupuesto decidido no puede volver a decidirse.
        assert!(decide_budget(&conn, &a.id, "ACCEPTED").is_err());
        // "PROPOSED" no es una decision.
        let d = create_budget(&conn, &sample_budget("p1", "Otra", None)).unwrap();
        assert!(decide_budget(&conn, &d.id, "PROPOSED").is_err());
    }

    #[test]
    fn item_progress_requires_accepted_budget() {
        let conn = test_conn("items");
        seed_patient(&conn, "p1");
        let budget = create_budget(&conn, &sample_budget("p1", "Resina", None)).unwrap();
        let item_id = budget.items[0].id.clone();
        assert!(set_item_status(&conn, &item_id, "IN_PROGRESS").is_err());

        decide_budget(&conn, &budget.id, "ACCEPTED").unwrap();
        let updated = set_item_status(&conn, &item_id, "COMPLETED").unwrap();
        assert_eq!(updated.items[0].status, "COMPLETED");
        assert!(updated.items[0].completed_at.is_some());

        // Regresar a planeado limpia la fecha.
        let reverted = set_item_status(&conn, &item_id, "PLANNED").unwrap();
        assert!(reverted.items[0].completed_at.is_none());
        assert!(set_item_status(&conn, &item_id, "INVALID").is_err());
        assert!(set_item_status(&conn, "ghost", "PLANNED").is_err());
    }

    #[test]
    fn payments_update_balance_and_respect_limits() {
        let conn = test_conn("payments");
        seed_patient(&conn, "p1");
        let budget = create_budget(&conn, &sample_budget("p1", "Resina", None)).unwrap();
        open_cash(&conn);

        // Nadie abona a un presupuesto propuesto.
        assert!(operations::register_payment(
            &conn,
            &PaymentInput {
                visit_id: None,
                appointment_id: None,
                patient_id: Some("p1".into()),
                amount_cents: 10_000,
                method: "CASH".into(),
                kind: "PAYMENT".into(),
                concept: None,
                budget_id: Some(budget.id.clone()),
            },
        )
        .is_err());

        decide_budget(&conn, &budget.id, "ACCEPTED").unwrap();
        pay(&conn, &budget.id, "p1", 50_000, "PAYMENT");
        pay(&conn, &budget.id, "p1", 25_000, "DEPOSIT");

        let after = read_budget(&conn, &budget.id).unwrap();
        assert_eq!(after.paid_cents, 75_000);
        assert_eq!(after.balance_cents, 75_000);

        // Aviso en captura: el abono que excede el saldo conocido se rechaza en
        // la puerta. No es garantia -- con dos cajones el excedente puede
        // colarse y terminar en saldo a favor (paso 27) -- pero el camino
        // normal si avisa, y ahora avisa desde la caja, sin leer lo clinico.
        assert!(try_pay(&conn, &budget.id, "p1", 80_000, "PAYMENT").is_err());
        // El reembolso no puede exceder lo abonado.
        assert!(try_pay(&conn, &budget.id, "p1", 80_000, "REFUND").is_err());
        pay(&conn, &budget.id, "p1", 25_000, "REFUND");

        let balance = patient_dental_balance(&conn, "p1").unwrap();
        assert_eq!(balance.accepted_budgets, 1);
        assert_eq!(balance.accepted_total_cents, 150_000);
        assert_eq!(balance.paid_cents, 50_000);
        assert_eq!(balance.balance_cents, 100_000);

        // Un presupuesto inexistente no recibe abonos.
        assert!(try_pay(&conn, "ghost", "p1", 1, "PAYMENT").is_err());
    }

    fn sample_lab_order(patient_id: &str) -> NewLabOrder {
        NewLabOrder {
            patient_id: patient_id.into(),
            encounter_id: None,
            tooth_id: "11".into(),
            work_type: "Corona de zirconia".into(),
            lab_name: "Lab ProDent".into(),
            promised_at: Some("2026-07-20".into()),
            cost_cents: 120_000,
            notes: None,
        }
    }

    #[test]
    fn lab_order_validates_input_and_starts_pending() {
        let conn = test_conn("lab-create");
        seed_patient(&conn, "p1");

        let mut no_work = sample_lab_order("p1");
        no_work.work_type = " ".into();
        assert!(create_lab_order(&conn, &no_work).is_err());

        let mut no_lab = sample_lab_order("p1");
        no_lab.lab_name = "".into();
        assert!(create_lab_order(&conn, &no_lab).is_err());

        let mut negative = sample_lab_order("p1");
        negative.cost_cents = -1;
        assert!(create_lab_order(&conn, &negative).is_err());

        assert!(create_lab_order(&conn, &sample_lab_order("ghost")).is_err());

        let mut blank_tooth = sample_lab_order("p1");
        blank_tooth.tooth_id = "  ".into();
        let order = create_lab_order(&conn, &blank_tooth).unwrap();
        assert_eq!(order.status, "PENDING");
        assert_eq!(order.tooth_id, "GENERAL");
        assert_eq!(order.sent_at, None);
    }

    #[test]
    fn lab_order_lifecycle_stamps_dates_and_blocks_bad_transitions() {
        let conn = test_conn("lab-flow");
        seed_patient(&conn, "p1");
        let order = create_lab_order(&conn, &sample_lab_order("p1")).unwrap();

        // No se puede recibir sin enviar ni entregar sin recibir.
        assert!(set_lab_order_status(&conn, &order.id, "RECEIVED").is_err());
        assert!(set_lab_order_status(&conn, &order.id, "DELIVERED").is_err());

        let sent = set_lab_order_status(&conn, &order.id, "SENT").unwrap();
        assert!(sent.sent_at.is_some());
        let received = set_lab_order_status(&conn, &order.id, "RECEIVED").unwrap();
        assert!(received.received_at.is_some());
        let delivered = set_lab_order_status(&conn, &order.id, "DELIVERED").unwrap();
        assert!(delivered.delivered_at.is_some());

        // Entregada es terminal (tampoco se cancela).
        assert!(set_lab_order_status(&conn, &order.id, "SENT").is_err());
        assert!(set_lab_order_status(&conn, &order.id, "CANCELLED").is_err());

        // Cancelar vale antes de entregar; cancelada es terminal.
        let other = create_lab_order(&conn, &sample_lab_order("p1")).unwrap();
        let cancelled = set_lab_order_status(&conn, &other.id, "CANCELLED").unwrap();
        assert_eq!(cancelled.status, "CANCELLED");
        assert!(set_lab_order_status(&conn, &other.id, "SENT").is_err());

        assert!(set_lab_order_status(&conn, "ghost", "SENT").is_err());
        assert!(set_lab_order_status(&conn, &order.id, "INVALID").is_err());
    }

    #[test]
    fn pending_lab_orders_lists_out_of_office_work_by_promised_date() {
        let conn = test_conn("lab-pending");
        seed_patient(&conn, "p1");

        let mut later = sample_lab_order("p1");
        later.promised_at = Some("2026-07-25".into());
        let later = create_lab_order(&conn, &later).unwrap();

        let mut sooner = sample_lab_order("p1");
        sooner.promised_at = Some("2026-07-12".into());
        let sooner = create_lab_order(&conn, &sooner).unwrap();
        set_lab_order_status(&conn, &sooner.id, "SENT").unwrap();

        let mut no_date = sample_lab_order("p1");
        no_date.promised_at = None;
        create_lab_order(&conn, &no_date).unwrap();

        // Recibida y entregada ya no son pendientes.
        let done = create_lab_order(&conn, &sample_lab_order("p1")).unwrap();
        set_lab_order_status(&conn, &done.id, "SENT").unwrap();
        set_lab_order_status(&conn, &done.id, "RECEIVED").unwrap();

        let pending = list_pending_lab_orders(&conn).unwrap();
        assert_eq!(pending.len(), 3);
        // Fecha prometida mas proxima primero; sin fecha al final.
        assert_eq!(pending[0].order.id, sooner.id);
        assert_eq!(pending[1].order.id, later.id);
        assert_eq!(pending[2].order.promised_at, None);
        assert_eq!(pending[0].patient_name, "Hugo Paz");

        assert_eq!(list_patient_lab_orders(&conn, "p1").unwrap().len(), 4);
        assert!(list_patient_lab_orders(&conn, "ghost").unwrap().is_empty());
    }

    #[test]
    fn specialty_history_returns_latest_note_version_per_encounter() {
        let conn = test_conn("history");
        seed_patient(&conn, "p1");
        conn.execute_batch(
            "INSERT INTO encounters (id, patient_id, status, opened_at, signed_at)
             VALUES ('e1', 'p1', 'SIGNED', '2026-06-01T10:00:00Z', '2026-06-01T11:00:00Z'),
                    ('e2', 'p1', 'OPEN', '2026-07-01T10:00:00Z', NULL);
             INSERT INTO note_versions (encounter_id, version, created_at, specialty_payload)
             VALUES ('e1', 1, '2026-06-01', '{\"plaque\":{\"16\":[\"M\",\"D\"]}}'),
                    ('e1', 2, '2026-06-01', '{\"plaque\":{\"16\":[\"M\"]}}'),
                    ('e2', 1, '2026-07-01', '{\"plaque\":{}}');",
        )
        .unwrap();

        let history = specialty_history(&conn, "p1").unwrap();
        assert_eq!(history.len(), 2);
        // Orden cronologico y ultima version por encuentro.
        assert_eq!(history[0].encounter_id, "e1");
        assert!(history[0].specialty_json.contains("[\"M\"]"));
        assert!(!history[0].specialty_json.contains("\"D\""));
        assert_eq!(history[0].status, "SIGNED");
        assert_eq!(history[1].encounter_id, "e2");
        assert_eq!(history[1].signed_at, None);

        // Paciente sin encuentros: lista vacia, no error.
        assert!(specialty_history(&conn, "ghost").unwrap().is_empty());
    }

    #[test]
    fn balance_only_counts_accepted_budgets() {
        let conn = test_conn("balance");
        seed_patient(&conn, "p1");
        let a = create_budget(&conn, &sample_budget("p1", "Aceptado", None)).unwrap();
        create_budget(&conn, &sample_budget("p1", "Propuesto", None)).unwrap();
        let rejected = create_budget(&conn, &sample_budget("p1", "Rechazado", None)).unwrap();
        decide_budget(&conn, &a.id, "ACCEPTED").unwrap();
        decide_budget(&conn, &rejected.id, "REJECTED").unwrap();

        let balance = patient_dental_balance(&conn, "p1").unwrap();
        assert_eq!(balance.accepted_budgets, 1);
        assert_eq!(balance.accepted_total_cents, 150_000);

        let budgets = list_patient_budgets(&conn, "p1").unwrap();
        assert_eq!(budgets.len(), 3);
    }
}
