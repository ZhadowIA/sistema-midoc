import { z } from "zod";

/**
 * Contrato de las respuestas del proceso nativo (REGLAS_DESARROLLO.md §3:
 * validacion en las fronteras). Cada comando Tauri declara aqui la forma de lo
 * que devuelve, y `call()` valida la respuesta antes de que llegue a la UI —
 * venga del backend real o del mock de navegador.
 *
 * Dos decisiones que sostienen el diseño:
 *
 * 1. **Objetos laxos.** Todos los esquemas usan `z.looseObject`: se valida lo
 *    declarado y las claves desconocidas se conservan. Un `z.object` estricto
 *    de Zod 4 *borraria* los campos no declarados, y un esquema incompleto
 *    dejaria a la UI sin datos que hoy lee. Laxo falla ruidoso, nunca silencioso.
 * 2. **Tabla exhaustiva.** Los 112 comandos registrados en `lib.rs` estan aqui,
 *    igual que en `authz.rs`. La prueba `ipcSchemas.test.ts` lee el codigo y
 *    falla si alguien registra un comando sin declarar su contrato.
 *
 * Los tipos derivan de los `struct` de Rust: `Option<T>` es `.nullable()`, y
 * los `#[serde(rename_all = "camelCase")]` se anotan donde aplican.
 */

/* ---------- Piezas compartidas ---------- */

/** Comandos que no devuelven nada (`()` en Rust): no hay forma que validar. */
const SIN_CONTENIDO = z.unknown();

/** JSON opaco para el frontend (`serde_json::Value` en Rust). */
const JSON_OPACO = z.unknown();

const doctorProfile = z.looseObject({
  id: z.string(),
  display_name: z.string(),
  created_at: z.string(),
  last_used_at: z.string().nullable()
});

const actor = z.looseObject({
  id: z.string(),
  name: z.string(),
  role: z.string()
});

const unlockResult = z.looseObject({
  schema_version: z.number(),
  db_path: z.string(),
  backup_path: z.string(),
  profile: doctorProfile,
  // El actor llego con la rebanada 2 del paso 27; una base abierta por una
  // version anterior del backend puede no traerlo (la UI degrada a recepcion).
  actor: actor.nullish()
});

const accessEntry = z.looseObject({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  created_at: z.string()
});

const syncStatus = z.looseObject({
  linked: z.boolean(),
  server_url: z.string().nullable(),
  cursor: z.number(),
  clinical_profile: z.string().nullable(),
  slot_minutes: z.number().nullable(),
  work_start_minutes: z.number().nullable(),
  work_end_minutes: z.number().nullable()
});

const syncSummary = z.looseObject({
  applied_events: z.number(),
  cursor: z.number(),
  ai_usage_reported: z.number()
});

const syncPending = z.looseObject({
  pending_download: z.boolean(),
  pending_upload: z.boolean()
});

const appointmentRow = z.looseObject({
  id: z.string(),
  status: z.string(),
  scheduled_start: z.string(),
  scheduled_end: z.string(),
  service_name: z.string().nullable(),
  reason: z.string().nullable(),
  patient_name: z.string(),
  patient_phone: z.string().nullable(),
  has_precheckin: z.boolean()
});

/* ---------- Expediente (CLINICO) ---------- */

const guardian = z.looseObject({
  name: z.string(),
  relationship: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable()
});

const patientRecord = z.looseObject({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  birth_date: z.string().nullable(),
  allergies: z.string().nullable(),
  medical_background: z.string().nullable(),
  family_background: z.string().nullable(),
  guardian: guardian.nullable(),
  is_minor: z.boolean()
});

const patientSummary = z.looseObject({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  birth_date: z.string().nullable(),
  allergies: z.string().nullable(),
  encounter_count: z.number(),
  last_visit: z.string().nullable()
});

/** `PatientMatch` aplana `PatientSummary` y suma en que coincidio. */
const patientMatch = patientSummary.extend({
  matched_name: z.boolean(),
  matched_phone: z.boolean(),
  matched_email: z.boolean()
});

const appointmentPatient = z.looseObject({
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable()
});

const encounter = z.looseObject({
  id: z.string(),
  appointment_id: z.string().nullable(),
  patient_id: z.string(),
  status: z.string(),
  opened_at: z.string(),
  signed_at: z.string().nullable(),
  signed_hash: z.string().nullable()
});

const noteContent = z.looseObject({
  subjective: z.string(),
  objective: z.string(),
  assessment: z.string(),
  plan: z.string(),
  diagnosis: z.string(),
  instructions: z.string(),
  specialty: JSON_OPACO
});

/** `NoteVersion` aplana `NoteContent`. */
const noteVersion = noteContent.extend({
  version: z.number(),
  created_at: z.string()
});

const historyEntry = z.looseObject({
  encounter_id: z.string(),
  signed_at: z.string().nullable(),
  status: z.string(),
  diagnosis: z.string()
});

const encounterDetail = z.looseObject({
  encounter,
  patient: patientRecord,
  appointment_reason: z.string().nullable(),
  appointment_start: z.string().nullable(),
  medical_history: z.string().nullable(),
  preconsulta: z.string().nullable(),
  note: noteVersion.nullable(),
  note_version_count: z.number(),
  prescription: z.string().nullable(),
  history: z.array(historyEntry)
});

const patientProfile = z.looseObject({
  patient: patientRecord,
  history: z.array(historyEntry)
});

const timelineEvent = z.looseObject({
  id: z.string(),
  patient_id: z.string(),
  event_date: z.string(),
  category: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string()
});

const medicalHistoryVersion = z.looseObject({
  id: z.string(),
  patient_id: z.string(),
  version: z.number(),
  payload_json: z.string(),
  source: z.string(),
  encounter_id: z.string().nullable(),
  source_appointment_id: z.string().nullable(),
  reconciled_source_hash: z.string().nullable(),
  created_at: z.string()
});

const needsResolution = z.looseObject({
  kind: z.literal("needs_resolution"),
  appointment_patient: appointmentPatient,
  candidates: z.array(patientMatch)
});

/** Desenlace de "Atender": o hay encuentro, o candidatos a duplicado. */
const attendOutcome = z.discriminatedUnion("kind", [
  z.looseObject({ kind: z.literal("encounter"), encounter_id: z.string() }),
  needsResolution
]);

const resolveOutcome = z.discriminatedUnion("kind", [
  z.looseObject({ kind: z.literal("patient"), patient_id: z.string() }),
  needsResolution
]);

/* ---------- Operacion presencial y caja (OPERATIVO) ---------- */

const resource = z.looseObject({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  active: z.boolean()
});

const visit = z.looseObject({
  id: z.string(),
  appointment_id: z.string().nullable(),
  patient_id: z.string().nullable(),
  patient_name: z.string(),
  patient_phone: z.string().nullable(),
  reason: z.string().nullable(),
  service_name: z.string().nullable(),
  state: z.string(),
  priority: z.number(),
  resource_id: z.string().nullable(),
  resource_name: z.string().nullable(),
  encounter_id: z.string().nullable(),
  arrived_at: z.string(),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable()
});

const walkInOutcome = z.discriminatedUnion("kind", [
  z.looseObject({ kind: z.literal("visit"), visit }),
  z.looseObject({ kind: z.literal("needs_resolution"), candidates: z.array(patientMatch) })
]);

const cashSession = z.looseObject({
  id: z.string(),
  opened_at: z.string(),
  opening_float_cents: z.number(),
  closed_at: z.string().nullable(),
  closing_counted_cents: z.number().nullable(),
  notes: z.string().nullable()
});

const cashSummary = z.looseObject({
  session: cashSession,
  payment_count: z.number(),
  net_total_cents: z.number(),
  by_method: z.array(z.looseObject({ method: z.string(), total_cents: z.number() })),
  expected_cash_cents: z.number()
});

const payment = z.looseObject({
  id: z.string(),
  cash_session_id: z.string(),
  visit_id: z.string().nullable(),
  patient_id: z.string().nullable(),
  amount_cents: z.number(),
  method: z.string(),
  kind: z.string(),
  concept: z.string().nullable(),
  budget_id: z.string().nullable(),
  receipt_number: z.string(),
  created_at: z.string()
});

/** FACTURABLE: lo que se imprime y se entrega al paciente (paso 27). */
const receipt = z.looseObject({
  receipt_number: z.string(),
  issued_at: z.string(),
  kind: z.string(),
  method: z.string(),
  amount_cents: z.number(),
  concept: z.string().nullable(),
  patient_name: z.string().nullable(),
  clinic_name: z.string().nullable(),
  clinic_address: z.string().nullable(),
  clinic_phone: z.string().nullable(),
  clinic_license: z.string().nullable()
});

const refundRequest = z.looseObject({
  id: z.string(),
  patient_id: z.string(),
  amount_cents: z.number(),
  reason: z.string().nullable(),
  status: z.string(),
  requested_by: z.string().nullable(),
  requested_at: z.string(),
  authorized_by: z.string().nullable(),
  authorized_at: z.string().nullable(),
  payment_id: z.string().nullable(),
  expires_at: z.string()
});

const clinicSettings = z.looseObject({
  name: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  license: z.string().nullable(),
  receipt_detail: z.string()
});

/* ---------- Odontologia (paso 26) ---------- */

const budgetItem = z.looseObject({
  id: z.string(),
  budget_id: z.string(),
  tooth_id: z.string(),
  procedure: z.string(),
  price_cents: z.number(),
  status: z.string(),
  completed_at: z.string().nullable()
});

const budget = z.looseObject({
  id: z.string(),
  patient_id: z.string(),
  encounter_id: z.string().nullable(),
  label: z.string(),
  status: z.string(),
  discount_cents: z.number(),
  notes: z.string().nullable(),
  alternative_group: z.string().nullable(),
  created_at: z.string(),
  decided_at: z.string().nullable(),
  items: z.array(budgetItem),
  total_cents: z.number(),
  paid_cents: z.number(),
  balance_cents: z.number()
});

const dentalBalance = z.looseObject({
  accepted_total_cents: z.number(),
  paid_cents: z.number(),
  balance_cents: z.number(),
  accepted_budgets: z.number()
});

const specialtyHistoryEntry = z.looseObject({
  encounter_id: z.string(),
  opened_at: z.string(),
  signed_at: z.string().nullable(),
  status: z.string(),
  specialty_json: z.string()
});

const labOrder = z.looseObject({
  id: z.string(),
  patient_id: z.string(),
  encounter_id: z.string().nullable(),
  tooth_id: z.string(),
  work_type: z.string(),
  lab_name: z.string(),
  status: z.string(),
  promised_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  received_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  cost_cents: z.number(),
  notes: z.string().nullable(),
  created_at: z.string()
});

/** `PendingLabOrder` aplana `LabOrder` y suma el nombre del paciente. */
const pendingLabOrder = labOrder.extend({ patient_name: z.string() });

/* ---------- IA gobernada (pasos 11, 21, 22, 23) ---------- */

/** Campos comunes a todo borrador de IA: siempre trazable a su run. */
const aiDraftBase = {
  run_id: z.string(),
  provider: z.string(),
  model_version: z.string(),
  estimated_cost_cents: z.number(),
  latency_ms: z.number()
};

const segmentDraft = z.looseObject({
  segment_id: z.string(),
  content: z.string(),
  confidence: z.string(),
  source_turns: z.array(z.string()),
  warnings: z.array(z.string())
});

const consultationTurn = z.looseObject({
  id: z.string(),
  speaker: z.string(),
  text: z.string()
});

/** `DiarizedTurn` viaja en camelCase (`#[serde(rename_all)]`). */
const diarizedTurn = z.looseObject({
  id: z.string(),
  speakerId: z.string(),
  role: z.string(),
  text: z.string(),
  startCs: z.number(),
  endCs: z.number()
});

const soapDraft = z.looseObject({ ...aiDraftBase, draft: noteContent });

const textDraft = z.looseObject({
  ...aiDraftBase,
  usage_type: z.string(),
  text: z.string()
});

const transcriptionDraft = z.looseObject({
  ...aiDraftBase,
  usage_type: z.string(),
  transcript_text: z.string(),
  audio_retention_policy: z.string(),
  segments_json: z.string().nullable()
});

const diarizationDraft = z.looseObject({
  ...aiDraftBase,
  usage_type: z.string(),
  transcript_text: z.string(),
  turns: z.array(diarizedTurn),
  diarized: z.boolean(),
  audio_retention_policy: z.string()
});

const consultationStructuringDraft = z.looseObject({
  ...aiDraftBase,
  usage_type: z.string(),
  segments: z.array(segmentDraft),
  missing: z.array(z.string()),
  warnings: z.array(z.string())
});

const clinicalAidDraft = z.looseObject({
  ...aiDraftBase,
  usage_type: z.string(),
  soap: noteContent,
  template_segments: z.array(segmentDraft),
  possibilities: z.array(
    z.looseObject({
      title: z.string(),
      compatibility: z.string(),
      explanation: z.string(),
      supporting_findings: z.array(z.string()),
      conflicting_findings: z.array(z.string()),
      missing_data: z.array(z.string())
    })
  ),
  exam_suggestions: z.array(z.looseObject({ name: z.string(), reason: z.string() })),
  question_suggestions: z.array(z.looseObject({ question: z.string(), reason: z.string() })),
  studies: z.array(
    z.looseObject({ name: z.string(), reason: z.string(), priority: z.string() })
  ),
  treatments: z.array(
    z.looseObject({
      name: z.string(),
      reason: z.string(),
      precautions: z.array(z.string())
    })
  ),
  prescription_draft: z.string(),
  background_updates: z.array(z.looseObject({ field: z.string(), content: z.string() })),
  medical_history_updates: z.array(
    z.looseObject({
      path: z.string(),
      label: z.string(),
      value: JSON_OPACO,
      source_turns: z.array(z.string()),
      confidence: z.string(),
      warning: z.string()
    })
  ),
  warnings: z.array(z.string())
});

const reviewedTranscription = z.looseObject({
  id: z.string(),
  encounter_id: z.string(),
  run_id: z.string(),
  transcript_text: z.string(),
  turns: z.array(consultationTurn),
  status: z.string(),
  created_at: z.string(),
  reviewed_at: z.string()
});

const aiRun = z.looseObject({
  id: z.string(),
  encounter_id: z.string().nullable(),
  patient_id: z.string().nullable(),
  usage_type: z.string(),
  provider: z.string(),
  model_version: z.string().nullable(),
  prompt_version: z.string(),
  status: z.string(),
  estimated_cost_cents: z.number().nullable(),
  latency_ms: z.number().nullable(),
  feedback: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  created_at: z.string()
});

const usageSummary = z.looseObject({
  month: z.string(),
  budget_cents: z.number(),
  spent_cents: z.number(),
  run_count: z.number(),
  by_usage: z.array(
    z.looseObject({
      usage_type: z.string(),
      run_count: z.number(),
      cost_cents: z.number()
    })
  )
});

const benchmarkRun = z.looseObject({
  id: z.string(),
  name: z.string(),
  case_count: z.number(),
  recommended_provider: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  results: z.array(
    z.looseObject({
      provider: z.string(),
      success_count: z.number(),
      avg_latency_ms: z.number(),
      total_cost_cents: z.number(),
      completeness_pct: z.number()
    })
  )
});

const textModelOption = z.looseObject({
  id: z.string(),
  provider: z.string(),
  model: z.string(),
  label: z.string(),
  is_default: z.boolean()
});

const storedTemplate = z.looseObject({
  id: z.string(),
  name: z.string(),
  clinical_profile: z.string(),
  segments: z.array(
    z.looseObject({
      id: z.string(),
      label: z.string(),
      target: z.string(),
      instructions: z.string(),
      required: z.boolean()
    })
  ),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish()
});

/* ---------- Modelos locales (REFERENCIA publica) ---------- */

/** camelCase por `#[serde(rename_all)]`. */
const modelStatus = z.looseObject({
  modelId: z.string(),
  fileName: z.string(),
  expectedSizeBytes: z.number(),
  downloadedBytes: z.number(),
  present: z.boolean(),
  verified: z.boolean(),
  downloading: z.boolean(),
  error: z.string().nullable()
});

const transcriptionRecommendation = z.looseObject({
  totalRamMb: z.number(),
  cpuCores: z.number(),
  hasGpu: z.boolean(),
  accel: z.string(),
  accelLabel: z.string(),
  modelId: z.string(),
  modelLabel: z.string(),
  modelRamMb: z.number(),
  diskMb: z.number(),
  realtimeCapable: z.boolean(),
  recommendCloudFallback: z.boolean(),
  reason: z.string()
});

/* ---------- Medicamentos (pasos 14 y 25), todo camelCase ---------- */

const safetyReport = z.looseObject({
  normalized: z.array(
    z.looseObject({
      input: z.string(),
      ingredient: z.string().nullable(),
      displayName: z.string().nullable(),
      drugClass: z.string().nullable(),
      recognized: z.boolean()
    })
  ),
  unrecognized: z.array(z.string()),
  interactions: z.array(
    z.looseObject({
      drugA: z.string(),
      drugB: z.string(),
      severity: z.string(),
      description: z.string(),
      source: z.string(),
      sourceVersion: z.string()
    })
  ),
  allergyAlerts: z.array(
    z.looseObject({
      drug: z.string(),
      matchedAllergy: z.string(),
      viaClass: z.string().nullable(),
      source: z.string()
    })
  ),
  duplicateTherapy: z.array(
    z.looseObject({ drugA: z.string(), drugB: z.string(), drugClass: z.string() })
  ),
  tripleInteractions: z.array(
    z.looseObject({
      drugA: z.string(),
      drugB: z.string(),
      drugC: z.string(),
      severity: z.string(),
      description: z.string(),
      source: z.string(),
      sourceVersion: z.string()
    })
  ),
  labelNotes: z.array(
    z.looseObject({
      drugA: z.string(),
      drugB: z.string(),
      text: z.string(),
      source: z.string()
    })
  ),
  referenceVersion: z.string(),
  hasAlerts: z.boolean()
});

const importSummary = z.looseObject({
  medications: z.number(),
  interactions: z.number(),
  labels: z.number(),
  version: z.string()
});

const referenceStatus = z.looseObject({
  version: z.string(),
  medications: z.number(),
  interactions: z.number(),
  labels: z.number()
});

/* ---------- ARCO (paso 12) ---------- */

const arcoRequest = z.looseObject({
  id: z.string(),
  patient_id: z.string(),
  request_type: z.string(),
  status: z.string(),
  notes: z.string().nullable(),
  requested_at: z.string(),
  fulfilled_at: z.string().nullable(),
  result_summary: z.string().nullable()
});

const patientDataExport = z.looseObject({
  patient_id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  birth_date: z.string().nullable(),
  sex: z.string().nullable(),
  allergies: z.string().nullable(),
  medical_background: z.string().nullable(),
  family_background: z.string().nullable(),
  guardian: guardian.nullable(),
  is_minor: z.boolean(),
  rights_exercised_by: z.string().nullable(),
  encounters: z.array(
    z.looseObject({
      id: z.string(),
      appointment_id: z.string().nullable(),
      status: z.string(),
      opened_at: z.string(),
      signed_at: z.string().nullable(),
      notes: z.array(z.unknown()),
      prescriptions: z.array(z.string())
    })
  ),
  documents: z.array(
    z.looseObject({
      id: z.string(),
      file_name: z.string(),
      mime_type: z.string(),
      category: z.string().nullable(),
      size_bytes: z.number(),
      received_at: z.string()
    })
  ),
  medical_history_versions: z.array(medicalHistoryVersion),
  generated_at: z.string()
});

const cancellationResult = z.looseObject({
  patient_id: z.string(),
  deleted_encounters: z.number(),
  deleted_notes: z.number(),
  deleted_prescriptions: z.number(),
  deleted_documents: z.number(),
  deleted_ai_runs: z.number(),
  deleted_ai_consents: z.number(),
  deleted_precheckins: z.number(),
  deleted_medical_history_versions: z.number(),
  anonymized_visits: z.number(),
  anonymized_appointments: z.number()
});

/* ---------- Registro: un contrato por comando ---------- */

export const COMMAND_SCHEMAS: Record<string, z.ZodType> = {
  // Perfiles, sesion y accesos
  list_doctor_profiles: z.array(doctorProfile),
  create_doctor_profile: doctorProfile,
  unlock_database: unlockResult,
  lock_database: SIN_CONTENIDO,
  list_access: z.array(accessEntry),
  grant_access: actor,
  revoke_access: SIN_CONTENIDO,

  // Sincronizacion
  sync_status: syncStatus,
  link_account: SIN_CONTENIDO,
  unlink_device: SIN_CONTENIDO,
  sync_now: syncSummary,
  sync_pending: syncPending,
  publish_authorized_summary: z.string(),

  // Agenda y expediente
  list_appointments: z.array(appointmentRow),
  open_encounter: encounter,
  attend_appointment: attendOutcome,
  resolve_appointment_patient: resolveOutcome,
  get_encounter: encounterDetail,
  list_patients: z.array(patientSummary),
  get_patient_profile: patientProfile,
  find_patient_matches: z.array(patientSummary),
  create_patient: patientRecord,
  open_patient_encounter: encounter,
  list_timeline_events: z.array(timelineEvent),
  add_timeline_event: timelineEvent,
  update_timeline_event: timelineEvent,
  delete_timeline_event: SIN_CONTENIDO,
  save_note: z.number(),
  save_prescription: SIN_CONTENIDO,
  update_patient_background: SIN_CONTENIDO,
  get_patient_medical_history: medicalHistoryVersion.nullable(),
  save_patient_medical_history: medicalHistoryVersion,
  sign_encounter: encounter,
  verify_signature: z.boolean(),

  // Operacion presencial y caja
  list_resources: z.array(resource),
  create_resource: resource,
  set_resource_active: SIN_CONTENIDO,
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
  patient_credit: z.number(),
  apply_patient_credit: z.number(),
  build_receipt: receipt,
  get_clinic_settings: clinicSettings,
  save_clinic_settings: SIN_CONTENIDO,
  request_refund: refundRequest,
  decide_refund_request: refundRequest,
  emit_authorized_refund: payment,
  list_pending_refund_requests: z.array(refundRequest),
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

  // IA gobernada y transcripcion
  ai_consent_status: z.boolean(),
  ai_grant_consent: SIN_CONTENIDO,
  ai_revoke_consent: SIN_CONTENIDO,
  ai_voice_consent_status: z.boolean(),
  ai_grant_voice_consent: SIN_CONTENIDO,
  ai_revoke_voice_consent: SIN_CONTENIDO,
  ai_scribe_consent_status: z.boolean(),
  ai_grant_scribe_consent: SIN_CONTENIDO,
  ai_revoke_scribe_consent: SIN_CONTENIDO,
  ai_assist_soap: soapDraft,
  ai_assist_text: textDraft,
  ai_transcribe_audio: transcriptionDraft,
  ai_save_reviewed_transcription: reviewedTranscription,
  ai_latest_reviewed_transcription: reviewedTranscription.nullable(),
  ai_discard_reviewed_transcription: SIN_CONTENIDO,
  ai_diarize_consultation: diarizationDraft,
  ai_structure_consultation: consultationStructuringDraft,
  ai_generate_clinical_aid: clinicalAidDraft,
  ai_list_text_models: z.array(textModelOption),
  list_consultation_templates: z.array(storedTemplate),
  save_consultation_template: storedTemplate,
  delete_consultation_template: SIN_CONTENIDO,
  ai_review_run: aiRun,
  ai_list_runs: z.array(aiRun),
  ai_usage_summary: usageSummary,
  ai_set_budget: SIN_CONTENIDO,
  ai_run_benchmark: benchmarkRun,
  ai_list_benchmarks: z.array(benchmarkRun),

  // Modelos locales
  transcription_recommendation: transcriptionRecommendation,
  transcription_model_status: z.array(modelStatus),
  download_transcription_model: SIN_CONTENIDO,
  diarization_model_status: z.array(modelStatus),
  download_diarization_model: SIN_CONTENIDO,

  // Medicamentos
  check_medication_safety: safetyReport,
  medication_reference_status: referenceStatus,
  import_medication_reference: importSummary,
  update_medication_reference: importSummary,
  update_medication_reference_from_midoc: importSummary,
  extract_prescription_medications: z.array(z.string()),

  // ARCO
  arco_list_requests: z.array(arcoRequest),
  arco_record_request: arcoRequest,
  arco_mark_fulfilled: arcoRequest,
  arco_export_patient_data: patientDataExport,
  arco_fulfill_cancellation: cancellationResult
};

/**
 * Resume por que fallo la validacion **sin copiar el valor recibido**: solo la
 * ruta del campo y el tipo de problema. Un mensaje de error nunca puede
 * arrastrar contenido clinico (REGLAS_DESARROLLO.md §4.2), y los errores de
 * Zod se muestran en pantalla.
 */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(raiz)";
      return `${path}: ${issue.code}`;
    })
    .join("; ");
}

/**
 * Valida la respuesta de un comando contra su contrato. Un comando sin contrato
 * declarado se rechaza: la tabla es exhaustiva por decision, igual que la
 * compuerta de permisos del backend.
 */
export function parseIpcResponse<T>(command: string, raw: unknown): T {
  const schema = COMMAND_SCHEMAS[command];
  if (!schema) {
    throw new Error(
      `El comando "${command}" no declara el contrato de su respuesta en ipcSchemas.ts.`
    );
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `La respuesta de "${command}" no tiene la forma esperada (${describeIssues(result.error)}).`
    );
  }
  return result.data as T;
}
