//! End-to-end de la consulta clinica local-first (paso 9). Cruza `sync` y
//! `clinical`: una cita y su preconsulta llegan por sincronizacion (como las
//! entrega el portal), el medico abre el encuentro desde la cita, documenta
//! antecedentes y nota SOAP, receta, firma y verifica integridad — todo en la
//! base cifrada, sin tocar la red. Es el unico test que valida el puente
//! sync -> expediente que los tests unitarios de cada modulo no cubren.

use crate::clinical::{
    get_encounter_detail, open_encounter_for_appointment, save_note, save_prescription,
    sign_encounter, update_patient_background, verify_signature, ClinicalError, NoteContent,
    PatientBackgroundInput,
};
use crate::db::open_encrypted;
use crate::sync::{apply_batch, InboxEvent};
use rusqlite::{params, Connection};

fn test_conn(name: &str) -> Connection {
    let dir = std::env::temp_dir().join("midoc-consultation-e2e");
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(format!("{name}-{}.db", std::process::id()));
    let _ = std::fs::remove_file(&path);
    open_encrypted(&path, "clave-de-prueba").unwrap()
}

/// Eventos del buzon tal como los entrega el inbox del portal: reserva,
/// confirmacion y preconsulta de una misma cita.
fn synced_appointment(appointment_id: &str, patient_id: &str) -> Vec<InboxEvent> {
    vec![
        InboxEvent {
            seq: 1,
            event_type: "APPOINTMENT_BOOKED".into(),
            payload: Some(serde_json::json!({
                "appointmentId": appointment_id,
                "status": "PENDING",
                "scheduledStart": "2026-06-22T15:00:00.000Z",
                "scheduledEnd": "2026-06-22T15:30:00.000Z",
                "serviceName": "Consulta general",
                "reason": "Dolor lumbar",
                "patient": {
                    "id": patient_id,
                    "firstName": "Hugo",
                    "lastName": "Paz",
                    "phone": "6140001111",
                    "email": null
                }
            })),
        },
        InboxEvent {
            seq: 2,
            event_type: "APPOINTMENT_CONFIRMED".into(),
            payload: Some(serde_json::json!({
                "appointmentId": appointment_id,
                "status": "CONFIRMED"
            })),
        },
        InboxEvent {
            seq: 3,
            event_type: "PRECHECKIN_SUBMITTED".into(),
            payload: Some(serde_json::json!({
                "appointmentId": appointment_id,
                "responses": { "motivo": "Dolor lumbar de 2 semanas" }
            })),
        },
    ]
}

#[test]
fn synced_appointment_drives_a_full_signed_consultation() {
    let mut conn = test_conn("full");

    // 1. La cita + preconsulta llegan por sincronizacion.
    apply_batch(&mut conn, &synced_appointment("appt-e2e", "pat-e2e")).unwrap();

    // 2. El medico abre el encuentro desde la cita sincronizada. El contexto
    //    del paciente y la preconsulta viajaron por sync.
    let encounter = open_encounter_for_appointment(&conn, "appt-e2e").unwrap();
    assert_eq!(encounter.status, "OPEN");

    let detail = get_encounter_detail(&conn, &encounter.id).unwrap();
    assert_eq!(detail.patient.first_name, "Hugo");
    assert_eq!(detail.appointment_reason.as_deref(), Some("Dolor lumbar"));
    assert_eq!(detail.appointment_start.as_deref(), Some("2026-06-22T15:00:00.000Z"));
    let medical_history = detail
        .medical_history
        .expect("el cuestionario del paciente debe estar disponible");
    assert!(medical_history.contains("Dolor lumbar de 2 semanas"));

    // 3. Antecedentes + nota SOAP con plantilla de medicina general + receta.
    update_patient_background(
        &conn,
        "pat-e2e",
        &PatientBackgroundInput {
            allergies: Some("Ninguna".into()),
            medical_background: Some("Sin antecedentes relevantes".into()),
            family_background: None,
            birth_date: Some("1990-01-01".into()),
        },
    )
    .unwrap();

    save_note(
        &conn,
        &encounter.id,
        &NoteContent {
            subjective: "Dolor lumbar mecanico".into(),
            objective: "Sin signos de alarma".into(),
            assessment: "Lumbalgia mecanica".into(),
            plan: "AINEs y ejercicio".into(),
            diagnosis: "Lumbalgia".into(),
            instructions: "Calor local".into(),
            specialty: serde_json::json!({
                "riskFactors": "Sedentarismo",
                "preventivePlan": "Actividad fisica 150 min/sem"
            }),
        },
    )
    .unwrap();
    save_prescription(&conn, &encounter.id, "Naproxeno 250mg c/12h x5d").unwrap();

    // 4. Firma y verificacion de integridad.
    let signed = sign_encounter(&conn, &encounter.id).unwrap();
    assert_eq!(signed.status, "SIGNED");
    assert!(signed.signed_hash.is_some());
    assert!(verify_signature(&conn, &encounter.id).unwrap());

    // 5. El detalle final refleja antecedentes, nota firmada y receta.
    let final_detail = get_encounter_detail(&conn, &encounter.id).unwrap();
    assert_eq!(final_detail.patient.allergies.as_deref(), Some("Ninguna"));
    assert_eq!(final_detail.encounter.status, "SIGNED");
    let note = final_detail.note.expect("debe haber nota firmada");
    assert_eq!(note.content.diagnosis, "Lumbalgia");
    assert_eq!(note.content.specialty["riskFactors"], "Sedentarismo");
    assert_eq!(
        final_detail.prescription.as_deref(),
        Some("Naproxeno 250mg c/12h x5d")
    );

    // Tras la firma el encuentro queda congelado.
    assert!(matches!(
        save_note(&conn, &encounter.id, &NoteContent::default()),
        Err(ClinicalError::AlreadySigned)
    ));
}

#[test]
fn rescheduled_synced_appointment_opens_with_the_updated_slot() {
    let mut conn = test_conn("reschedule");

    apply_batch(&mut conn, &synced_appointment("appt-rs", "pat-rs")).unwrap();

    // La cita se reagenda en el portal y el evento llega por sync.
    apply_batch(
        &mut conn,
        &[InboxEvent {
            seq: 4,
            event_type: "APPOINTMENT_RESCHEDULED".into(),
            payload: Some(serde_json::json!({
                "appointmentId": "appt-rs",
                "status": "PENDING",
                "scheduledStart": "2026-06-29T16:00:00.000Z",
                "scheduledEnd": "2026-06-29T16:30:00.000Z"
            })),
        }],
    )
    .unwrap();

    let encounter = open_encounter_for_appointment(&conn, "appt-rs").unwrap();
    let detail = get_encounter_detail(&conn, &encounter.id).unwrap();
    assert_eq!(
        detail.appointment_start.as_deref(),
        Some("2026-06-29T16:00:00.000Z")
    );

    // El encuentro abierto sigue siendo atendible tras el reagendado.
    save_note(
        &conn,
        &encounter.id,
        &NoteContent {
            diagnosis: "Control".into(),
            ..Default::default()
        },
    )
    .unwrap();
    sign_encounter(&conn, &encounter.id).unwrap();
    assert!(verify_signature(&conn, &encounter.id).unwrap());

    // La cita reagendada conserva su nuevo horario en la base local.
    let stored_start: String = conn
        .query_row(
            "SELECT scheduled_start FROM appointments WHERE id = 'appt-rs'",
            params![],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(stored_start, "2026-06-29T16:00:00.000Z");
}
