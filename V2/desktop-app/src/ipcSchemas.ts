import { z } from "zod";

// Sin compilacion con `new Function`: la CSP del webview prohibe eval, y Zod la
// intenta y la reporta como violacion antes de caer al camino interpretado.
z.config({ jitless: true });

/**
 * Contrato de las respuestas del proceso nativo (REGLAS_DESARROLLO.md §3:
 * validacion en las fronteras). Cada comando registrado en `lib.rs` declara
 * aqui la forma de lo que devuelve, y `call()` valida la respuesta antes de que
 * llegue a la UI, venga del backend real o del mock de navegador.
 *
 * - **Objetos laxos.** Se usa `z.looseObject`: se valida lo declarado y las
 *   claves desconocidas se conservan. Un `z.object` de Zod 4 borraria los campos
 *   no declarados y un esquema incompleto dejaria a la UI sin datos que lee.
 * - **Tabla exhaustiva.** `ipcSchemas.test.ts` lee `lib.rs` y falla si se
 *   registra un comando sin contrato o si queda un contrato sin comando.
 * - **Errores sin valores.** El mensaje nombra comando, campo y problema; nunca
 *   el valor recibido, que puede ser contenido clinico (regla 4.2).
 *
 * Los tipos salen de los `struct` de Rust: `Option<T>` es `.nullable()`, un
 * campo con `skip_serializing_if` es `.optional()`, `#[serde(flatten)]` se
 * aplana con `.extend()` y `rename_all = "camelCase"` cambia los nombres.
 */

/* ---------- Piezas compartidas ---------- */

/** `()` en Rust: Tauri entrega `null`; el mock de navegador, `undefined`. */
const NADA = z.null().optional();

/** `serde_json::Value`: JSON opaco que interpreta la pantalla. */
const JSON_OPACO = z.unknown();

const texto = z.string();
const textoONulo = z.string().nullable();
const entero = z.number().int();
const enteroONulo = z.number().int().nullable();
const listaDeTextos = z.array(z.string());

/* ---------- Perfiles, sincronizacion y cuenta (lib.rs, sync.rs) ---------- */

const doctorProfile = z.looseObject({
  id: texto,
  display_name: texto,
  created_at: texto,
  last_used_at: textoONulo
});

const unlockResult = z.looseObject({
  schema_version: entero,
  db_path: texto,
  backup_path: texto,
  profile: doctorProfile
});

const syncStatus = z.looseObject({
  linked: z.boolean(),
  server_url: textoONulo,
  cursor: entero,
  clinical_profile: textoONulo,
  slot_minutes: enteroONulo,
  work_start_minutes: enteroONulo,
  work_end_minutes: enteroONulo,
  doctor_name: textoONulo,
  doctor_license: textoONulo,
  credit_balance: enteroONulo,
  credit_balance_at: textoONulo
});

const linkOutcome = z.looseObject({ license_error: textoONulo });

const syncSummary = z.looseObject({
  applied_events: entero,
  cursor: entero,
  ai_usage_reported: entero
});

const syncPending = z.looseObject({
  pending_download: z.boolean(),
  pending_upload: z.boolean()
});

const appointmentRow = z.looseObject({
  id: texto,
  status: texto,
  scheduled_start: texto,
  scheduled_end: texto,
  service_name: textoONulo,
  reason: textoONulo,
  patient_name: texto,
  patient_phone: textoONulo,
  has_precheckin: z.boolean()
});

const prescriber = z.looseObject({
  professionalName: texto,
  licenseNumber: textoONulo,
  degreeInstitution: textoONulo,
  specialtyTitle: textoONulo,
  specialtyLicenseNumber: textoONulo,
  addressLine1: textoONulo,
  addressLine2: textoONulo,
  city: textoONulo,
  state: textoONulo,
  postalCode: textoONulo,
  updatedAt: texto
});

const prescriberView = z.looseObject({
  linked: z.boolean(),
  prescriber: prescriber.nullable()
});

const prescriberSave = z.discriminatedUnion("kind", [
  z.looseObject({ kind: z.literal("saved"), prescriber }),
  z.looseObject({ kind: z.literal("conflict"), message: texto, current: prescriber })
]);

/* ---------- Expediente (clinical.rs) ---------- */

const encounter = z.looseObject({
  id: texto,
  appointment_id: textoONulo,
  patient_id: texto,
  status: texto,
  opened_at: texto,
  signed_at: textoONulo,
  signed_hash: textoONulo
});

const guardian = z.looseObject({
  name: texto,
  relationship: textoONulo,
  phone: textoONulo,
  email: textoONulo
});

const patientRecord = z.looseObject({
  id: texto,
  first_name: texto,
  last_name: texto,
  phone: textoONulo,
  email: textoONulo,
  birth_date: textoONulo,
  allergies: textoONulo,
  medical_background: textoONulo,
  family_background: textoONulo,
  guardian: guardian.nullable(),
  is_minor: z.boolean()
});

const codedDiagnosis = z.looseObject({
  code: texto,
  name: texto,
  principal: z.boolean()
});

const noteContentShape = {
  subjective: texto,
  objective: texto,
  assessment: texto,
  plan: texto,
  diagnosis: texto,
  instructions: texto,
  specialty: JSON_OPACO,
  // `skip_serializing_if = "Vec::is_empty"`: ausente cuando no hay claves.
  coded_diagnoses: z.array(codedDiagnosis).optional()
};

const noteContent = z.looseObject(noteContentShape);

const noteVersion = z.looseObject({
  version: entero,
  created_at: texto,
  ...noteContentShape
});

const historyEntry = z.looseObject({
  encounter_id: texto,
  signed_at: textoONulo,
  status: texto,
  diagnosis: texto,
  coded_diagnoses: z.array(codedDiagnosis)
});

const encounterDetail = z.looseObject({
  encounter,
  patient: patientRecord,
  appointment_reason: textoONulo,
  appointment_start: textoONulo,
  medical_history: textoONulo,
  preconsulta: textoONulo,
  note: noteVersion.nullable(),
  note_version_count: entero,
  prescription: textoONulo,
  history: z.array(historyEntry)
});

const patientSummary = z.looseObject({
  id: texto,
  first_name: texto,
  last_name: texto,
  phone: textoONulo,
  email: textoONulo,
  birth_date: textoONulo,
  allergies: textoONulo,
  encounter_count: entero,
  last_visit: textoONulo
});

const openEncounter = z.looseObject({
  encounter_id: texto,
  patient_id: texto,
  patient_name: texto,
  opened_at: texto,
  appointment_id: textoONulo,
  diagnosis: texto,
  has_note: z.boolean()
});

const patientProfile = z.looseObject({
  patient: patientRecord,
  history: z.array(historyEntry)
});

const timelineEvent = z.looseObject({
  id: texto,
  patient_id: texto,
  event_date: texto,
  category: texto,
  title: texto,
  detail: textoONulo,
  created_at: texto,
  updated_at: texto
});

const appointmentPatient = z.looseObject({
  first_name: texto,
  last_name: texto,
  phone: textoONulo,
  email: textoONulo
});

const patientMatch = patientSummary.extend({
  matched_name: z.boolean(),
  matched_phone: z.boolean(),
  matched_email: z.boolean()
});

const needsResolution = z.looseObject({
  kind: z.literal("needs_resolution"),
  appointment_patient: appointmentPatient,
  candidates: z.array(patientMatch)
});

const attendOutcome = z.discriminatedUnion("kind", [
  z.looseObject({ kind: z.literal("encounter"), encounter_id: texto }),
  needsResolution
]);

const resolveOutcome = z.discriminatedUnion("kind", [
  z.looseObject({ kind: z.literal("patient"), patient_id: texto }),
  needsResolution
]);

const medicalHistoryVersion = z.looseObject({
  id: texto,
  patient_id: texto,
  version: entero,
  payload_json: texto,
  source: texto,
  encounter_id: textoONulo,
  source_appointment_id: textoONulo,
  reconciled_source_hash: textoONulo,
  created_at: texto
});

/* ---------- Operacion presencial (operations.rs; modulo congelado) ---------- */

const resource = z.looseObject({
  id: texto,
  name: texto,
  kind: texto,
  active: z.boolean()
});

const visit = z.looseObject({
  id: texto,
  appointment_id: textoONulo,
  patient_id: textoONulo,
  patient_name: texto,
  patient_phone: textoONulo,
  reason: textoONulo,
  service_name: textoONulo,
  state: texto,
  priority: entero,
  resource_id: textoONulo,
  resource_name: textoONulo,
  encounter_id: textoONulo,
  arrived_at: texto,
  started_at: textoONulo,
  ended_at: textoONulo
});

const walkInOutcome = z.discriminatedUnion("kind", [
  z.looseObject({ kind: z.literal("visit"), visit }),
  z.looseObject({ kind: z.literal("needs_resolution"), candidates: z.array(patientMatch) })
]);

const cashSession = z.looseObject({
  id: texto,
  opened_at: texto,
  opening_float_cents: entero,
  closed_at: textoONulo,
  closing_counted_cents: enteroONulo,
  notes: textoONulo
});

const payment = z.looseObject({
  id: texto,
  cash_session_id: texto,
  visit_id: textoONulo,
  patient_id: textoONulo,
  amount_cents: entero,
  method: texto,
  kind: texto,
  concept: textoONulo,
  budget_id: textoONulo,
  receipt_number: texto,
  created_at: texto
});

const cashSummary = z.looseObject({
  session: cashSession,
  payment_count: entero,
  net_total_cents: entero,
  by_method: z.array(z.looseObject({ method: texto, total_cents: entero })),
  expected_cash_cents: entero
});

/* ---------- Odontologia (dental.rs) ---------- */

const budgetItem = z.looseObject({
  id: texto,
  budget_id: texto,
  tooth_id: texto,
  procedure: texto,
  price_cents: entero,
  status: texto,
  completed_at: textoONulo
});

const budget = z.looseObject({
  id: texto,
  patient_id: texto,
  encounter_id: textoONulo,
  label: texto,
  status: texto,
  discount_cents: entero,
  notes: textoONulo,
  alternative_group: textoONulo,
  created_at: texto,
  decided_at: textoONulo,
  items: z.array(budgetItem),
  total_cents: entero,
  paid_cents: entero,
  balance_cents: entero
});

const dentalBalance = z.looseObject({
  accepted_total_cents: entero,
  paid_cents: entero,
  balance_cents: entero,
  accepted_budgets: entero
});

const specialtyHistoryEntry = z.looseObject({
  encounter_id: texto,
  opened_at: texto,
  signed_at: textoONulo,
  status: texto,
  specialty_json: texto
});

const labOrder = z.looseObject({
  id: texto,
  patient_id: texto,
  encounter_id: textoONulo,
  tooth_id: texto,
  work_type: texto,
  lab_name: texto,
  status: texto,
  promised_at: textoONulo,
  sent_at: textoONulo,
  received_at: textoONulo,
  delivered_at: textoONulo,
  cost_cents: entero,
  notes: textoONulo,
  created_at: texto
});

const pendingLabOrder = labOrder.extend({ patient_name: texto });

/* ---------- CIE-10, busqueda, salida del expediente y documentos ---------- */

const cie10Match = z.looseObject({
  code: texto,
  display_code: texto,
  name: texto,
  warnings: listaDeTextos
});

const cie10CatalogInfo = z.looseObject({
  version: texto,
  source: z.looseObject({ name: texto, license: texto })
});

const searchResults = z.looseObject({
  hits: z.array(
    z.looseObject({
      patient_id: texto,
      patient_name: texto,
      encounter_id: textoONulo,
      encounter_opened_at: textoONulo,
      encounter_status: textoONulo,
      kind: texto,
      field: texto,
      snippet: texto,
      document_id: textoONulo
    })
  ),
  truncated: z.boolean(),
  expanded_terms: listaDeTextos
});

const recordExport = z.looseObject({
  generated_at: texto,
  doctor: z.looseObject({
    name: textoONulo,
    license: textoONulo,
    degree_institution: textoONulo,
    specialty_title: textoONulo,
    specialty_license: textoONulo,
    address_line1: textoONulo,
    address_line2: textoONulo,
    city: textoONulo,
    state: textoONulo,
    postal_code: textoONulo
  }),
  patient: patientRecord,
  sex: textoONulo,
  medical_history: textoONulo,
  encounters: z.array(
    z.looseObject({
      id: texto,
      opened_at: texto,
      status: texto,
      signed_at: textoONulo,
      signed_hash: textoONulo,
      note_version: enteroONulo,
      note_saved_at: textoONulo,
      note: noteContent.nullable(),
      prescription: textoONulo
    })
  ),
  documents: z.array(
    z.looseObject({
      id: texto,
      file_name: texto,
      mime_type: texto,
      size_bytes: entero,
      title: textoONulo,
      category: textoONulo,
      received_at: texto,
      encounter_id: textoONulo,
      sha256: textoONulo
    })
  )
});

/** `None` cuando el medico cancela "Guardar como". */
const savedExport = z.looseObject({ path: texto, sha256: texto }).nullable();
const savedDirectory = z.looseObject({ path: texto, patients: entero }).nullable();

const documentMeta = z.looseObject({
  id: texto,
  patient_id: texto,
  encounter_id: textoONulo,
  encounter_opened_at: textoONulo,
  file_name: texto,
  title: textoONulo,
  mime_type: texto,
  category: textoONulo,
  size_bytes: entero,
  sha256: textoONulo,
  source: texto,
  received_at: texto
});

const documentContent = z.looseObject({
  meta: documentMeta,
  content_base64: texto
});

/* ---------- Licencia y actualizaciones (license.rs, updates.rs) ---------- */

const licenseStatus = z.looseObject({
  state: z.enum(["VALID", "MISSING", "INVALID"]),
  reason: textoONulo,
  holder_name: textoONulo,
  holder_license_number: textoONulo,
  edition: textoONulo,
  purchased_at: textoONulo,
  updates_until: textoONulo,
  updates_included: z.boolean(),
  max_devices: enteroONulo
});

const updateCheck = z.looseObject({
  configured: z.boolean(),
  current_version: texto,
  available: z.boolean(),
  version: textoONulo,
  published_at: textoONulo,
  notes: textoONulo,
  critical: z.boolean(),
  allowed: z.boolean(),
  reason: textoONulo
});

/* ---------- IA (ai.rs, diarization.rs, plantillas) ---------- */

/** Campos comunes a toda salida de IA: traza, proveedor y costo. */
const aiDraftShape = {
  run_id: texto,
  provider: texto,
  model_version: texto,
  estimated_cost_cents: entero,
  latency_ms: entero
};

const segmentDraft = z.looseObject({
  segment_id: texto,
  content: texto,
  confidence: texto,
  source_turns: listaDeTextos,
  warnings: listaDeTextos
});

const soapDraft = z.looseObject({ ...aiDraftShape, draft: noteContent });

const textDraft = z.looseObject({ ...aiDraftShape, usage_type: texto, text: texto });

const transcriptionDraft = z.looseObject({
  ...aiDraftShape,
  usage_type: texto,
  transcript_text: texto,
  audio_retention_policy: texto,
  segments_json: textoONulo
});

const consultationTurn = z.looseObject({ id: texto, speaker: texto, text: texto });

const reviewedTranscription = z.looseObject({
  id: texto,
  encounter_id: texto,
  run_id: texto,
  transcript_text: texto,
  turns: z.array(consultationTurn),
  status: texto,
  created_at: texto,
  reviewed_at: texto
});

const diarizationDraft = z.looseObject({
  ...aiDraftShape,
  usage_type: texto,
  transcript_text: texto,
  turns: z.array(
    z.looseObject({
      id: texto,
      speakerId: texto,
      role: z.enum(["MEDICO", "PACIENTE"]),
      text: texto,
      startCs: entero,
      endCs: entero
    })
  ),
  diarized: z.boolean(),
  audio_retention_policy: texto
});

const consultationStructuringDraft = z.looseObject({
  ...aiDraftShape,
  usage_type: texto,
  segments: z.array(segmentDraft),
  missing: listaDeTextos,
  warnings: listaDeTextos
});

const clinicalAidDraft = z.looseObject({
  ...aiDraftShape,
  usage_type: texto,
  soap: noteContent,
  template_segments: z.array(segmentDraft),
  possibilities: z.array(
    z.looseObject({
      title: texto,
      compatibility: texto,
      explanation: texto,
      supporting_findings: listaDeTextos,
      conflicting_findings: listaDeTextos,
      missing_data: listaDeTextos
    })
  ),
  exam_suggestions: z.array(z.looseObject({ name: texto, reason: texto })),
  question_suggestions: z.array(z.looseObject({ question: texto, reason: texto })),
  studies: z.array(z.looseObject({ name: texto, reason: texto, priority: texto })),
  treatments: z.array(z.looseObject({ name: texto, reason: texto, precautions: listaDeTextos })),
  prescription_draft: texto,
  background_updates: z.array(z.looseObject({ field: texto, content: texto })),
  medical_history_updates: z.array(
    z.looseObject({
      path: texto,
      label: texto,
      value: JSON_OPACO,
      source_turns: listaDeTextos,
      confidence: texto,
      warning: texto
    })
  ),
  warnings: listaDeTextos
});

const textModelOption = z.looseObject({
  id: texto,
  provider: texto,
  model: texto,
  label: texto,
  is_default: z.boolean()
});

const storedTemplate = z.looseObject({
  id: texto,
  name: texto,
  clinical_profile: texto,
  segments: z.array(
    z.looseObject({
      id: texto,
      label: texto,
      target: texto,
      instructions: texto,
      required: z.boolean()
    })
  ),
  created_at: textoONulo,
  updated_at: textoONulo
});

const aiRun = z.looseObject({
  id: texto,
  encounter_id: textoONulo,
  patient_id: textoONulo,
  usage_type: texto,
  provider: texto,
  model_version: textoONulo,
  prompt_version: texto,
  status: texto,
  estimated_cost_cents: enteroONulo,
  latency_ms: enteroONulo,
  feedback: textoONulo,
  reviewed_at: textoONulo,
  created_at: texto
});

const usageSummary = z.looseObject({
  month: texto,
  budget_cents: entero,
  spent_cents: entero,
  run_count: entero,
  by_usage: z.array(z.looseObject({ usage_type: texto, run_count: entero, cost_cents: entero }))
});

const benchmarkRun = z.looseObject({
  id: texto,
  name: texto,
  case_count: entero,
  recommended_provider: textoONulo,
  notes: textoONulo,
  created_at: texto,
  results: z.array(
    z.looseObject({
      provider: texto,
      success_count: entero,
      avg_latency_ms: entero,
      total_cost_cents: entero,
      completeness_pct: entero
    })
  )
});

const transcriptionRecommendation = z.looseObject({
  totalRamMb: entero,
  cpuCores: entero,
  hasGpu: z.boolean(),
  accel: texto,
  accelLabel: texto,
  modelId: texto,
  modelLabel: texto,
  modelRamMb: entero,
  diskMb: entero,
  realtimeCapable: z.boolean(),
  recommendCloudFallback: z.boolean(),
  reason: texto
});

const modelStatus = z.looseObject({
  modelId: texto,
  fileName: texto,
  expectedSizeBytes: entero,
  downloadedBytes: entero,
  present: z.boolean(),
  verified: z.boolean(),
  downloading: z.boolean(),
  error: textoONulo
});

/* ---------- Seguridad de medicacion (medication.rs) ---------- */

const safetyReport = z.looseObject({
  normalized: z.array(
    z.looseObject({
      input: texto,
      ingredient: textoONulo,
      displayName: textoONulo,
      drugClass: textoONulo,
      recognized: z.boolean()
    })
  ),
  unrecognized: listaDeTextos,
  interactions: z.array(
    z.looseObject({
      drugA: texto,
      drugB: texto,
      severity: texto,
      description: texto,
      source: texto,
      sourceVersion: texto
    })
  ),
  allergyAlerts: z.array(
    z.looseObject({ drug: texto, matchedAllergy: texto, viaClass: textoONulo, source: texto })
  ),
  duplicateTherapy: z.array(z.looseObject({ drugA: texto, drugB: texto, drugClass: texto })),
  tripleInteractions: z.array(
    z.looseObject({
      drugA: texto,
      drugB: texto,
      drugC: texto,
      severity: texto,
      description: texto,
      source: texto,
      sourceVersion: texto
    })
  ),
  labelNotes: z.array(z.looseObject({ drugA: texto, drugB: texto, text: texto, source: texto })),
  referenceVersion: texto,
  hasAlerts: z.boolean()
});

const referenceStatus = z.looseObject({
  version: texto,
  medications: entero,
  interactions: entero,
  labels: entero
});

const importSummary = z.looseObject({
  medications: entero,
  interactions: entero,
  labels: entero,
  version: texto
});

/* ---------- ARCO (arco.rs) ---------- */

const arcoRequest = z.looseObject({
  id: texto,
  patient_id: texto,
  request_type: texto,
  status: texto,
  notes: textoONulo,
  requested_at: texto,
  fulfilled_at: textoONulo,
  result_summary: textoONulo
});

const patientDataExport = z.looseObject({
  patient_id: texto,
  first_name: texto,
  last_name: texto,
  phone: textoONulo,
  email: textoONulo,
  birth_date: textoONulo,
  sex: textoONulo,
  allergies: textoONulo,
  medical_background: textoONulo,
  family_background: textoONulo,
  guardian: guardian.nullable(),
  is_minor: z.boolean(),
  rights_exercised_by: textoONulo,
  encounters: z.array(
    z.looseObject({
      id: texto,
      appointment_id: textoONulo,
      status: texto,
      opened_at: texto,
      signed_at: textoONulo,
      notes: z.array(
        z.looseObject({
          version: entero,
          subjective: texto,
          objective: texto,
          assessment: texto,
          plan: texto,
          diagnosis: texto,
          instructions: texto,
          created_at: texto
        })
      ),
      prescriptions: listaDeTextos
    })
  ),
  documents: z.array(
    z.looseObject({
      id: texto,
      file_name: texto,
      mime_type: texto,
      category: textoONulo,
      size_bytes: entero,
      received_at: texto
    })
  ),
  medical_history_versions: z.array(medicalHistoryVersion),
  generated_at: texto
});

const cancellationResult = z.looseObject({
  patient_id: texto,
  deleted_encounters: entero,
  deleted_notes: entero,
  deleted_prescriptions: entero,
  deleted_documents: entero,
  deleted_ai_runs: entero,
  deleted_ai_consents: entero,
  deleted_precheckins: entero,
  deleted_medical_history_versions: entero,
  anonymized_visits: entero,
  anonymized_appointments: entero,
  deleted_transcriptions: entero,
  deleted_timeline_events: entero,
  deleted_lab_orders: entero,
  deleted_budgets: entero,
  anonymized_budgets: entero,
  deleted_patient_links: entero
});

/* ---------- Tabla de contratos ---------- */

/** Un contrato por cada comando de `tauri::generate_handler!` en `lib.rs`. */
export const IPC_RESPONSE_SCHEMAS = {
  // Perfiles y base cifrada
  list_doctor_profiles: z.array(doctorProfile),
  create_doctor_profile: doctorProfile,
  unlock_database: unlockResult,
  lock_database: NADA,
  // Cuenta y sincronizacion
  sync_status: syncStatus,
  link_account: linkOutcome,
  unlink_device: NADA,
  sync_now: syncSummary,
  sync_pending: syncPending,
  publish_authorized_summary: texto,
  list_appointments: z.array(appointmentRow),
  get_prescriber: prescriberView,
  save_prescriber: prescriberSave,
  // Expediente
  open_encounter: encounter,
  attend_appointment: attendOutcome,
  resolve_appointment_patient: resolveOutcome,
  get_encounter: encounterDetail,
  list_patients: z.array(patientSummary),
  list_open_encounters: z.array(openEncounter),
  get_patient_profile: patientProfile,
  find_patient_matches: z.array(patientSummary),
  create_patient: patientRecord,
  open_patient_encounter: encounter,
  list_timeline_events: z.array(timelineEvent),
  add_timeline_event: timelineEvent,
  update_timeline_event: timelineEvent,
  delete_timeline_event: NADA,
  save_note: entero,
  save_prescription: NADA,
  update_patient_background: NADA,
  get_patient_medical_history: medicalHistoryVersion.nullable(),
  save_patient_medical_history: medicalHistoryVersion,
  sign_encounter: encounter,
  verify_signature: z.boolean(),
  // Operacion presencial (congelada)
  list_resources: z.array(resource),
  create_resource: resource,
  set_resource_active: NADA,
  list_active_visits: z.array(visit),
  check_in_appointment: visit,
  register_walk_in: walkInOutcome,
  set_visit_state: visit,
  assign_resource: visit,
  start_visit_encounter: attendOutcome,
  get_open_cash_session: cashSession.nullable(),
  open_cash_session: cashSession,
  close_cash_session: cashSummary,
  cash_summary: cashSummary,
  register_payment: payment,
  list_session_payments: z.array(payment),
  // Odontologia
  dental_create_budget: budget,
  dental_decide_budget: budget,
  dental_set_item_status: budget,
  dental_list_budgets: z.array(budget),
  dental_patient_balance: dentalBalance,
  dental_specialty_history: z.array(specialtyHistoryEntry),
  dental_create_lab_order: labOrder,
  dental_set_lab_order_status: labOrder,
  dental_list_lab_orders: z.array(labOrder),
  dental_pending_lab_orders: z.array(pendingLabOrder),
  // CIE-10, busqueda y salida
  cie10_search: z.array(cie10Match),
  cie10_check: z.array(cie10Match),
  cie10_catalog_info: cie10CatalogInfo,
  search_records: searchResults,
  record_export: recordExport,
  save_export: savedExport,
  save_fhir_export: savedExport,
  save_directory_csv: savedDirectory,
  // Licencia y actualizaciones
  license_status: licenseStatus,
  activate_license: licenseStatus,
  check_for_update: updateCheck,
  install_update: NADA,
  // Documentos
  documents_add: documentMeta,
  documents_list: z.array(documentMeta),
  documents_read: documentContent,
  documents_delete: NADA,
  // IA: consentimientos
  ai_consent_status: z.boolean(),
  ai_grant_consent: NADA,
  ai_revoke_consent: NADA,
  ai_voice_consent_status: z.boolean(),
  ai_grant_voice_consent: NADA,
  ai_revoke_voice_consent: NADA,
  ai_scribe_consent_status: z.boolean(),
  ai_grant_scribe_consent: NADA,
  ai_revoke_scribe_consent: NADA,
  // IA: asistentes y transcripcion
  ai_assist_soap: soapDraft,
  ai_assist_text: textDraft,
  ai_transcribe_audio: transcriptionDraft,
  ai_save_reviewed_transcription: reviewedTranscription,
  ai_latest_reviewed_transcription: reviewedTranscription.nullable(),
  ai_discard_reviewed_transcription: NADA,
  ai_diarize_consultation: diarizationDraft,
  ai_structure_consultation: consultationStructuringDraft,
  ai_generate_clinical_aid: clinicalAidDraft,
  ai_list_text_models: z.array(textModelOption),
  list_consultation_templates: z.array(storedTemplate),
  save_consultation_template: storedTemplate,
  delete_consultation_template: NADA,
  // IA: gobierno, costo y benchmark
  ai_review_run: aiRun,
  ai_list_runs: z.array(aiRun),
  ai_usage_summary: usageSummary,
  ai_set_budget: NADA,
  ai_run_benchmark: benchmarkRun,
  ai_list_benchmarks: z.array(benchmarkRun),
  // Modelos locales
  transcription_recommendation: transcriptionRecommendation,
  transcription_model_status: z.array(modelStatus),
  download_transcription_model: NADA,
  diarization_model_status: z.array(modelStatus),
  download_diarization_model: NADA,
  // Seguridad de medicacion
  check_medication_safety: safetyReport,
  medication_reference_status: referenceStatus,
  import_medication_reference: importSummary,
  update_medication_reference: importSummary,
  update_medication_reference_from_midoc: importSummary,
  extract_prescription_medications: listaDeTextos,
  // ARCO
  arco_list_requests: z.array(arcoRequest),
  arco_record_request: arcoRequest,
  arco_mark_fulfilled: arcoRequest,
  arco_export_patient_data: patientDataExport,
  arco_fulfill_cancellation: cancellationResult
} satisfies Record<string, z.ZodType>;

export type IpcCommand = keyof typeof IPC_RESPONSE_SCHEMAS;

/** Respuesta del backend que no cumple su contrato. */
export class IpcContractError extends Error {
  readonly command: string;
  readonly issues: string[];

  constructor(command: string, issues: string[]) {
    super(
      `La respuesta de "${command}" no tiene la forma esperada (${issues.join("; ")}). ` +
        "La app de escritorio y su interfaz no coinciden: reinicia MiDoc o actualizala."
    );
    this.name = "IpcContractError";
    this.command = command;
    this.issues = issues;
  }
}

/**
 * Describe un problema sin el valor recibido: ruta del campo y que se esperaba.
 * El valor puede ser contenido clinico y no debe acabar en un error.
 */
function describeIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "(respuesta)";
  switch (issue.code) {
    case "invalid_type": {
      // Zod nombra el tipo recibido ("received undefined"), nunca el valor.
      const received = /received (\w+)/.exec(issue.message)?.[1];
      if (received === "undefined") return `${path}: falta (se esperaba ${issue.expected})`;
      return `${path}: se esperaba ${issue.expected}${received ? `, llego ${received}` : ""}`;
    }
    case "invalid_value":
      return `${path}: valor fuera de lo permitido`;
    case "invalid_union":
      return `${path}: no coincide con ninguna variante`;
    default:
      return `${path}: ${issue.code}`;
  }
}

/** Valida la respuesta de `command` contra su contrato y la devuelve tipada. */
export function parseIpcResponse<T>(command: string, raw: unknown): T {
  const schema = (IPC_RESPONSE_SCHEMAS as Record<string, z.ZodType>)[command];
  if (!schema) {
    throw new IpcContractError(command, ["comando sin contrato declarado en ipcSchemas.ts"]);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new IpcContractError(command, result.error.issues.slice(0, 5).map(describeIssue));
  }
  return result.data as T;
}
