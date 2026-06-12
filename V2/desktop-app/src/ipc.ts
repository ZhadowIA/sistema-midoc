import { invoke } from "@tauri-apps/api/core";

/**
 * Capa unica de IPC. Dentro de Tauri delega en `invoke`; en un navegador
 * (vite dev sin shell nativo) sirve datos de demostracion en memoria para
 * poder trabajar el diseño de las pantallas sin la app nativa.
 */

const isTauri = "__TAURI_INTERNALS__" in window;

export function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    return invoke<T>(command, args);
  }
  return mockCall<T>(command, args);
}

/* ---------- Mock de navegador (solo diseño/desarrollo) ---------- */

interface MockNote {
  version: number;
  created_at: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnosis: string;
  instructions: string;
  specialty: unknown;
}

const mockState = {
  linked: true,
  clinicalProfile: "ODONTOLOGY",
  aiConsent: false,
  aiVoiceConsent: false,
  aiRunSeq: 0,
  aiBudgetCents: 0,
  aiRuns: [] as Array<{ id: string; usage_type: string; cost_cents: number; status: string; reported: boolean }>,
  benchmarks: [] as Array<Record<string, unknown>>,
  appointments: [
    {
      id: "appt-1",
      status: "CONFIRMED",
      scheduled_start: new Date(Date.now() + 3 * 3600_000).toISOString(),
      scheduled_end: new Date(Date.now() + 3.5 * 3600_000).toISOString(),
      service_name: "Valoracion dental",
      reason: "Dolor en molar superior derecho",
      patient_name: "Hugo Paz Olivares",
      patient_phone: "614 000 1111",
      has_precheckin: true
    },
    {
      id: "appt-2",
      status: "PENDING",
      scheduled_start: new Date(Date.now() + 26 * 3600_000).toISOString(),
      scheduled_end: new Date(Date.now() + 26.5 * 3600_000).toISOString(),
      service_name: "Seguimiento",
      reason: null,
      patient_name: "Maria Elena Duarte",
      patient_phone: "614 000 2222",
      has_precheckin: false
    },
    {
      id: "appt-3",
      status: "CANCELLED",
      scheduled_start: new Date(Date.now() + 50 * 3600_000).toISOString(),
      scheduled_end: new Date(Date.now() + 50.5 * 3600_000).toISOString(),
      service_name: "Consulta general",
      reason: "Revision de estudios",
      patient_name: "Jorge Luna",
      patient_phone: null,
      has_precheckin: false
    }
  ],
  encounter: {
    id: "enc-1",
    status: "OPEN" as "OPEN" | "SIGNED",
    signed_at: null as string | null,
    signed_hash: null as string | null,
    notes: [] as MockNote[],
    prescription: null as string | null,
    patient: {
      id: "pat-1",
      first_name: "Hugo",
      last_name: "Paz Olivares",
      phone: "614 000 1111",
      email: null,
      birth_date: "1981-03-02",
      allergies: "Penicilina",
      medical_background: "Hipertension en tratamiento (losartan).",
      family_background: "Padre con DM2."
    }
  }
};

function mockDetail() {
  const e = mockState.encounter;
  return {
    encounter: {
      id: e.id,
      status: e.status,
      opened_at: new Date().toISOString(),
      signed_at: e.signed_at,
      signed_hash: e.signed_hash
    },
    patient: e.patient,
    appointment_reason: "Dolor en molar superior derecho",
    appointment_start: mockState.appointments[0].scheduled_start,
    precheckin: JSON.stringify({
      motivo: "Dolor al masticar y sensibilidad al frio",
      antecedentes: "Bruxismo nocturno",
      sintomas: "Molestia 6/10, sin fiebre"
    }),
    note: e.notes.length > 0 ? e.notes[e.notes.length - 1] : null,
    note_version_count: e.notes.length,
    prescription: e.prescription,
    history: [
      {
        encounter_id: "enc-0",
        signed_at: new Date(Date.now() - 40 * 86400_000).toISOString(),
        status: "SIGNED",
        diagnosis: "Gastritis aguda"
      }
    ]
  };
}

interface MockVisit {
  id: string;
  appointment_id: string | null;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string | null;
  reason: string | null;
  service_name: string | null;
  state: string;
  priority: number;
  resource_id: string | null;
  resource_name: string | null;
  encounter_id: string | null;
  arrived_at: string;
  started_at: string | null;
  ended_at: string | null;
}

const ops = {
  resources: [{ id: "res-1", name: "Consultorio 1", kind: "ROOM", active: true }],
  visits: [] as MockVisit[],
  session: null as
    | { id: string; opened_at: string; opening_float_cents: number; closed_at: string | null; closing_counted_cents: number | null; notes: string | null }
    | null,
  payments: [] as Array<{
    id: string;
    cash_session_id: string;
    visit_id: string | null;
    patient_id: string | null;
    amount_cents: number;
    method: string;
    kind: string;
    concept: string | null;
    receipt_number: string;
    created_at: string;
  }>,
  receiptSeq: 0
};

function opsSummary() {
  const session = ops.session!;
  const signed = (p: { amount_cents: number; kind: string }) =>
    p.kind === "REFUND" ? -p.amount_cents : p.amount_cents;
  const byMethodMap = new Map<string, number>();
  for (const p of ops.payments) {
    byMethodMap.set(p.method, (byMethodMap.get(p.method) ?? 0) + signed(p));
  }
  const net = ops.payments.reduce((sum, p) => sum + signed(p), 0);
  const cashNet = ops.payments
    .filter((p) => p.method === "CASH")
    .reduce((sum, p) => sum + signed(p), 0);
  return {
    session,
    payment_count: ops.payments.length,
    net_total_cents: net,
    by_method: [...byMethodMap.entries()].map(([method, total_cents]) => ({ method, total_cents })),
    expected_cash_cents: session.opening_float_cents + cashNet
  };
}

async function mockCall<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 120));
  const e = mockState.encounter;

  switch (command) {
    case "list_resources":
      return ops.resources as T;
    case "create_resource": {
      const input = args?.resource as { name: string; kind: string };
      const resource = { id: `res-${ops.resources.length + 1}`, name: input.name, kind: input.kind, active: true };
      ops.resources.push(resource);
      return resource as T;
    }
    case "set_resource_active": {
      const r = ops.resources.find((x) => x.id === args?.resourceId);
      if (r) r.active = Boolean(args?.active);
      return undefined as T;
    }
    case "list_active_visits":
      return ops.visits.filter((v) => v.state === "WAITING" || v.state === "IN_PROGRESS") as T;
    case "check_in_appointment": {
      const appt = mockState.appointments.find((a) => a.id === args?.appointmentId);
      const visit: MockVisit = {
        id: `visit-${ops.visits.length + 1}`,
        appointment_id: String(args?.appointmentId),
        patient_id: "pat-1",
        patient_name: appt?.patient_name ?? "Paciente",
        patient_phone: appt?.patient_phone ?? null,
        reason: appt?.reason ?? null,
        service_name: appt?.service_name ?? null,
        state: "WAITING",
        priority: 0,
        resource_id: null,
        resource_name: null,
        encounter_id: null,
        arrived_at: new Date().toISOString(),
        started_at: null,
        ended_at: null
      };
      ops.visits.push(visit);
      return visit as T;
    }
    case "register_walk_in": {
      const input = args?.walkIn as { patient_name: string; patient_phone: string | null; reason: string | null };
      const visit: MockVisit = {
        id: `visit-${ops.visits.length + 1}`,
        appointment_id: null,
        patient_id: `pat-walkin-${ops.visits.length + 1}`,
        patient_name: input.patient_name,
        patient_phone: input.patient_phone,
        reason: input.reason,
        service_name: null,
        state: "WAITING",
        priority: 0,
        resource_id: null,
        resource_name: null,
        encounter_id: null,
        arrived_at: new Date().toISOString(),
        started_at: null,
        ended_at: null
      };
      ops.visits.push(visit);
      return visit as T;
    }
    case "set_visit_state": {
      const v = ops.visits.find((x) => x.id === args?.visitId);
      if (v) v.state = String(args?.visitState);
      return v as T;
    }
    case "assign_resource": {
      const v = ops.visits.find((x) => x.id === args?.visitId);
      const r = ops.resources.find((x) => x.id === args?.resourceId);
      if (v) {
        v.resource_id = r?.id ?? null;
        v.resource_name = r?.name ?? null;
      }
      return v as T;
    }
    case "start_visit_encounter": {
      const v = ops.visits.find((x) => x.id === args?.visitId);
      if (v) {
        v.state = "IN_PROGRESS";
        v.encounter_id = e.id;
      }
      return e.id as T;
    }
    case "get_open_cash_session":
      return ops.session as T;
    case "open_cash_session":
      ops.session = {
        id: "cash-1",
        opened_at: new Date().toISOString(),
        opening_float_cents: Number(args?.openingFloatCents ?? 0),
        closed_at: null,
        closing_counted_cents: null,
        notes: null
      };
      ops.payments = [];
      return ops.session as T;
    case "cash_summary":
      return opsSummary() as T;
    case "close_cash_session": {
      const summary = opsSummary();
      ops.session!.closed_at = new Date().toISOString();
      ops.session!.closing_counted_cents = Number(args?.countedCashCents ?? 0);
      const result = { ...summary, session: ops.session! };
      ops.session = null;
      return result as T;
    }
    case "register_payment": {
      if (!ops.session) throw "no hay una caja abierta; abre la caja del dia antes de cobrar";
      const input = args?.payment as {
        visit_id: string | null;
        patient_id: string | null;
        amount_cents: number;
        method: string;
        kind: string;
        concept: string | null;
      };
      ops.receiptSeq += 1;
      const payment = {
        id: `pay-${ops.receiptSeq}`,
        cash_session_id: ops.session.id,
        visit_id: input.visit_id,
        patient_id: input.patient_id,
        amount_cents: input.amount_cents,
        method: input.method,
        kind: input.kind,
        concept: input.concept,
        receipt_number: `R-${String(ops.receiptSeq).padStart(6, "0")}`,
        created_at: new Date().toISOString()
      };
      ops.payments.push(payment);
      return payment as T;
    }
    case "list_session_payments":
      return [...ops.payments].reverse() as T;
  }

  switch (command) {
    case "unlock_database":
      if (String(args?.passphrase ?? "").length < 8) {
        throw "la frase de seguridad debe tener al menos 8 caracteres";
      }
      return {
        schema_version: 3,
        db_path: "C:\\…\\midoc.db (demo)",
        backup_path: "C:\\…\\backups\\midoc-demo.db"
      } as T;
    case "lock_database":
      return undefined as T;
    case "sync_status":
      return {
        linked: mockState.linked,
        server_url: "http://localhost:3000",
        cursor: 7,
        clinical_profile: mockState.clinicalProfile
      } as T;
    case "link_account":
      mockState.linked = true;
      return undefined as T;
    case "sync_now": {
      const pendingAiReports = mockState.aiRuns.filter((run) => !run.reported).length;
      mockState.aiRuns = mockState.aiRuns.map((run) => ({ ...run, reported: true }));
      return { applied_events: 0, cursor: 7, ai_usage_reported: pendingAiReports } as T;
    }
    case "list_appointments":
      return mockState.appointments as T;
    case "open_encounter":
      return { id: e.id } as T;
    case "get_encounter":
      return mockDetail() as T;
    case "save_note": {
      if (e.status === "SIGNED") throw "la nota ya fue firmada y no puede modificarse";
      const note = args?.note as Omit<MockNote, "version" | "created_at">;
      e.notes.push({ ...note, version: e.notes.length + 1, created_at: new Date().toISOString() });
      return e.notes.length as T;
    }
    case "save_prescription":
      if (e.status === "SIGNED") throw "la nota ya fue firmada y no puede modificarse";
      e.prescription = String(args?.content ?? "");
      return undefined as T;
    case "update_patient_background": {
      const background = args?.background as Partial<typeof e.patient>;
      Object.assign(e.patient, background);
      return undefined as T;
    }
    case "sign_encounter":
      if (e.notes.length === 0) throw "no se puede firmar un encuentro sin nota";
      e.status = "SIGNED";
      e.signed_at = new Date().toISOString();
      e.signed_hash = "d41d8cd98f00b204e9800998ecf8427e1a2b3c4d5e6f7a8b";
      return mockDetail().encounter as T;
    case "verify_signature":
      return true as T;
    case "ai_consent_status":
      return mockState.aiConsent as T;
    case "ai_grant_consent":
      mockState.aiConsent = true;
      return undefined as T;
    case "ai_revoke_consent":
      mockState.aiConsent = false;
      return undefined as T;
    case "ai_voice_consent_status":
      return mockState.aiVoiceConsent as T;
    case "ai_grant_voice_consent":
      mockState.aiVoiceConsent = true;
      return undefined as T;
    case "ai_revoke_voice_consent":
      mockState.aiVoiceConsent = false;
      return undefined as T;
    case "ai_assist_soap": {
      if (!mockState.aiConsent) throw "falta el consentimiento del paciente para asistencia de IA";
      const spent = mockState.aiRuns.reduce((s, r) => s + r.cost_cents, 0);
      if (mockState.aiBudgetCents > 0 && spent >= mockState.aiBudgetCents) {
        throw "se alcanzo el presupuesto mensual de IA; ajustalo para continuar";
      }
      mockState.aiRunSeq += 1;
      const runId = `ai-run-${mockState.aiRunSeq}`;
      mockState.aiRuns.push({
        id: runId,
        usage_type: "SOAP_ASSIST",
        cost_cents: 1,
        status: "DRAFT",
        reported: false
      });
      const context = "Motivo de consulta: Dolor en molar superior derecho";
      return {
        run_id: runId,
        provider: "fake-clinico",
        model_version: "fake-1",
        estimated_cost_cents: 1,
        latency_ms: 2,
        draft: {
          subjective: `Borrador IA a partir del contexto disponible:\n${context}`,
          objective: "Exploracion fisica: (a completar por el medico).",
          assessment: "Impresion diagnostica: (a confirmar por el medico).",
          plan: "Plan sugerido: (revisar y ajustar).",
          diagnosis: "",
          instructions: "Indicaciones al paciente: (a definir por el medico).",
          specialty: null
        }
      } as T;
    }
    case "ai_assist_text": {
      if (!mockState.aiConsent) throw "falta el consentimiento del paciente para asistencia de IA";
      const spentText = mockState.aiRuns.reduce((s, r) => s + r.cost_cents, 0);
      if (mockState.aiBudgetCents > 0 && spentText >= mockState.aiBudgetCents) {
        throw "se alcanzo el presupuesto mensual de IA; ajustalo para continuar";
      }
      mockState.aiRunSeq += 1;
      const usageType = String(args?.usageType ?? "");
      const textRunId = `ai-run-${mockState.aiRunSeq}`;
      mockState.aiRuns.push({
        id: textRunId,
        usage_type: usageType,
        cost_cents: 1,
        status: "DRAFT",
        reported: false
      });
      const context = "Motivo de consulta: Dolor en molar superior derecho";
      const text =
        usageType === "LONGITUDINAL_SUMMARY"
          ? `Resumen longitudinal (borrador):\nCon base en el expediente disponible:\n${context}\n\n(Revisar fidelidad antes de compartir.)`
          : usageType === "PATIENT_INSTRUCTIONS"
            ? `Indicaciones para el paciente (borrador):\n- Sigue el plan acordado en consulta.\n- Acude a tu proxima cita.\n\n(Ajustar a lenguaje del paciente y confirmar.)`
            : `Posibles brechas clinicas a revisar (borrador):\n- Verifica antecedentes y alergias.\n- Confirma seguimiento de diagnosticos previos.\n\n(Estas son sugerencias; el criterio es del medico.)`;
      return {
        run_id: textRunId,
        usage_type: usageType,
        provider: "fake-clinico",
        model_version: "fake-1",
        estimated_cost_cents: 1,
        latency_ms: 2,
        text
      } as T;
    }
    case "ai_transcribe_audio": {
      if (!mockState.aiVoiceConsent) {
        throw "falta el consentimiento del paciente para asistencia de IA";
      }
      const spentVoice = mockState.aiRuns.reduce((s, r) => s + r.cost_cents, 0);
      if (mockState.aiBudgetCents > 0 && spentVoice >= mockState.aiBudgetCents) {
        throw "se alcanzo el presupuesto mensual de IA; ajustalo para continuar";
      }
      mockState.aiRunSeq += 1;
      const voiceRunId = `ai-run-${mockState.aiRunSeq}`;
      mockState.aiRuns.push({
        id: voiceRunId,
        usage_type: "TRANSCRIPTION",
        cost_cents: 1,
        status: "DRAFT",
        reported: false
      });
      const audio = args?.audio as { mediaType?: string; fileName?: string } | undefined;
      return {
        run_id: voiceRunId,
        usage_type: "TRANSCRIPTION",
        provider: "fake-transcriptor",
        model_version: "fake-transcription-1",
        estimated_cost_cents: 1,
        latency_ms: 2,
        transcript_text: `Transcripcion (borrador): audio ${audio?.mediaType ?? "audio/webm"}${audio?.fileName ? ` · ${audio.fileName}` : ""}. Revise terminos clinicos, medicamentos, dosis y hablantes antes de usarla.`,
        audio_retention_policy: "discarded_after_transcription"
      } as T;
    }
    case "ai_review_run": {
      const run = mockState.aiRuns.find((item) => item.id === args?.runId);
      if (run) {
        run.status = String(args?.status ?? run.status);
        run.reported = false;
      }
      return { id: String(args?.runId), status: String(args?.status) } as T;
    }
    case "ai_list_runs":
      return [] as T;
    case "ai_set_budget":
      mockState.aiBudgetCents = Number(args?.budgetCents ?? 0);
      return undefined as T;
    case "ai_run_benchmark": {
      const run = {
        id: `bench-${mockState.benchmarks.length + 1}`,
        name: String(args?.name ?? "Comparativa"),
        case_count: 6,
        recommended_provider: "openai-fake",
        notes:
          "Recomendado por mayor exito/completitud y menor costo: 6 exitos, 100% completitud, 6 centavos, 0 ms promedio.",
        created_at: new Date().toISOString(),
        results: [
          { provider: "openai-fake", success_count: 6, avg_latency_ms: 0, total_cost_cents: 6, completeness_pct: 100 },
          { provider: "medlm-fake", success_count: 6, avg_latency_ms: 0, total_cost_cents: 18, completeness_pct: 100 }
        ]
      };
      mockState.benchmarks.unshift(run);
      return run as T;
    }
    case "ai_list_benchmarks":
      return mockState.benchmarks as T;
    case "ai_usage_summary": {
      const byMap = new Map<string, { run_count: number; cost_cents: number }>();
      for (const r of mockState.aiRuns) {
        const cur = byMap.get(r.usage_type) ?? { run_count: 0, cost_cents: 0 };
        cur.run_count += 1;
        cur.cost_cents += r.cost_cents;
        byMap.set(r.usage_type, cur);
      }
      return {
        month: new Date().toISOString().slice(0, 7),
        budget_cents: mockState.aiBudgetCents,
        spent_cents: mockState.aiRuns.reduce((s, r) => s + r.cost_cents, 0),
        run_count: mockState.aiRuns.length,
        by_usage: [...byMap.entries()].map(([usage_type, v]) => ({ usage_type, ...v }))
      } as T;
    }
    default:
      throw new Error(`mock sin comando: ${command}`);
  }
}
