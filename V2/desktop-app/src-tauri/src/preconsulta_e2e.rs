//! Punta a punta de la preconsulta configurable (paso 32) contra el portal
//! vivo: el codigo de la app (vincular, publicar, enlaces, `pull_inbox`,
//! bandeja, adjuntar y conciliar) y el formulario real del paciente en un
//! navegador, que sella en el celular para la llave del medico.
//!
//! Va en dos fases porque en medio una persona contesta los enlaces:
//!   1. `e2e_preconsulta_prepare` vincula un equipo nuevo, publica el
//!      cuestionario, crea el enlace general y uno personal, y deja las URL en
//!      `$MIDOC_E2E_DIR/urls.json`.
//!   2. Se contestan en el navegador: el general como paciente nuevo (con
//!      antecedentes) y el personal.
//!   3. `e2e_preconsulta_verify` sincroniza y revisa bandeja, adjuntado,
//!      conciliacion, adjuntado automatico y la purga en la nube.
//!
//! Necesita el portal en `MIDOC_E2E_SERVER` (por omision localhost:3000) y un
//! medico de prueba aprobado en `MIDOC_E2E_EMAIL`/`MIDOC_E2E_PASSWORD`.
//!   cargo test --lib preconsulta_e2e -- --ignored --nocapture --test-threads 1

use std::path::PathBuf;
use std::sync::Mutex;

use crate::clinical::{
    create_patient, get_encounter_detail, medical_history_source_hash, open_encounter_for_patient,
    save_patient_medical_history_version, NewPatientInput, SavePatientMedicalHistoryInput,
};
use crate::{crypto, db, preconsulta, preconsulta_inbox, sync, AppDb};

fn env(key: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| panic!("falta {key}"))
}

fn dir() -> PathBuf {
    PathBuf::from(env("MIDOC_E2E_DIR"))
}

fn open() -> rusqlite::Connection {
    db::open_encrypted(&dir().join("e2e.db"), "clave-de-prueba-e2e").unwrap()
}

fn credentials(conn: &rusqlite::Connection) -> (String, String) {
    (
        sync::get_state(conn, "server_url").unwrap().unwrap(),
        sync::get_state(conn, "device_token").unwrap().unwrap(),
    )
}

#[tokio::test]
#[ignore = "necesita el portal vivo y un medico de prueba"]
async fn e2e_preconsulta_prepare() {
    let server =
        std::env::var("MIDOC_E2E_SERVER").unwrap_or_else(|_| "http://localhost:3000".into());
    std::fs::create_dir_all(dir()).unwrap();
    let _ = std::fs::remove_file(dir().join("e2e.db"));
    let conn = open();

    let public_key = crypto::ensure_keypair(&conn).unwrap();
    let linked = sync::link_account(
        &server,
        &env("MIDOC_E2E_EMAIL"),
        &env("MIDOC_E2E_PASSWORD"),
        "PC prueba e2e",
        &public_key,
    )
    .await
    .unwrap();
    sync::set_state(&conn, "server_url", &server).unwrap();
    sync::set_state(&conn, "device_token", &linked.device_token).unwrap();

    // Parte 2 con una condicion: "¿Desde cuando?" solo si hay dolor.
    let definition = serde_json::json!({
        "schemaVersion": 1,
        "title": "Motivo de consulta",
        "questions": [
            { "id": "motivo", "label": "¿Qué te trae a consulta?", "type": "long_text", "required": true },
            { "id": "dolor", "label": "¿Tienes dolor?", "type": "yes_no", "required": true },
            { "id": "desde", "label": "¿Desde cuándo?", "type": "short_text", "required": false,
              "showWhen": { "questionId": "dolor", "equals": "si" } }
        ]
    });
    let (version, at) = preconsulta::publish(&server, &linked.device_token, &definition)
        .await
        .unwrap();
    preconsulta::record_published(&conn, &definition, version, &at).unwrap();
    let (general_url, _, created_at) = preconsulta::regenerate_link(&server, &linked.device_token)
        .await
        .unwrap();
    preconsulta::record_new_link(&conn, &general_url, &created_at).unwrap();

    // Paciente que ya existe en el expediente y recibe su enlace personal.
    let patient = create_patient(
        &conn,
        &NewPatientInput {
            first_name: "Mario".into(),
            last_name: "Ejemplo Ruiz".into(),
            phone: Some("6145550101".into()),
            email: None,
            birth_date: Some("1975-02-14".into()),
            sex: None,
        },
    )
    .unwrap();
    let reference = preconsulta_inbox::new_personal_ref();
    let (personal_url, expires_at) =
        preconsulta::create_personal_link(&server, &linked.device_token, &reference)
            .await
            .unwrap();
    preconsulta_inbox::record_personal_link(
        &conn,
        &reference,
        &patient.id,
        &personal_url,
        &expires_at,
    )
    .unwrap();

    let urls = serde_json::json!({
        "general": general_url,
        "personal": personal_url,
        "personalPatientId": patient.id
    });
    std::fs::write(dir().join("urls.json"), urls.to_string()).unwrap();
    println!("URLS {urls}");
}

#[tokio::test]
#[ignore = "necesita el portal vivo y las respuestas del navegador"]
async fn e2e_preconsulta_verify() {
    let urls: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(dir().join("urls.json")).unwrap()).unwrap();
    let personal_patient = urls["personalPatientId"].as_str().unwrap().to_string();

    let app = AppDb(Mutex::new(Some(open())));
    let (server, token, cursor) = {
        let guard = app.0.lock().unwrap();
        let conn = guard.as_ref().unwrap();
        let (server, token) = credentials(conn);
        (server, token, sync::get_cursor(conn).unwrap())
    };

    // 1) Sincronizar con el mismo codigo que el boton "Sincronizar".
    let applied = crate::pull_inbox(&app, &server, &token, cursor)
        .await
        .unwrap();
    println!("eventos aplicados: {applied}");
    assert!(applied >= 2, "se esperaban al menos dos preconsultas");

    {
        let mut guard = app.0.lock().unwrap();
        let conn = guard.as_mut().unwrap();

        // 2) Bandeja: solo la del enlace general; la personal ya es del paciente.
        let inbox = preconsulta_inbox::list(conn).unwrap();
        println!("bandeja: {:?}", inbox.items);
        let general = inbox
            .items
            .iter()
            .find(|item| item.last_name.contains("Prueba Nueva"))
            .expect("la preconsulta del enlace general debe estar en la bandeja");
        assert!(general.first_visit && general.is_new);
        let general_id = general.id.clone();
        let personal = preconsulta_inbox::personal_link(conn, &personal_patient)
            .unwrap()
            .unwrap();
        assert!(
            personal.answered_at.is_some() && !personal.attached,
            "{personal:?}"
        );

        // La definicion contestada llego con el sobre; las respuestas, legibles.
        let opened = preconsulta_inbox::open(conn, &general_id).unwrap();
        assert!(opened.questionnaire_json.is_some());
        let envelope: serde_json::Value = serde_json::from_str(&opened.envelope_json).unwrap();
        assert_eq!(envelope["linkKind"], "GENERAL");
        assert_eq!(envelope["answers"]["dolor"], "si");
        assert!(
            envelope["answers"]["desde"].is_string(),
            "la condicional contestada viaja"
        );
        assert!(
            envelope["medicalHistory"].is_object(),
            "primera vez: lleva antecedentes"
        );

        // 3) Paciente nuevo: el medico lo da de alta, abre consulta y adjunta.
        let newcomer = create_patient(
            conn,
            &NewPatientInput {
                first_name: general.first_name.clone(),
                last_name: general.last_name.clone(),
                phone: Some(general.phone.clone()),
                email: None,
                birth_date: Some(general.birth_date.clone()),
                sex: None,
            },
        )
        .unwrap();
        let today = chrono::Utc::now().date_naive();
        let encounter = open_encounter_for_patient(conn, &newcomer.id, today).unwrap();
        preconsulta_inbox::attach(conn, &general_id, &encounter.id).unwrap();
        let detail = get_encounter_detail(conn, &encounter.id).unwrap();
        assert_eq!(detail.attached_preconsulta.as_ref().unwrap().id, general_id);
        let history = detail
            .medical_history
            .clone()
            .expect("parte 1 para conciliar");
        assert_eq!(
            detail.medical_history_source.as_deref(),
            Some(format!("preconsulta:{general_id}").as_str())
        );

        // 4) Conciliacion: los antecedentes pasan a ser la version 1 del expediente.
        let saved = save_patient_medical_history_version(
            conn,
            &newcomer.id,
            &SavePatientMedicalHistoryInput {
                payload_json: history.clone(),
                source: "PATIENT_INITIAL".into(),
                encounter_id: Some(encounter.id.clone()),
                source_appointment_id: detail.medical_history_source.clone(),
                reconciled_source_hash: Some(medical_history_source_hash(&history)),
                ai_run_id: None,
            },
        )
        .unwrap();
        assert_eq!(saved.version, 1);

        // 5) Enlace personal: se adjunta solo a la siguiente consulta del paciente.
        let visit = open_encounter_for_patient(conn, &personal_patient, today).unwrap();
        assert!(preconsulta_inbox::attach_pending_personal(conn, &visit.id).unwrap());
        let visit_detail = get_encounter_detail(conn, &visit.id).unwrap();
        let attached: serde_json::Value = serde_json::from_str(
            &visit_detail
                .attached_preconsulta
                .as_ref()
                .unwrap()
                .envelope_json,
        )
        .unwrap();
        assert_eq!(attached["linkKind"], "PERSONAL");
        assert_eq!(attached["firstVisit"], false);
        assert!(
            preconsulta_inbox::personal_link(conn, &personal_patient)
                .unwrap()
                .unwrap()
                .attached
        );
    }

    // 6) La nube ya no tiene los sobres: re-pedirlos responde 410.
    let submission_ids: Vec<String> = {
        let guard = app.0.lock().unwrap();
        let conn = guard.as_ref().unwrap();
        let mut statement = conn.prepare("SELECT id FROM preconsulta_inbox").unwrap();
        let ids = statement
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<String>, _>>()
            .unwrap();
        ids
    };
    for id in &submission_ids {
        let error = sync::fetch_preconsulta(&server, &token, id)
            .await
            .unwrap_err();
        println!("re-descarga de {id}: {error}");
        assert!(error.to_string().contains("ya entregada"), "{error}");
    }
}
