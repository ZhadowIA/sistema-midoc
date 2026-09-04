//! Compuerta central de comandos (paso 27, rebanada 2, plan 14 §Fase 1.13).
//!
//! Cada comando Tauri declara aqui que **capacidad** exige. La decision se
//! toma en un solo lugar —el manejador de invocaciones de `lib.rs`— antes de
//! que el comando toque la base, y **niega por defecto**: un comando que no
//! aparece en la tabla no se ejecuta para nadie, y un rol que no tiene la
//! capacidad recibe un rechazo sin haber corrido una sola consulta.
//!
//! Lo que la tabla NO puede expresar (porque depende de los argumentos) vive
//! dentro del comando y se documenta en `ARGUMENT_CHECKS`: hoy, el reembolso
//! directo via `register_payment`.
//!
//! La prueba `every_registered_command_has_a_policy` lee `lib.rs` y falla si
//! alguien registra un comando sin clasificarlo: asi la compuerta no se puede
//! olvidar al crecer la app.

use crate::keyring::{ROLE_DOCTOR, ROLE_RECEPCION};

/// Que hace falta para invocar un comando.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Capability {
    /// No toca la base ni la sesion: perfiles, desbloqueo, pesos de modelos.
    Public,
    /// Recepcion y caja: identidad de contacto, visitas, recursos, cobros,
    /// agenda y sincronizacion de la agenda. La recepcionista lo tiene.
    Operations,
    /// Expediente, notas, IA clinica, medicamentos, ARCO. Solo el medico.
    Clinical,
    /// Gobierno de la base y del vinculo con el portal: accesos, ajustes del
    /// consultorio, vincular/desvincular. Solo el medico.
    Admin,
}

/// Tabla exhaustiva: cada comando registrado en `tauri::generate_handler!`
/// aparece exactamente una vez. Ordenada como el registro para que la
/// revision sea lado a lado.
pub const POLICY: &[(&str, Capability)] = &[
    // Perfiles y sesion
    ("list_doctor_profiles", Capability::Public),
    ("create_doctor_profile", Capability::Public),
    ("unlock_database", Capability::Public),
    ("lock_database", Capability::Public),
    ("list_access", Capability::Admin),
    ("grant_access", Capability::Admin),
    ("revoke_access", Capability::Admin),
    // Sincronizacion. Recepcion sincroniza la agenda; vincular es del medico.
    ("sync_status", Capability::Operations),
    ("link_account", Capability::Admin),
    ("unlink_device", Capability::Admin),
    ("sync_now", Capability::Operations),
    ("sync_pending", Capability::Operations),
    ("publish_authorized_summary", Capability::Clinical),
    // Agenda y atencion
    ("list_appointments", Capability::Operations),
    ("open_encounter", Capability::Clinical),
    ("attend_appointment", Capability::Clinical),
    ("resolve_appointment_patient", Capability::Clinical),
    ("get_encounter", Capability::Clinical),
    ("list_patients", Capability::Clinical),
    ("get_patient_profile", Capability::Clinical),
    ("find_patient_matches", Capability::Clinical),
    ("create_patient", Capability::Clinical),
    ("open_patient_encounter", Capability::Clinical),
    ("list_timeline_events", Capability::Clinical),
    ("add_timeline_event", Capability::Clinical),
    ("update_timeline_event", Capability::Clinical),
    ("delete_timeline_event", Capability::Clinical),
    ("save_note", Capability::Clinical),
    ("save_prescription", Capability::Clinical),
    ("update_patient_background", Capability::Clinical),
    ("get_patient_medical_history", Capability::Clinical),
    ("save_patient_medical_history", Capability::Clinical),
    ("sign_encounter", Capability::Clinical),
    ("verify_signature", Capability::Clinical),
    // Operacion presencial (paso 10) y caja
    ("list_resources", Capability::Operations),
    ("create_resource", Capability::Operations),
    ("set_resource_active", Capability::Operations),
    ("list_active_visits", Capability::Operations),
    ("check_in_appointment", Capability::Operations),
    ("register_walk_in", Capability::Operations),
    ("set_visit_state", Capability::Operations),
    ("assign_resource", Capability::Operations),
    // La recepcionista marca la llegada; abrir el expediente es del medico
    // (plan 14 §Fase 1.13).
    ("start_visit_encounter", Capability::Clinical),
    ("get_open_cash_session", Capability::Operations),
    ("open_cash_session", Capability::Operations),
    ("close_cash_session", Capability::Operations),
    ("cash_summary", Capability::Operations),
    // Ver `ARGUMENT_CHECKS`: REFUND directo es solo del medico.
    ("register_payment", Capability::Operations),
    ("patient_credit", Capability::Operations),
    ("apply_patient_credit", Capability::Operations),
    ("build_receipt", Capability::Operations),
    ("get_clinic_settings", Capability::Operations),
    ("save_clinic_settings", Capability::Admin),
    ("request_refund", Capability::Operations),
    ("decide_refund_request", Capability::Clinical),
    ("emit_authorized_refund", Capability::Operations),
    ("list_pending_refund_requests", Capability::Operations),
    ("list_session_payments", Capability::Operations),
    // Odontologia (paso 26). Los presupuestos son expediente; las ordenes de
    // laboratorio pendientes las recibe recepcion (v29 las saco del expediente).
    ("dental_create_budget", Capability::Clinical),
    ("dental_decide_budget", Capability::Clinical),
    ("dental_set_item_status", Capability::Clinical),
    ("dental_list_budgets", Capability::Clinical),
    ("dental_patient_balance", Capability::Clinical),
    ("dental_specialty_history", Capability::Clinical),
    ("dental_create_lab_order", Capability::Clinical),
    ("dental_set_lab_order_status", Capability::Operations),
    ("dental_list_lab_orders", Capability::Clinical),
    ("dental_pending_lab_orders", Capability::Operations),
    // IA gobernada (paso 11) y transcripcion (pasos 15, 21, 22, 23)
    ("ai_consent_status", Capability::Clinical),
    ("ai_grant_consent", Capability::Clinical),
    ("ai_revoke_consent", Capability::Clinical),
    ("ai_voice_consent_status", Capability::Clinical),
    ("ai_grant_voice_consent", Capability::Clinical),
    ("ai_revoke_voice_consent", Capability::Clinical),
    ("ai_scribe_consent_status", Capability::Clinical),
    ("ai_grant_scribe_consent", Capability::Clinical),
    ("ai_revoke_scribe_consent", Capability::Clinical),
    ("ai_assist_soap", Capability::Clinical),
    ("ai_assist_text", Capability::Clinical),
    ("ai_transcribe_audio", Capability::Clinical),
    ("ai_save_reviewed_transcription", Capability::Clinical),
    ("ai_latest_reviewed_transcription", Capability::Clinical),
    ("ai_discard_reviewed_transcription", Capability::Clinical),
    ("ai_diarize_consultation", Capability::Clinical),
    ("ai_structure_consultation", Capability::Clinical),
    ("ai_generate_clinical_aid", Capability::Clinical),
    ("ai_list_text_models", Capability::Clinical),
    ("list_consultation_templates", Capability::Clinical),
    ("save_consultation_template", Capability::Clinical),
    ("delete_consultation_template", Capability::Clinical),
    ("ai_review_run", Capability::Clinical),
    ("ai_list_runs", Capability::Clinical),
    ("ai_usage_summary", Capability::Clinical),
    ("ai_set_budget", Capability::Admin),
    ("ai_run_benchmark", Capability::Clinical),
    ("ai_list_benchmarks", Capability::Clinical),
    // Pesos de modelos: REFERENCIA publica en disco, sin sesion.
    ("transcription_recommendation", Capability::Public),
    ("transcription_model_status", Capability::Public),
    ("download_transcription_model", Capability::Public),
    ("diarization_model_status", Capability::Public),
    ("download_diarization_model", Capability::Public),
    // Medicamentos (pasos 14 y 25): se consultan desde la receta.
    ("check_medication_safety", Capability::Clinical),
    ("medication_reference_status", Capability::Clinical),
    ("import_medication_reference", Capability::Admin),
    ("update_medication_reference", Capability::Admin),
    ("update_medication_reference_from_midoc", Capability::Admin),
    ("extract_prescription_medications", Capability::Clinical),
    // ARCO (paso 12): derechos sobre el expediente.
    ("arco_list_requests", Capability::Clinical),
    ("arco_record_request", Capability::Clinical),
    ("arco_mark_fulfilled", Capability::Clinical),
    ("arco_export_patient_data", Capability::Clinical),
    ("arco_fulfill_cancellation", Capability::Clinical),
];

/// Comandos cuya decision depende de los argumentos ademas del rol. La tabla
/// los deja pasar y el comando remata la comprobacion con `deny_refund_for`.
pub const ARGUMENT_CHECKS: &[(&str, &str)] = &[(
    "register_payment",
    "sin permiso: un reembolso directo requiere al medico; pide su autorizacion desde Recepcion (solicitar reembolso)",
)];

pub fn capability_of(command: &str) -> Option<Capability> {
    POLICY
        .iter()
        .find(|(name, _)| *name == command)
        .map(|(_, capability)| *capability)
}

fn role_has(role: &str, capability: Capability) -> bool {
    match capability {
        Capability::Public => true,
        Capability::Operations => role == ROLE_DOCTOR || role == ROLE_RECEPCION,
        Capability::Clinical | Capability::Admin => role == ROLE_DOCTOR,
    }
}

/// Decide si `command` puede ejecutarse para quien tiene la sesion abierta
/// (`role`), o sin sesion (`None`). `Err` lleva el mensaje que ve la UI.
pub fn decide(role: Option<&str>, command: &str) -> Result<(), String> {
    let capability = capability_of(command)
        .ok_or_else(|| format!("comando sin politica de acceso: {command}"))?;

    if capability == Capability::Public {
        return Ok(());
    }

    let role = role.ok_or("la base esta bloqueada")?;
    if role_has(role, capability) {
        Ok(())
    } else {
        Err(format!(
            "sin permiso: {} requiere el rol del medico",
            describe(command)
        ))
    }
}

/// Comprobacion dependiente de argumentos de `register_payment`: sacar dinero
/// sin autorizacion es del medico (plan 14 §4.2).
pub fn deny_refund_for(role: &str, payment_kind: &str) -> Result<(), String> {
    if role != ROLE_DOCTOR && payment_kind.trim().eq_ignore_ascii_case("REFUND") {
        let (_, reason) = ARGUMENT_CHECKS[0];
        return Err(reason.into());
    }
    Ok(())
}

fn describe(command: &str) -> String {
    command.replace('_', " ")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Nombres registrados en `tauri::generate_handler![...]` de lib.rs, leidos
    /// del codigo fuente: la lista real, no una copia.
    fn registered_commands() -> Vec<String> {
        let source = include_str!("lib.rs");
        let start = source
            .find("tauri::generate_handler![")
            .expect("lib.rs registra comandos con generate_handler!");
        let body = &source[start + "tauri::generate_handler![".len()..];
        let end = body.find(']').expect("generate_handler! cierra");
        body[..end]
            .split(',')
            .map(|name| name.trim().to_string())
            .filter(|name| !name.is_empty())
            .collect()
    }

    #[test]
    fn every_registered_command_has_a_policy() {
        let registered = registered_commands();
        assert!(registered.len() >= 100, "se esperaban los ~112 comandos");

        let missing: Vec<_> = registered
            .iter()
            .filter(|name| capability_of(name).is_none())
            .collect();
        assert!(
            missing.is_empty(),
            "comandos registrados sin politica (niegan por defecto): {missing:?}"
        );

        let stale: Vec<_> = POLICY
            .iter()
            .map(|(name, _)| *name)
            .filter(|name| !registered.iter().any(|r| r == name))
            .collect();
        assert!(stale.is_empty(), "politica para comandos que ya no existen: {stale:?}");

        let mut names: Vec<_> = POLICY.iter().map(|(name, _)| *name).collect();
        let total = names.len();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), total, "un comando aparece dos veces en POLICY");
    }

    #[test]
    fn unknown_commands_are_denied_for_everyone() {
        assert!(decide(Some(ROLE_DOCTOR), "drop_everything").is_err());
        assert!(decide(None, "drop_everything").is_err());
    }

    #[test]
    fn public_commands_run_without_a_session() {
        assert!(decide(None, "unlock_database").is_ok());
        assert!(decide(None, "list_doctor_profiles").is_ok());
        assert!(decide(None, "transcription_model_status").is_ok());
    }

    #[test]
    fn locked_database_denies_everything_that_needs_a_session() {
        for (name, capability) in POLICY {
            if *capability != Capability::Public {
                assert!(decide(None, name).is_err(), "{name} corrio sin sesion");
            }
        }
    }

    /// **Prueba de frontera de comandos.** Recepcion recorre la tabla entera:
    /// todo lo CLINICO y ADMIN se le niega, todo lo OPERATIVO se le permite.
    #[test]
    fn reception_is_denied_every_clinical_and_admin_command() {
        let mut denied = 0;
        let mut allowed = 0;
        for (name, capability) in POLICY {
            let decision = decide(Some(ROLE_RECEPCION), name);
            match capability {
                Capability::Clinical | Capability::Admin => {
                    assert!(decision.is_err(), "RECEPCION pudo invocar {name}");
                    denied += 1;
                }
                Capability::Operations | Capability::Public => {
                    assert!(decision.is_ok(), "RECEPCION no pudo invocar {name}");
                    allowed += 1;
                }
            }
        }
        assert!(denied > allowed, "la superficie clinica debe ser la mayor");
    }

    /// Los comandos que la pantalla de Recepcion usa hoy siguen disponibles;
    /// los que abren expediente, no.
    #[test]
    fn reception_screen_commands_are_allowed_but_opening_the_record_is_not() {
        for name in [
            "list_appointments",
            "get_open_cash_session",
            "cash_summary",
            "list_session_payments",
            "dental_pending_lab_orders",
            "list_resources",
            "list_active_visits",
            "register_walk_in",
            "check_in_appointment",
            "register_payment",
            "build_receipt",
            "emit_authorized_refund",
            "sync_now",
        ] {
            assert!(decide(Some(ROLE_RECEPCION), name).is_ok(), "{name}");
        }
        for name in ["start_visit_encounter", "get_encounter", "list_patients", "grant_access"] {
            assert!(decide(Some(ROLE_RECEPCION), name).is_err(), "{name}");
        }
    }

    #[test]
    fn doctor_runs_everything() {
        for (name, _) in POLICY {
            assert!(decide(Some(ROLE_DOCTOR), name).is_ok(), "{name}");
        }
    }

    /// Prueba de inversion: si alguien mueve un comando clinico a Operations,
    /// la frontera lo nombra.
    #[test]
    fn moving_a_clinical_command_to_operations_would_be_caught() {
        let leaked = POLICY
            .iter()
            .filter(|(_, capability)| *capability == Capability::Operations)
            .map(|(name, _)| *name)
            .filter(|name| {
                name.starts_with("save_")
                    || name.starts_with("get_encounter")
                    || name.starts_with("list_patients")
                    || name.starts_with("ai_")
                    || name.starts_with("arco_")
            })
            .collect::<Vec<_>>();
        assert!(leaked.is_empty(), "comandos clinicos en Operations: {leaked:?}");
    }

    #[test]
    fn refund_by_argument_is_doctor_only() {
        assert!(deny_refund_for(ROLE_RECEPCION, "REFUND").is_err());
        assert!(deny_refund_for(ROLE_RECEPCION, "refund").is_err());
        assert!(deny_refund_for(ROLE_RECEPCION, "PAYMENT").is_ok());
        assert!(deny_refund_for(ROLE_DOCTOR, "REFUND").is_ok());
        assert_eq!(ARGUMENT_CHECKS[0].0, "register_payment");
    }
}
