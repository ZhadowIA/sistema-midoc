import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { mockCall, mockOptions } from "./ipcMock.ts";
import { IPC_RESPONSE_SCHEMAS, IpcContractError, parseIpcResponse } from "./ipcSchemas.ts";

mockOptions.latencyMs = 0;

/** Comandos de `tauri::generate_handler!`, leidos del codigo como hace Tauri. */
function registeredCommands(): string[] {
  const lib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  const handler = /generate_handler!\[([\s\S]*?)\]/.exec(lib);
  assert.ok(handler, "no se encontro generate_handler! en lib.rs");
  return handler[1]
    .split(",")
    .map((entry) => entry.trim().split("::").pop() ?? "")
    .filter(Boolean);
}

test("cada comando registrado en lib.rs tiene contrato, y no sobra ninguno", () => {
  const registered = registeredCommands().sort();
  const declared = Object.keys(IPC_RESPONSE_SCHEMAS).sort();
  assert.deepEqual(
    registered.filter((command) => !declared.includes(command)),
    [],
    "comandos sin contrato en ipcSchemas.ts"
  );
  assert.deepEqual(
    declared.filter((command) => !registered.includes(command)),
    [],
    "contratos de comandos que ya no existen"
  );
});

test("una respuesta fuera de contrato falla nombrando el campo, sin el valor", () => {
  const secreto = "Dolor toracico opresivo irradiado";
  assert.throws(
    () => parseIpcResponse("list_patients", [{ id: "p1", first_name: secreto }]),
    (error: unknown) => {
      assert.ok(error instanceof IpcContractError);
      assert.match(error.message, /"list_patients"/);
      assert.match(error.message, /0\.last_name: falta/);
      assert.doesNotMatch(error.message, /Dolor toracico/);
      return true;
    }
  );
  assert.throws(
    () => parseIpcResponse("verify_signature", secreto),
    (error: unknown) => error instanceof IpcContractError && !error.message.includes(secreto)
  );
});

test("un comando sin contrato no pasa", () => {
  assert.throws(() => parseIpcResponse("comando_inventado", {}), IpcContractError);
});

test("las claves que el contrato no declara se conservan", () => {
  const parsed = parseIpcResponse<{ extra?: string }>("sync_pending", {
    pending_download: false,
    pending_upload: true,
    extra: "se queda"
  });
  assert.equal(parsed.extra, "se queda");
});

/**
 * El mock de navegador responde con la misma forma que Rust: un recorrido que
 * toca cada comando que el mock implementa, validando cada respuesta. Si el
 * mock se aleja del backend, la interfaz en `vite dev` fallaria igual que aqui.
 */
test("el mock de navegador cumple los contratos", async () => {
  const validated = new Set<string>();
  const run = async <T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> => {
    const raw = await mockCall<unknown>(command, args);
    const parsed = parseIpcResponse<T>(command, raw);
    validated.add(command);
    return parsed;
  };

  // Perfiles, cuenta y sincronizacion.
  await run("list_doctor_profiles");
  const profile = await run<{ id: string }>("create_doctor_profile", { displayName: "Dra. Contrato" });
  await run("unlock_database", { profileId: profile.id, passphrase: "frase-de-prueba-larga" });
  await run("sync_status");
  await run("link_account", { serverUrl: "http://localhost:3000", email: "a@b.mx", password: "x" });
  await run("sync_now");
  await run("list_appointments");
  const prescriberView = await run<{ prescriber: { updatedAt: string } }>("get_prescriber");
  await run("save_prescriber", {
    input: {
      professionalName: "Dra. Contrato",
      licenseNumber: "1234567",
      degreeInstitution: null,
      specialtyTitle: null,
      specialtyLicenseNumber: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      expectedUpdatedAt: prescriberView.prescriber.updatedAt
    }
  });

  // Expediente.
  await run("list_patients");
  await run("list_open_encounters");
  await run("get_capabilities");
  const definition = { schemaVersion: 1, questions: [{ id: "motivo", label: "Motivo", type: "long_text", required: true }] };
  await run("preconsulta_state");
  await run("preconsulta_save_draft", { definition });
  await run("preconsulta_publish", { definition });
  await run("preconsulta_regenerate_link");
  await run("preconsulta_set_link_status", { status: "PAUSED" });
  await run("search_ingredients", { query: "para" });
  const brand = await run("save_local_brand", { display: "Fictimed", ingredientIds: ["paracetamol"] });
  await run("list_local_brands");
  await run("detect_unknown_medications", { prescription: "Fictimed 500 mg\nProbadol 10 mg" });
  await run("analyze_prescription", { prescription: "Paracetamol 500 mg tabletas\nFictimed 500 mg" });
  await run("delete_local_brand", { id: (brand as { id: string }).id });
  await run("check_contraindications", { encounterId: "enc-1", prescription: "Ibuprofeno 400 mg" });
  await run("pending_severe_alerts", { encounterId: "enc-1" });
  await run("acknowledge_severe_alerts", { encounterId: "enc-1", fingerprint: "mock" });
  await run("get_inactivity_lock_minutes");
  await run("set_inactivity_lock_minutes", { minutes: 15 });
  await run("find_patient_matches", { firstName: "Hugo", lastName: "Paz Olivares" });
  const patient = await run<{ id: string }>("create_patient", {
    patient: { first_name: "Ana", last_name: "Contrato", phone: null, email: null, birth_date: "2015-04-01", sex: "F" }
  });
  await run("get_patient_profile", { patientId: patient.id });
  const encounter = await run<{ id: string }>("open_patient_encounter", { patientId: patient.id });
  await run("open_encounter", { appointmentId: "appt-1" });
  await run("attend_appointment", { appointmentId: "appt-1", linkPatientId: "pat-1" });
  await run("resolve_appointment_patient", { appointmentId: "appt-1" });
  const encounterId = encounter.id;
  await run("get_encounter", { encounterId });
  // Bandeja de la preconsulta (paso 32): ver, adjuntar, descartar y plazo.
  const inbox = await run<{ items: { id: string }[] }>("preconsulta_inbox");
  await run("preconsulta_inbox_open", { id: inbox.items[0]!.id });
  await run("preconsulta_inbox_attach", { id: inbox.items[0]!.id, encounterId });
  await run("get_encounter", { encounterId });
  await run("preconsulta_inbox_discard", { id: inbox.items[1]!.id });
  await run("preconsulta_inbox_set_retention", { days: 90 });
  await run("preconsulta_personal_link", { patientId: "pat-1" });
  await run("preconsulta_create_personal_link", { patientId: "pat-1" });
  const event = await run<{ id: string }>("add_timeline_event", {
    patientId: patient.id,
    event: { event_date: "2026-01-02", category: "estudio", title: "Biometria", detail: null }
  });
  await run("list_timeline_events", { patientId: patient.id });
  await run("update_timeline_event", {
    eventId: event.id,
    event: { event_date: "2026-01-03", category: "estudio", title: "Biometria hematica", detail: "normal" }
  });
  await run("delete_timeline_event", { eventId: event.id });
  await run("get_patient_medical_history", { patientId: patient.id });
  await run("save_patient_medical_history", {
    patientId: patient.id,
    input: {
      payload_json: "{}",
      source: "DOCTOR",
      encounter_id: encounterId,
      source_appointment_id: null,
      reconciled_source_hash: null
    }
  });
  await run("update_patient_background", { encounterId, background: { allergies: "Ninguna" } });
  await run("save_prescription", { encounterId, content: "Paracetamol 500 mg cada 8 h" });
  await run("save_note", {
    encounterId,
    note: {
      subjective: "s",
      objective: "o",
      assessment: "a",
      plan: "p",
      diagnosis: "d",
      instructions: "i",
      specialty: null,
      coded_diagnoses: [{ code: "R51", name: "CEFALEA", principal: true }]
    }
  });
  await run("cie10_search", { query: "cefalea" });
  await run("cie10_check", { codes: ["R51"], patientId: patient.id });
  await run("cie10_catalog_info");
  await run("search_records", { query: "cefalea" });

  // Documentos.
  const pdf = btoa("%PDF-1.4\n%%EOF");
  const document = await run<{ id: string }>("documents_add", {
    document: {
      patient_id: patient.id,
      encounter_id: encounterId,
      file_name: "estudio.pdf",
      category: "LABORATORIO",
      title: null,
      content_base64: pdf
    }
  });
  await run("documents_list", { patientId: patient.id });
  await run("documents_read", { documentId: document.id });
  await run("documents_delete", { documentId: document.id });

  // Licencia y actualizaciones.
  await run("license_status");
  await run("activate_license");
  await run("check_for_update");

  // IA.
  for (const kind of ["", "voice_", "scribe_"]) {
    await run(`ai_${kind}consent_status`, { patientId: patient.id });
    await run(`ai_grant_${kind}consent`, { patientId: patient.id });
  }
  await run("ai_list_text_models");
  const soap = await run<{ run_id: string }>("ai_assist_soap", { encounterId });
  await run("ai_assist_text", { encounterId, usageType: "PATIENT_INSTRUCTIONS" });
  const transcription = await run<{ run_id: string }>("ai_transcribe_audio", {
    encounterId,
    audioBase64: btoa("RIFF")
  });
  await run("ai_diarize_consultation", { encounterId, audioBase64: btoa("RIFF") });
  await run("ai_save_reviewed_transcription", {
    encounterId,
    runId: transcription.run_id,
    turns: [{ id: "t1", speaker: "MEDICO", text: "Buenas tardes, cuenteme." }]
  });
  await run("ai_latest_reviewed_transcription", { encounterId });
  await run("ai_structure_consultation", { encounterId, templateId: null });
  await run("ai_generate_clinical_aid", { encounterId });
  await run("ai_discard_reviewed_transcription", { encounterId, runId: transcription.run_id });
  await run("ai_review_run", { runId: soap.run_id, status: "APPROVED", feedback: null });
  await run("ai_list_runs");
  await run("ai_usage_summary");
  await run("ai_set_budget", { budgetCents: 5000 });
  await run("ai_run_benchmark");
  await run("ai_list_benchmarks");
  for (const kind of ["", "voice_", "scribe_"]) {
    await run(`ai_revoke_${kind}consent`, { patientId: patient.id });
  }
  await run("list_consultation_templates");
  const template = await run<{ id: string }>("save_consultation_template", {
    template: {
      id: "plantilla-contrato",
      name: "Contrato",
      clinical_profile: "GENERAL",
      segments: [{ id: "s1", label: "Motivo", target: "subjective", instructions: "", required: true }]
    }
  });
  await run("delete_consultation_template", { id: template.id });
  await run("transcription_recommendation");
  await run("transcription_model_status");
  await run("download_transcription_model", { modelId: "small" });
  await run("diarization_model_status");
  await run("download_diarization_model", { modelId: "diarization-segmentation" });

  // Seguridad de medicacion.
  await run("check_medication_safety", { encounterId, prescription: "Ibuprofeno y ketorolaco" });
  await run("medication_reference_status");
  await run("extract_prescription_medications", { prescription: "Paracetamol 500 mg" });
  await run("update_medication_reference_from_midoc");
  await run("update_medication_reference", { version: "contrato" });
  await run("import_medication_reference", {
    medicationsCsv: ["ingredient,display_name,class", "paracetamol,Paracetamol,Analgesico"].join("\n"),
    ddinterCsv: "",
    version: "contrato"
  });

  // Odontologia.
  const budget = await run<{ id: string; items: Array<{ id: string }> }>("dental_create_budget", {
    budget: {
      patient_id: patient.id,
      encounter_id: encounterId,
      label: "Plan A",
      discount_cents: 0,
      notes: null,
      alternative_group: null,
      items: [{ tooth_id: "16", procedure: "Resina", price_cents: 80000 }]
    }
  });
  await run("dental_decide_budget", { budgetId: budget.id, status: "ACCEPTED" });
  await run("dental_set_item_status", { itemId: budget.items[0].id, status: "DONE" });
  await run("dental_list_budgets", { patientId: patient.id });
  await run("dental_patient_balance", { patientId: patient.id });
  await run("dental_specialty_history", { patientId: patient.id });
  const order = await run<{ id: string }>("dental_create_lab_order", {
    order: {
      patient_id: patient.id,
      encounter_id: encounterId,
      tooth_id: "16",
      work_type: "Corona",
      lab_name: "Laboratorio Norte",
      promised_at: null,
      cost_cents: 150000,
      notes: null
    }
  });
  await run("dental_set_lab_order_status", { orderId: order.id, status: "SENT" });
  await run("dental_list_lab_orders", { patientId: patient.id });
  await run("dental_pending_lab_orders");

  // Operacion presencial (congelada).
  await run("list_resources");
  const resource = await run<{ id: string }>("create_resource", { resource: { name: "Sillon 1", kind: "CHAIR" } });
  await run("set_resource_active", { resourceId: resource.id, active: false });
  const visit = await run<{ id: string }>("check_in_appointment", { appointmentId: "appt-2" });
  await run("list_active_visits");
  await run("set_visit_state", { visitId: visit.id, visitState: "WAITING" });
  await run("assign_resource", { visitId: visit.id, resourceId: resource.id });
  await run("start_visit_encounter", { visitId: visit.id, linkPatientId: patient.id });
  await run("register_walk_in", {
    walkIn: { patient_name: "Paciente Sin Cita", patient_phone: null, reason: null, priority: 0 },
    linkPatientId: null,
    forceNew: true
  });
  await run("get_open_cash_session");
  await run("open_cash_session", { openingFloatCents: 50000 });
  await run("register_payment", {
    payment: {
      visit_id: null,
      patient_id: patient.id,
      amount_cents: 30000,
      method: "CASH",
      kind: "PAYMENT",
      concept: "Consulta",
      budget_id: null
    }
  });
  await run("list_session_payments");
  await run("cash_summary");
  await run("close_cash_session", { closingCountedCents: 80000, notes: null });

  // ARCO.
  const request = await run<{ id: string }>("arco_record_request", {
    patientId: patient.id,
    requestType: "ACCESS",
    notes: null
  });
  await run("arco_list_requests", { patientId: patient.id });
  await run("arco_mark_fulfilled", { requestId: request.id, resultSummary: "Entregado" });
  const cancellation = await run<{ id: string }>("arco_record_request", {
    patientId: patient.id,
    requestType: "CANCELLATION",
    notes: null
  });
  await run("arco_fulfill_cancellation", { requestId: cancellation.id });
  await run("verify_signature", { encounterId });
  await run("sign_encounter", { encounterId });
  await run("lock_database");

  // Lo que el mock deliberadamente no implementa: dialogos nativos, red y
  // escritura de archivos. En el navegador fallan con "mock sin comando".
  const notMocked = [
    "unlink_device",
    "sync_pending",
    "publish_authorized_summary",
    "record_export",
    "save_export",
    "save_fhir_export",
    "save_directory_csv",
    "install_update"
  ];
  for (const command of notMocked) {
    await assert.rejects(mockCall(command), /mock sin comando/, `${command} si esta en el mock: recorrelo`);
  }
  const missing = Object.keys(IPC_RESPONSE_SCHEMAS).filter(
    (command) => !validated.has(command) && !notMocked.includes(command)
  );
  assert.deepEqual(missing, [], "comandos del mock sin recorrer en esta prueba");
});
