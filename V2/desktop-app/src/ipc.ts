import { invoke } from "@tauri-apps/api/core";

/**
 * Capa unica de IPC. Dentro de Tauri delega en `invoke`; en un navegador
 * (vite dev sin shell nativo) sirve datos de demostracion en memoria para
 * poder trabajar el diseño de las pantallas sin la app nativa.
 */

const isTauri = "__TAURI_INTERNALS__" in window;

// Fecha de esta semana (offset de dias desde hoy) a una hora HH:MM local, para
// que las citas de demostracion caigan dentro del horario laboral simulado.
function slotDate(dayOffset: number, hh: number, mm: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

export function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    return invoke<T>(command, args).catch((error: unknown) => {
      throw formatIpcError(command, error);
    });
  }
  return mockCall<T>(command, args);
}

function formatIpcError(command: string, error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error);
  if (/command .* not found/i.test(raw) || raw.includes(`Command ${command} not found`)) {
    return new Error(
      `El proceso nativo de MiDoc no tiene registrado el comando "${command}". Reinicia la app de escritorio para cargar el backend actualizado.`
    );
  }
  return error instanceof Error ? error : new Error(raw);
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

// Tamanos reales (bytes) de los pesos cuantizados Q5 (Content-Length verificado).
const MOCK_MODEL_SIZES: Record<string, number> = {
  small: 190_085_487,
  medium: 539_212_467,
  "large-v3-turbo": 574_041_195,
  "large-v3": 1_081_140_203,
  // Modelo VAD (saltar silencios): pequeno, ~865 KB.
  "vad-silero": 885_098
};

// Nombre de archivo Q5 por modelo, para que el mock espeje el backend real.
const MOCK_MODEL_FILES: Record<string, string> = {
  small: "ggml-small-q5_1.bin",
  medium: "ggml-medium-q5_0.bin",
  "large-v3-turbo": "ggml-large-v3-turbo-q5_0.bin",
  "large-v3": "ggml-large-v3-q5_0.bin",
  "vad-silero": "ggml-silero-v5.1.2.bin"
};

// Tamanos reales (bytes) de los dos modelos ONNX de diarizacion, para el avance
// simulado de la descarga en navegador.
const MOCK_DIARIZATION_SIZES: Record<string, number> = {
  "diarization-segmentation": 5_992_913,
  "diarization-embedding": 29_292_684
};

const mockState = {
  profiles: [
    {
      id: "default",
      display_name: "Medico principal",
      created_at: new Date().toISOString(),
      last_used_at: null as string | null
    }
  ],
  // Descarga de modelos Whisper simulada: el estado avanza en cada sondeo.
  transcriptionModels: {} as Record<
    string,
    { downloaded: number; total: number; present: boolean; downloading: boolean; error: string | null }
  >,
  // Descarga simulada de los modelos de diarizacion (mismo patron que Whisper).
  diarizationModels: {} as Record<
    string,
    { downloaded: number; total: number; present: boolean; downloading: boolean; error: string | null }
  >,
  linked: true,
  clinicalProfile: "ODONTOLOGY",
  slotMinutes: 30,
  aiConsent: false,
  aiVoiceConsent: false,
  aiScribeConsent: false,
  aiRunSeq: 0,
  aiBudgetCents: 0,
  aiRuns: [] as Array<{ id: string; usage_type: string; cost_cents: number; status: string; reported: boolean }>,
  consultationTemplates: [] as Array<Record<string, unknown>>,
  reviewedTranscriptions: {} as Record<string, Record<string, unknown>>,
  medicationRef: { version: "seed-v1", medications: 27, interactions: 15, labels: 0 },
  benchmarks: [] as Array<Record<string, unknown>>,
  arcoRequests: [] as Array<Record<string, unknown>>,
  timelineSeq: 0,
  timeline: [
    {
      id: "tl-1",
      patient_id: "pat-1",
      event_date: "2024-02-10",
      category: "DIAGNOSIS",
      title: "Hipertension arterial",
      detail: "Inicio de losartan 50mg.",
      created_at: new Date(Date.now() - 200 * 86400_000).toISOString(),
      updated_at: new Date(Date.now() - 200 * 86400_000).toISOString()
    },
    {
      id: "tl-2",
      patient_id: "pat-1",
      event_date: "2025-09-01",
      category: "LAB",
      title: "Perfil lipidico",
      detail: "Colesterol total 210 mg/dL.",
      created_at: new Date(Date.now() - 30 * 86400_000).toISOString(),
      updated_at: new Date(Date.now() - 30 * 86400_000).toISOString()
    }
  ] as Array<{
    id: string;
    patient_id: string;
    event_date: string;
    category: string;
    title: string;
    detail: string | null;
    created_at: string;
    updated_at: string;
  }>,
  appointments: [
    {
      id: "appt-1",
      status: "CONFIRMED",
      scheduled_start: slotDate(0, 10, 30),
      scheduled_end: slotDate(0, 11, 0),
      service_name: "Valoracion dental",
      reason: "Dolor en molar superior derecho",
      patient_name: "Hugo Paz Olivares",
      patient_phone: "614 000 1111",
      has_precheckin: true
    },
    {
      id: "appt-2",
      status: "PENDING",
      scheduled_start: slotDate(0, 11, 30),
      scheduled_end: slotDate(0, 12, 0),
      service_name: "Seguimiento",
      reason: null,
      patient_name: "Maria Elena Duarte",
      patient_phone: "614 000 2222",
      has_precheckin: false
    },
    {
      id: "appt-3",
      status: "CANCELLED",
      scheduled_start: slotDate(0, 12, 30),
      scheduled_end: slotDate(0, 13, 0),
      service_name: "Consulta general",
      reason: "Revision de estudios",
      patient_name: "Jorge Luna",
      patient_phone: null,
      has_precheckin: false
    }
  ],
  patients: [
    {
      id: "pat-1",
      first_name: "Hugo",
      last_name: "Paz Olivares",
      phone: "614 000 1111" as string | null,
      email: null as string | null,
      birth_date: "1981-03-02" as string | null,
      allergies: "Penicilina" as string | null,
      medical_background: "Hipertension en tratamiento (losartan)." as string | null,
      family_background: "Padre con DM2." as string | null
    },
    {
      id: "pat-2",
      first_name: "Maria Elena",
      last_name: "Duarte",
      phone: "614 000 2222",
      email: "maria.duarte@example.com" as string | null,
      birth_date: "1990-11-20",
      allergies: null as string | null,
      medical_background: null as string | null,
      family_background: null as string | null
    }
  ],
  encounter: {
    id: "enc-1",
    appointment_id: "appt-1" as string | null,
    status: "OPEN" as "OPEN" | "SIGNED",
    signed_at: null as string | null,
    signed_hash: null as string | null,
    notes: [] as MockNote[],
    prescription: null as string | null,
    patient: {
      id: "pat-1",
      first_name: "Hugo",
      last_name: "Paz Olivares",
      phone: "614 000 1111" as string | null,
      email: null as string | null,
      birth_date: "1981-03-02" as string | null,
      allergies: "Penicilina" as string | null,
      medical_background: "Hipertension en tratamiento (losartan)." as string | null,
      family_background: "Padre con DM2." as string | null
    }
  },
  medicalHistoryVersions: [] as Array<{
    id: string;
    patient_id: string;
    version: number;
    payload_json: string;
    source: string;
    encounter_id: string | null;
    source_appointment_id: string | null;
    reconciled_source_hash: string | null;
    created_at: string;
  }>
};

function mockDetail() {
  const e = mockState.encounter;
  const appointment = mockState.appointments.find((item) => item.id === e.appointment_id) ?? null;
  return {
    encounter: {
      id: e.id,
      appointment_id: e.appointment_id,
      status: e.status,
      opened_at: new Date().toISOString(),
      signed_at: e.signed_at,
      signed_hash: e.signed_hash
    },
    patient: e.patient,
    appointment_reason: appointment?.reason ?? null,
    appointment_start: appointment?.scheduled_start ?? null,
    medical_history: appointment?.has_precheckin
      ? JSON.stringify({
          sex: "F",
          allergies: "Penicilina",
          pathological: { diabetico: "si", diabeticoDesde: "2018" }
        })
      : null,
    preconsulta: appointment?.has_precheckin
      ? JSON.stringify({
          motivo: "Dolor al masticar y sensibilidad al frio",
          conversation: [
            { question: "Desde cuando?", answer: "Hace una semana" },
            { question: "Tiene fiebre?", answer: "No" }
          ]
        })
      : null,
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

function activateMockEncounter(appointmentId: string, patientId: string) {
  const patient = mockState.patients.find((item) => item.id === patientId);
  if (!patient) throw "paciente no encontrado";
  mockState.encounter.id = `enc-${appointmentId}`;
  mockState.encounter.appointment_id = appointmentId;
  mockState.encounter.status = "OPEN";
  mockState.encounter.signed_at = null;
  mockState.encounter.signed_hash = null;
  mockState.encounter.notes = [];
  mockState.encounter.prescription = null;
  mockState.encounter.patient = { ...patient };
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
    budget_id: string | null;
    receipt_number: string;
    created_at: string;
  }>,
  receiptSeq: 0,
  // Ajustes del recibo (paso 27). El nivel arranca en detallado porque el mock
  // simula un consultorio dental.
  clinic: {
    name: "Consultorio Dental Ruiz" as string | null,
    address: "Av. Universidad 1203, Chihuahua" as string | null,
    phone: "614 413 2200" as string | null,
    license: "CED-4471902" as string | null,
    receipt_detail: "DETAILED"
  },
  // Presupuestos dentales (paso 26). El libro de abonos es acumulado y NO se
  // limpia al reabrir caja, igual que la tabla payments real.
  dentalBudgets: [] as Array<{
    id: string;
    patient_id: string;
    encounter_id: string | null;
    label: string;
    status: string;
    discount_cents: number;
    notes: string | null;
    alternative_group: string | null;
    created_at: string;
    decided_at: string | null;
    items: Array<{
      id: string;
      budget_id: string;
      tooth_id: string;
      procedure: string;
      price_cents: number;
      status: string;
      completed_at: string | null;
    }>;
  }>,
  budgetLedger: [] as Array<{ budget_id: string; amount_cents: number; kind: string }>,
  budgetSeq: 0,
  // Ordenes de laboratorio dental (paso 26 rebanada 4).
  labOrders: [] as Array<{
    id: string;
    patient_id: string;
    encounter_id: string | null;
    tooth_id: string;
    work_type: string;
    lab_name: string;
    status: string;
    promised_at: string | null;
    sent_at: string | null;
    received_at: string | null;
    delivered_at: string | null;
    cost_cents: number;
    notes: string | null;
    created_at: string;
  }>,
  labSeq: 0
};

// Espejo de las transiciones validas del motor (dental.rs).
const LAB_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["SENT", "CANCELLED"],
  SENT: ["RECEIVED", "CANCELLED"],
  RECEIVED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: []
};

function budgetPaidCents(budgetId: string): number {
  return ops.budgetLedger
    .filter((entry) => entry.budget_id === budgetId)
    .reduce(
      (sum, entry) => sum + (entry.kind === "REFUND" ? -entry.amount_cents : entry.amount_cents),
      0
    );
}

function budgetWithTotals(budget: (typeof ops.dentalBudgets)[number]) {
  const gross = budget.items.reduce((sum, item) => sum + item.price_cents, 0);
  const total = gross - budget.discount_cents;
  const paid = budgetPaidCents(budget.id);
  return { ...budget, total_cents: total, paid_cents: paid, balance_cents: total - paid };
}

function requireBudget(budgetId: string) {
  const budget = ops.dentalBudgets.find((entry) => entry.id === budgetId);
  if (!budget) throw "presupuesto no encontrado";
  return budget;
}

// Espejo de dental::validate_budget_payment del motor.
function validateBudgetPayment(budgetId: string, kind: string, amountCents: number) {
  const budget = budgetWithTotals(requireBudget(budgetId));
  if (budget.status !== "ACCEPTED") throw "solo se abona a un presupuesto aceptado";
  if (kind === "REFUND") {
    if (amountCents > budget.paid_cents) throw "el reembolso excede lo abonado al presupuesto";
  } else if (amountCents > budget.balance_cents) {
    throw "el abono excede el saldo del presupuesto";
  }
}

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

const digitsOnly = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

function splitNameMock(fullName: string): { first_name: string; last_name: string } {
  const trimmed = (fullName ?? "").trim();
  const space = trimmed.indexOf(" ");
  return space === -1
    ? { first_name: trimmed, last_name: "" }
    : { first_name: trimmed.slice(0, space), last_name: trimmed.slice(space + 1) };
}

// Coincidencias para el diseño en navegador: por nombre completo o telefono,
// con el nombre primero (espeja `match_patients_with_reasons` del backend).
function matchPatientsMock(fullName: string | null | undefined, phone: string | null | undefined) {
  const aName = (fullName ?? "").trim().toLowerCase();
  const aPhone = digitsOnly(phone);
  return mockState.patients
    .map((p) => {
      const pName = `${p.first_name} ${p.last_name}`.trim().toLowerCase();
      const matched_name = Boolean(aName) && pName === aName;
      const matched_phone = Boolean(aPhone) && digitsOnly(p.phone) === aPhone;
      return { p, matched_name, matched_phone };
    })
    .filter((m) => m.matched_name || m.matched_phone)
    .sort((a, b) => Number(b.matched_name) - Number(a.matched_name))
    .map(({ p, matched_name, matched_phone }) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      phone: p.phone,
      email: p.email,
      encounter_count: p.id === "pat-1" ? 1 : 0,
      last_visit: null,
      matched_name,
      matched_phone,
      matched_email: false
    }));
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
      if (!args?.linkPatientId && !args?.forceNew) {
        const candidates = matchPatientsMock(input.patient_name, input.patient_phone);
        if (candidates.length > 0) {
          return { kind: "needs_resolution", candidates } as T;
        }
      }
      const visit: MockVisit = {
        id: `visit-${ops.visits.length + 1}`,
        appointment_id: null,
        patient_id: args?.linkPatientId
          ? String(args.linkPatientId)
          : `pat-walkin-${ops.visits.length + 1}`,
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
      return { kind: "visit", visit } as T;
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
      if (args?.linkPatientId || args?.forceNew || !v?.appointment_id) {
        if (v) {
          v.state = "IN_PROGRESS";
          v.encounter_id = e.id;
          if (args?.linkPatientId) v.patient_id = String(args.linkPatientId);
        }
        return { kind: "encounter", encounter_id: e.id } as T;
      }
      const candidates = matchPatientsMock(v.patient_name, v.patient_phone);
      if (candidates.length === 0) {
        v.state = "IN_PROGRESS";
        v.encounter_id = e.id;
        return { kind: "encounter", encounter_id: e.id } as T;
      }
      return {
        kind: "needs_resolution",
        appointment_patient: {
          ...splitNameMock(v.patient_name),
          phone: v.patient_phone,
          email: null
        },
        candidates
      } as T;
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
      const input = args?.payment as {
        visit_id: string | null;
        patient_id: string | null;
        amount_cents: number;
        method: string;
        kind: string;
        concept: string | null;
        budget_id?: string | null;
      };
      if (input.budget_id) {
        validateBudgetPayment(input.budget_id, input.kind, input.amount_cents);
      }
      if (!ops.session) throw "no hay una caja abierta; abre la caja del dia antes de cobrar";
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
        budget_id: input.budget_id ?? null,
        receipt_number: `R-${String(ops.receiptSeq).padStart(6, "0")}`,
        created_at: new Date().toISOString()
      };
      ops.payments.push(payment);
      if (payment.budget_id) {
        ops.budgetLedger.push({
          budget_id: payment.budget_id,
          amount_cents: payment.amount_cents,
          kind: payment.kind
        });
      }
      return payment as T;
    }
    case "list_session_payments":
      return [...ops.payments].reverse() as T;
    case "get_clinic_settings":
      return { ...ops.clinic } as T;
    case "save_clinic_settings": {
      const next = args?.settings as typeof ops.clinic;
      ops.clinic = { ...next };
      return undefined as T;
    }
    case "build_receipt": {
      // Espeja la regla del backend: el nivel decide cuanto dice el recibo del
      // tratamiento, y el concepto detallado sale del presupuesto si lo hay.
      const payment = ops.payments.find((p) => p.id === args?.paymentId);
      if (!payment) throw "no se encontro el cobro";
      const budget = payment.budget_id
        ? ops.dentalBudgets.find((b) => b.id === payment.budget_id)
        : null;
      const detailed = budget?.label ?? payment.concept ?? null;
      const concept =
        ops.clinic.receipt_detail === "AMOUNT_ONLY"
          ? null
          : ops.clinic.receipt_detail === "GENERIC"
            ? "Tratamiento dental"
            : detailed;
      return {
        receipt_number: payment.receipt_number,
        issued_at: payment.created_at,
        kind: payment.kind,
        method: payment.method,
        amount_cents: payment.amount_cents,
        concept,
        patient_name: payment.patient_id ? "Ana Ruiz" : null,
        clinic_name: ops.clinic.name,
        clinic_address: ops.clinic.address,
        clinic_phone: ops.clinic.phone,
        clinic_license: ops.clinic.license
      } as T;
    }
    case "dental_create_budget": {
      const input = args?.budget as {
        patient_id: string;
        encounter_id: string | null;
        label: string;
        notes: string | null;
        discount_cents: number;
        alternative_group: string | null;
        items: Array<{ tooth_id: string; procedure: string; price_cents: number }>;
      };
      if (!input.label.trim()) throw "el presupuesto necesita un nombre";
      if (input.items.length === 0) throw "el presupuesto necesita al menos una partida";
      const gross = input.items.reduce((sum, item) => sum + item.price_cents, 0);
      if (input.discount_cents < 0 || input.discount_cents > gross) {
        throw "el descuento debe estar entre cero y el total";
      }
      ops.budgetSeq += 1;
      const id = `budget-${ops.budgetSeq}`;
      const budget = {
        id,
        patient_id: input.patient_id,
        encounter_id: input.encounter_id,
        label: input.label.trim(),
        status: "PROPOSED",
        discount_cents: input.discount_cents,
        notes: input.notes,
        alternative_group: input.alternative_group,
        created_at: new Date().toISOString(),
        decided_at: null,
        items: input.items.map((item, index) => ({
          id: `${id}-item-${index + 1}`,
          budget_id: id,
          tooth_id: item.tooth_id || "GENERAL",
          procedure: item.procedure,
          price_cents: item.price_cents,
          status: "PLANNED",
          completed_at: null
        }))
      };
      ops.dentalBudgets.unshift(budget);
      return budgetWithTotals(budget) as T;
    }
    case "dental_decide_budget": {
      const budget = requireBudget(String(args?.budgetId));
      const status = String(args?.status).toUpperCase();
      if (budget.status !== "PROPOSED") throw "solo un presupuesto propuesto puede decidirse";
      if (status !== "ACCEPTED" && status !== "REJECTED") throw "decision invalida";
      budget.status = status;
      budget.decided_at = new Date().toISOString();
      if (status === "ACCEPTED" && budget.alternative_group) {
        for (const sibling of ops.dentalBudgets) {
          if (
            sibling.id !== budget.id &&
            sibling.patient_id === budget.patient_id &&
            sibling.alternative_group === budget.alternative_group &&
            sibling.status === "PROPOSED"
          ) {
            sibling.status = "REJECTED";
            sibling.decided_at = budget.decided_at;
          }
        }
      }
      return budgetWithTotals(budget) as T;
    }
    case "dental_set_item_status": {
      const itemId = String(args?.itemId);
      const status = String(args?.status).toUpperCase();
      const budget = ops.dentalBudgets.find((entry) =>
        entry.items.some((item) => item.id === itemId)
      );
      if (!budget) throw "presupuesto no encontrado";
      if (budget.status !== "ACCEPTED" && status !== "PLANNED") {
        throw "solo un presupuesto aceptado registra avance";
      }
      const item = budget.items.find((entry) => entry.id === itemId)!;
      item.status = status;
      item.completed_at = status === "COMPLETED" ? new Date().toISOString() : null;
      return budgetWithTotals(budget) as T;
    }
    case "dental_list_budgets": {
      const patientId = String(args?.patientId);
      return ops.dentalBudgets
        .filter((budget) => budget.patient_id === patientId)
        .map(budgetWithTotals) as T;
    }
    case "dental_create_lab_order": {
      const input = args?.order as {
        patient_id: string;
        encounter_id: string | null;
        tooth_id: string;
        work_type: string;
        lab_name: string;
        promised_at: string | null;
        cost_cents: number;
        notes: string | null;
      };
      if (!input.work_type.trim()) throw "la orden necesita el tipo de trabajo";
      if (!input.lab_name.trim()) throw "la orden necesita el laboratorio destino";
      if (input.cost_cents < 0) throw "el costo no puede ser negativo";
      ops.labSeq += 1;
      const order = {
        id: `lab-${ops.labSeq}`,
        patient_id: input.patient_id,
        encounter_id: input.encounter_id,
        tooth_id: input.tooth_id.trim() || "GENERAL",
        work_type: input.work_type.trim(),
        lab_name: input.lab_name.trim(),
        status: "PENDING",
        promised_at: input.promised_at,
        sent_at: null as string | null,
        received_at: null as string | null,
        delivered_at: null as string | null,
        cost_cents: input.cost_cents,
        notes: input.notes,
        created_at: new Date().toISOString()
      };
      ops.labOrders.unshift(order);
      return order as T;
    }
    case "dental_set_lab_order_status": {
      const order = ops.labOrders.find((entry) => entry.id === String(args?.orderId));
      if (!order) throw "orden no encontrada";
      const status = String(args?.status).toUpperCase();
      if (!(LAB_TRANSITIONS[order.status] ?? []).includes(status)) {
        throw `una orden ${order.status} no puede pasar a ${status}`;
      }
      order.status = status;
      const stamp = new Date().toISOString();
      if (status === "SENT") order.sent_at = stamp;
      if (status === "RECEIVED") order.received_at = stamp;
      if (status === "DELIVERED") order.delivered_at = stamp;
      return order as T;
    }
    case "dental_list_lab_orders":
      return ops.labOrders.filter((order) => order.patient_id === String(args?.patientId)) as T;
    case "dental_pending_lab_orders": {
      const name = `${mockState.encounter.patient.first_name} ${mockState.encounter.patient.last_name}`.trim();
      return ops.labOrders
        .filter((order) => order.status === "PENDING" || order.status === "SENT")
        .map((order) => ({ ...order, patient_name: name }))
        .sort((a, b) => (a.promised_at ?? "9999") < (b.promised_at ?? "9999") ? -1 : 1) as T;
    }
    case "dental_specialty_history": {
      const enc = mockState.encounter;
      if (String(args?.patientId) !== enc.patient.id) return [] as T;
      // Consulta previa de demostracion para ver la evolucion de higiene.
      const entries: Array<{
        encounter_id: string;
        opened_at: string;
        signed_at: string | null;
        status: string;
        specialty_json: string;
      }> = [
        {
          encounter_id: "enc-demo-past",
          opened_at: "2026-06-09T16:00:00Z",
          signed_at: "2026-06-09T17:00:00Z",
          status: "SIGNED",
          specialty_json: JSON.stringify({
            plaque: { "16": ["M", "D", "V"], "17": ["M", "V"], "26": ["M"], "31": ["V", "L"] }
          })
        }
      ];
      const latestNote = enc.notes[enc.notes.length - 1];
      if (latestNote) {
        entries.push({
          encounter_id: enc.id,
          opened_at: new Date().toISOString(),
          signed_at: enc.signed_at,
          status: enc.status,
          specialty_json: JSON.stringify(latestNote.specialty ?? {})
        });
      }
      return entries as T;
    }
    case "dental_patient_balance": {
      const patientId = String(args?.patientId);
      const accepted = ops.dentalBudgets
        .filter((budget) => budget.patient_id === patientId && budget.status === "ACCEPTED")
        .map(budgetWithTotals);
      const total = accepted.reduce((sum, budget) => sum + budget.total_cents, 0);
      const paid = accepted.reduce((sum, budget) => sum + budget.paid_cents, 0);
      return {
        accepted_total_cents: total,
        paid_cents: paid,
        balance_cents: total - paid,
        accepted_budgets: accepted.length
      } as T;
    }
  }

  switch (command) {
    case "list_doctor_profiles":
      return [...mockState.profiles] as T;
    case "create_doctor_profile": {
      const displayName = String(args?.displayName ?? "").trim();
      if (!displayName) {
        throw "escribe el nombre del medico";
      }
      const baseId =
        displayName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "medico";
      let id = baseId;
      let suffix = 2;
      while (mockState.profiles.some((profile) => profile.id === id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      const profile = {
        id,
        display_name: displayName,
        created_at: new Date().toISOString(),
        last_used_at: null as string | null
      };
      mockState.profiles.push(profile);
      return profile as T;
    }
    case "unlock_database": {
      if (String(args?.passphrase ?? "").length < 8) {
        throw "la frase de seguridad debe tener al menos 8 caracteres";
      }
      const profileId = String(args?.profileId ?? "default");
      const profile = mockState.profiles.find((item) => item.id === profileId);
      if (!profile) {
        throw "perfil medico no encontrado";
      }
      profile.last_used_at = new Date().toISOString();
      // Primer arranque: el backend instala el catalogo real empaquetado si la
      // base sigue sembrada. El mock espeja ese comportamiento.
      if (mockState.medicationRef.version === "seed-v1") {
        mockState.medicationRef = {
          version: "onchigh-mx-2026-07-07",
          medications: 150,
          interactions: 188,
          labels: 64
        };
      }
      return {
        schema_version: 3,
        db_path: `C:\\...\\${profile.id}\\midoc.db (demo)`,
        backup_path: `C:\\...\\${profile.id}\\backups\\midoc-demo.db`,
        profile
      } as T;
    }
    case "lock_database":
      return undefined as T;
    case "sync_status":
      return {
        linked: mockState.linked,
        server_url: "http://localhost:3000",
        cursor: 7,
        clinical_profile: mockState.clinicalProfile,
        slot_minutes: mockState.slotMinutes,
        work_start_minutes: 9 * 60,
        work_end_minutes: 14 * 60
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
    case "attend_appointment": {
      const appointmentId = String(args?.appointmentId);
      const appt = mockState.appointments.find((a) => a.id === appointmentId);
      if (!appt) throw "cita no encontrada";
      if (args?.linkPatientId) {
        activateMockEncounter(appointmentId, String(args.linkPatientId));
        return { kind: "encounter", encounter_id: e.id } as T;
      }
      if (args?.forceNew) {
        const created = {
          id: `pat-${mockState.patients.length + 1}`,
          ...splitNameMock(appt.patient_name),
          phone: appt.patient_phone ?? null,
          email: null as string | null,
          birth_date: null as string | null,
          allergies: null as string | null,
          medical_background: null as string | null,
          family_background: null as string | null
        };
        mockState.patients.push(created);
        activateMockEncounter(appointmentId, created.id);
        return { kind: "encounter", encounter_id: e.id } as T;
      }
      const candidates = matchPatientsMock(appt?.patient_name, appt?.patient_phone);
      if (candidates.length === 0) {
        const created = {
          id: `pat-${mockState.patients.length + 1}`,
          ...splitNameMock(appt.patient_name),
          phone: appt.patient_phone ?? null,
          email: null as string | null,
          birth_date: null as string | null,
          allergies: null as string | null,
          medical_background: null as string | null,
          family_background: null as string | null
        };
        mockState.patients.push(created);
        activateMockEncounter(appointmentId, created.id);
        return { kind: "encounter", encounter_id: e.id } as T;
      }
      return {
        kind: "needs_resolution",
        appointment_patient: {
          ...splitNameMock(appt?.patient_name ?? "Paciente"),
          phone: appt?.patient_phone ?? null,
          email: null
        },
        candidates
      } as T;
    }
    case "resolve_appointment_patient": {
      // Espeja resolve_appointment_patient del backend: resuelve el expediente
      // del paciente (sin abrir encuentro). El front abre la vista Expediente.
      const appt = mockState.appointments.find((a) => a.id === args?.appointmentId);
      if (args?.linkPatientId) {
        return { kind: "patient", patient_id: String(args.linkPatientId) } as T;
      }
      if (args?.forceNew) {
        const created = {
          id: `pat-${mockState.patients.length + 1}`,
          ...splitNameMock(appt?.patient_name ?? "Paciente"),
          phone: appt?.patient_phone ?? null,
          email: null as string | null,
          birth_date: null as string | null,
          allergies: null as string | null,
          medical_background: null as string | null,
          family_background: null as string | null
        };
        mockState.patients.push(created);
        return { kind: "patient", patient_id: created.id } as T;
      }
      const candidates = matchPatientsMock(appt?.patient_name, appt?.patient_phone);
      if (candidates.length === 0) {
        return {
          kind: "needs_resolution",
          appointment_patient: {
            ...splitNameMock(appt?.patient_name ?? "Paciente"),
            phone: appt?.patient_phone ?? null,
            email: null
          },
          candidates: []
        } as T;
      }
      return {
        kind: "needs_resolution",
        appointment_patient: {
          ...splitNameMock(appt?.patient_name ?? "Paciente"),
          phone: appt?.patient_phone ?? null,
          email: null
        },
        candidates
      } as T;
    }
    case "list_patients": {
      const term = String(args?.search ?? "").trim().toLowerCase();
      const filtered = term
        ? mockState.patients.filter((p) =>
            `${p.first_name} ${p.last_name} ${p.phone ?? ""}`.toLowerCase().includes(term)
          )
        : mockState.patients;
      return filtered.map((p) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        phone: p.phone,
        email: p.email,
        birth_date: p.birth_date,
        allergies: p.allergies,
        encounter_count: p.id === "pat-1" ? 1 : 0,
        last_visit: p.id === "pat-1" ? new Date(Date.now() - 40 * 86400_000).toISOString() : null
      })) as T;
    }
    case "get_patient_profile": {
      const patient = mockState.patients.find((p) => p.id === args?.patientId);
      if (!patient) throw "no encontrado";
      return {
        patient,
        history:
          patient.id === "pat-1"
            ? [
                {
                  encounter_id: "enc-1",
                  signed_at: null,
                  status: "OPEN",
                  diagnosis: "Cefalea en estudio"
                },
                {
                  encounter_id: "enc-0",
                  signed_at: new Date(Date.now() - 40 * 86400_000).toISOString(),
                  status: "SIGNED",
                  diagnosis: "Gastritis aguda"
                }
              ]
            : []
      } as T;
    }
    case "find_patient_matches": {
      const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
      const email = String(args?.email ?? "").trim().toLowerCase();
      const phone = digits(args?.phone as string | null);
      const name = `${String(args?.firstName ?? "").trim().toLowerCase()} ${String(
        args?.lastName ?? ""
      ).trim().toLowerCase()}`.trim();
      if (!email && !phone && !name) return [] as T;
      return mockState.patients
        .filter((p) => {
          const pe = (p.email ?? "").trim().toLowerCase();
          const pp = digits(p.phone);
          const pn = `${p.first_name.trim().toLowerCase()} ${p.last_name
            .trim()
            .toLowerCase()}`.trim();
          return (
            (email && pe && email === pe) ||
            (phone && pp && phone === pp) ||
            (name && pn && name === pn)
          );
        })
        .map((p) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          phone: p.phone,
          email: p.email,
          birth_date: p.birth_date,
          allergies: p.allergies,
          encounter_count: p.id === "pat-1" ? 1 : 0,
          last_visit: null
        })) as T;
    }
    case "create_patient": {
      const input = args?.patient as {
        first_name: string;
        last_name: string;
        phone: string | null;
        email: string | null;
        birth_date: string | null;
        sex: string | null;
      };
      const created = {
        id: `pat-${mockState.patients.length + 1}`,
        first_name: input.first_name.trim(),
        last_name: input.last_name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        birth_date: input.birth_date?.trim() || null,
        allergies: null as string | null,
        medical_background: null as string | null,
        family_background: null as string | null
      };
      mockState.patients.push(created);
      return created as T;
    }
    case "open_patient_encounter":
      return { id: e.id } as T;
    case "list_timeline_events": {
      const pid = String(args?.patientId);
      return mockState.timeline
        .filter((ev) => ev.patient_id === pid)
        .sort((a, b) => (a.event_date < b.event_date ? 1 : -1)) as T;
    }
    case "add_timeline_event": {
      const input = args?.event as {
        event_date: string;
        category: string;
        title: string;
        detail: string | null;
      };
      if (!input.title.trim()) throw "el evento necesita un titulo";
      if (!input.event_date.trim()) throw "el evento necesita una fecha";
      mockState.timelineSeq += 1;
      const created = {
        id: `tl-new-${mockState.timelineSeq}`,
        patient_id: String(args?.patientId),
        event_date: input.event_date,
        category: input.category.toUpperCase(),
        title: input.title.trim(),
        detail: input.detail?.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      mockState.timeline.push(created);
      return created as T;
    }
    case "update_timeline_event": {
      const input = args?.event as {
        event_date: string;
        category: string;
        title: string;
        detail: string | null;
      };
      const ev = mockState.timeline.find((x) => x.id === args?.eventId);
      if (!ev) throw "no encontrado";
      ev.event_date = input.event_date;
      ev.category = input.category.toUpperCase();
      ev.title = input.title.trim();
      ev.detail = input.detail?.trim() || null;
      ev.updated_at = new Date().toISOString();
      return ev as T;
    }
    case "delete_timeline_event": {
      const idx = mockState.timeline.findIndex((x) => x.id === args?.eventId);
      if (idx === -1) throw "no encontrado";
      mockState.timeline.splice(idx, 1);
      return undefined as T;
    }
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
    case "get_patient_medical_history": {
      const patientId = String(args?.patientId ?? "");
      const latest = mockState.medicalHistoryVersions
        .filter((version) => version.patient_id === patientId)
        .sort((a, b) => b.version - a.version)[0];
      return (latest ?? null) as T;
    }
    case "save_patient_medical_history": {
      if (e.status === "SIGNED") throw "la nota ya fue firmada y no puede modificarse";
      const patientId = String(args?.patientId ?? "");
      const input = args?.input as {
        payload_json: string;
        source: string;
        encounter_id: string | null;
        source_appointment_id: string | null;
        reconciled_source_hash: string | null;
      };
      JSON.parse(input.payload_json);
      const version = mockState.medicalHistoryVersions.filter(
        (item) => item.patient_id === patientId
      ).length + 1;
      const saved = {
        id: `mh-${patientId}-${version}`,
        patient_id: patientId,
        version,
        payload_json: input.payload_json,
        source: input.source,
        encounter_id: input.encounter_id,
        source_appointment_id: input.source_appointment_id,
        reconciled_source_hash: input.reconciled_source_hash,
        created_at: new Date().toISOString()
      };
      mockState.medicalHistoryVersions.push(saved);
      return saved as T;
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
    case "ai_scribe_consent_status":
      return mockState.aiScribeConsent as T;
    case "ai_grant_scribe_consent":
      mockState.aiScribeConsent = true;
      return undefined as T;
    case "ai_revoke_scribe_consent":
      mockState.aiScribeConsent = false;
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
            : usageType === "DENTAL_EVOLUTION"
              ? `Nota de evolucion dental (borrador):\nSesion documentada a partir de lo capturado en el odontograma y el plan.\nContexto considerado:\n${context}\nPlantilla dental capturada (JSON): ${JSON.stringify(mockState.encounter.notes[mockState.encounter.notes.length - 1]?.specialty ?? null)}\n\n(Revisar hallazgos, procedimientos y materiales antes de firmar.)`
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
      // La via en nube ahora la gobierna el portal (Ruta B): el proveedor real es
      // `portal-standard` o `portal-diarized` segun el modo. El costo comercial
      // autoritativo lo fija el portal; en local no consume creditos.
      const viaCloud = args?.useCloud === true;
      const cloudMode = String(args?.mode ?? "standard");
      const diarized = viaCloud && cloudMode === "diarized";
      return {
        run_id: voiceRunId,
        usage_type: "TRANSCRIPTION",
        provider: !viaCloud ? "whisper-local-medium" : diarized ? "portal-diarized" : "portal-standard",
        model_version: !viaCloud
          ? "whisper-local-medium"
          : diarized
            ? "gpt-4o-transcribe-diarize"
            : "gpt-4o-mini-transcribe",
        estimated_cost_cents: 0,
        latency_ms: 2,
        transcript_text: `Transcripcion (borrador, ${viaCloud ? "nube" : "local"}): audio ${audio?.mediaType ?? "audio/wav"}. Revise terminos clinicos, medicamentos, dosis y hablantes antes de usarla.`,
        audio_retention_policy: "discarded_after_transcription",
        // Turnos anonimos de demostracion para el flujo de asignacion de roles
        // en el navegador de desarrollo (browser-dev, sin backend nativo).
        segments_json: diarized
          ? JSON.stringify([
              { speaker: "speaker_0", startSeconds: 0, endSeconds: 3, text: "Buenos dias, que lo trae a consulta?" },
              { speaker: "speaker_1", startSeconds: 3, endSeconds: 7, text: "Me duele la cabeza desde hace tres dias." },
              { speaker: "speaker_0", startSeconds: 7, endSeconds: 9, text: "Tiene fiebre o nauseas?" },
              { speaker: "speaker_1", startSeconds: 9, endSeconds: 12, text: "No, solo el dolor y algo de sensibilidad a la luz." }
            ])
          : null
      } as T;
    }
    case "ai_diarize_consultation": {
      if (!mockState.aiVoiceConsent) {
        throw "falta el consentimiento del paciente para asistencia de IA";
      }
      const spentDiar = mockState.aiRuns.reduce((s, r) => s + r.cost_cents, 0);
      if (mockState.aiBudgetCents > 0 && spentDiar >= mockState.aiBudgetCents) {
        throw "se alcanzo el presupuesto mensual de IA; ajustalo para continuar";
      }
      mockState.aiRunSeq += 1;
      const diarRunId = `ai-run-${mockState.aiRunSeq}`;
      mockState.aiRuns.push({
        id: diarRunId,
        usage_type: "TRANSCRIPTION",
        cost_cents: 1,
        status: "DRAFT",
        reported: false
      });
      // Seleccion del medico: 0 = Auto, 1 = dictado (una voz), 2/3 = fijo.
      const requestedSpeakers = Number(args?.numSpeakers ?? 2);
      // Dialogo de demostracion ya separado en turnos medico/paciente.
      const turns =
        requestedSpeakers === 1
          ? [
              {
                id: "turn-1",
                speakerId: "speaker-0",
                role: "MEDICO",
                text: "Paciente masculino de 45 anos, refiere cefalea de tres dias, sin fiebre, con fotofobia leve."
              }
            ]
          : [
              { id: "turn-1", speakerId: "speaker-0", role: "MEDICO", text: "Buenos dias, que lo trae a consulta?" },
              { id: "turn-2", speakerId: "speaker-1", role: "PACIENTE", text: "Me duele la cabeza desde hace tres dias." },
              { id: "turn-3", speakerId: "speaker-0", role: "MEDICO", text: "Tiene fiebre o nauseas?" },
              { id: "turn-4", speakerId: "speaker-1", role: "PACIENTE", text: "No, solo el dolor y algo de sensibilidad a la luz." }
            ];
      return {
        run_id: diarRunId,
        usage_type: "TRANSCRIPTION",
        provider: "whisper-local-medium+sherpa-diarize",
        model_version: "whisper-local-medium",
        estimated_cost_cents: 1,
        latency_ms: 2,
        transcript_text: turns.map((t) => t.text).join(" "),
        turns,
        diarized: true,
        audio_retention_policy: "discarded_after_transcription"
      } as T;
    }
    case "ai_save_reviewed_transcription": {
      const encounterId = String(args?.encounterId ?? "");
      const runId = String(args?.runId ?? "");
      const turns = (args?.turns ?? []) as Array<{
        id: string;
        speaker: "MEDICO" | "PACIENTE" | "ACOMPANANTE" | "OTRO";
        text: string;
      }>;
      if (!encounterId || !runId || turns.every((turn) => !turn.text.trim())) {
        throw "la transcripcion revisada necesita texto";
      }
      const reviewedAt = new Date().toISOString();
      const value = {
        id: `reviewed-${runId}`,
        encounter_id: encounterId,
        run_id: runId,
        transcript_text: turns.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n"),
        turns,
        status: "REVIEWED",
        created_at: reviewedAt,
        reviewed_at: reviewedAt
      };
      mockState.reviewedTranscriptions[encounterId] = value;
      return value as T;
    }
    case "ai_latest_reviewed_transcription":
      return (mockState.reviewedTranscriptions[String(args?.encounterId ?? "")] ?? null) as T;
    case "ai_discard_reviewed_transcription": {
      const encounterId = String(args?.encounterId ?? "");
      const runId = String(args?.runId ?? "");
      const reviewed = mockState.reviewedTranscriptions[encounterId];
      if (!reviewed || String(reviewed.run_id ?? "") !== runId) {
        throw "la transcripcion revisada no puede descartarse";
      }
      delete mockState.reviewedTranscriptions[encounterId];
      const run = mockState.aiRuns.find((item) => item.id === runId);
      if (run) run.status = "DISCARDED";
      return undefined as T;
    }
    case "ai_structure_consultation": {
      if (!mockState.aiScribeConsent) {
        throw "falta el consentimiento del paciente para asistencia de IA";
      }
      const spentScribe = mockState.aiRuns.reduce((s, r) => s + r.cost_cents, 0);
      if (mockState.aiBudgetCents > 0 && spentScribe >= mockState.aiBudgetCents) {
        throw "se alcanzo el presupuesto mensual de IA; ajustalo para continuar";
      }
      mockState.aiRunSeq += 1;
      const scribeRunId = `ai-run-${mockState.aiRunSeq}`;
      mockState.aiRuns.push({
        id: scribeRunId,
        usage_type: "CONSULTATION_STRUCTURING",
        cost_cents: 1,
        status: "DRAFT",
        reported: false
      });
      const template = args?.template as
        | { segments?: Array<{ id: string; label: string }> }
        | undefined;
      const turns = args?.turns as Array<{ id: string; text: string }> | undefined;
      const sourceTurn = turns?.[0]?.id ?? "turn-1";
      const text = turns?.map((turn) => turn.text).join(" ") || "Sin transcripcion.";
      return {
        run_id: scribeRunId,
        usage_type: "CONSULTATION_STRUCTURING",
        provider: "fake-clinico",
        model_version: "fake-1",
        estimated_cost_cents: 1,
        latency_ms: 2,
        segments: (template?.segments ?? []).slice(0, 4).map((segment) => ({
          segment_id: segment.id,
          content: `${segment.label} (borrador): ${text}`,
          confidence: "medium",
          source_turns: [sourceTurn],
          warnings: ["Revisar antes de guardar."]
        })),
        missing: [],
        warnings: ["Acomodo simulado en navegador."]
      } as T;
    }
    case "ai_list_text_models":
      // En el navegador no hay proveedor real; se simula el catalogo para poder
      // ejercitar el dialogo de sobrecarga en desarrollo.
      return [
        {
          id: "gemini:gemini-3-flash",
          provider: "gemini-direct",
          model: "gemini-3-flash",
          label: "Gemini · gemini-3-flash",
          is_default: true
        },
        {
          id: "gemini:gemini-2.5-flash",
          provider: "gemini-direct",
          model: "gemini-2.5-flash",
          label: "Gemini · gemini-2.5-flash",
          is_default: false
        },
        {
          id: "openai:gpt-5-mini",
          provider: "openai-direct",
          model: "gpt-5-mini",
          label: "OpenAI · gpt-5-mini",
          is_default: false
        }
      ] as T;
    case "ai_generate_clinical_aid": {
      if (!mockState.aiScribeConsent) {
        throw "falta el consentimiento del paciente para asistencia de IA";
      }
      const encounterId = String(args?.encounterId ?? "");
      if (!mockState.reviewedTranscriptions[encounterId]) {
        throw "revisa la transcripcion antes de usar Ayuda IA";
      }
      mockState.aiRunSeq += 1;
      const runId = `ai-run-${mockState.aiRunSeq}`;
      mockState.aiRuns.push({
        id: runId,
        usage_type: "CLINICAL_AID",
        cost_cents: 1,
        status: "DRAFT",
        reported: false
      });
      return {
        run_id: runId,
        usage_type: "CLINICAL_AID",
        provider: "fake-clinico",
        model_version: "fake-1",
        estimated_cost_cents: 1,
        latency_ms: 2,
        soap: {
          subjective: "Fatiga e insomnio según la información revisada.",
          objective: "",
          assessment: "Requiere valoración clínica y exploración.",
          diagnosis: "",
          plan: "",
          instructions: "",
          specialty: null
        },
        template_segments: [],
        possibilities: [{
          title: "Alteración del sueño",
          compatibility: "MEDIUM",
          explanation: "La fatiga coincide con insomnio y descanso insuficiente.",
          supporting_findings: ["Insomnio", "Descanso insuficiente"],
          conflicting_findings: [],
          missing_data: ["Exploración física", "Signos vitales"]
        }],
        exam_suggestions: [{
          name: "Signos vitales y estado general",
          reason: "La transcripción no registra exploración física."
        }],
        question_suggestions: [{
          question: "¿Desde cuándo presenta el síntoma y cómo ha evolucionado?",
          reason: "Precisar cronología ayuda a acotar posibilidades."
        }],
        studies: [{
          name: "Biometría hemática",
          reason: "Valorar causas frecuentes de fatiga si el criterio médico lo indica.",
          priority: "ROUTINE"
        }],
        treatments: [{
          name: "Medidas de higiene del sueño",
          reason: "La preconsulta refiere insomnio.",
          precautions: ["Confirmar causas secundarias."]
        }],
        prescription_draft: "Medidas de higiene del sueño según lo comentado en consulta.",
        background_updates: [{
          field: "medical_background",
          content: "Refiere insomnio de larga evolución (mencionado en consulta)."
        }],
        medical_history_updates: [{
          path: "pathological.diabetico",
          label: "Antecedentes personales patológicos · Diabetes",
          value: "no",
          source_turns: ["turn-1"],
          confidence: "high",
          warning: ""
        }],
        warnings: ["Todas las propuestas requieren revisión médica."]
      } as T;
    }
    case "list_consultation_templates":
      return mockState.consultationTemplates as T;
    case "save_consultation_template": {
      const template = args?.template as Record<string, unknown> | undefined;
      if (!template?.id) {
        throw "plantilla invalida";
      }
      const now = new Date().toISOString();
      const stored: Record<string, unknown> & { id: string } = {
        ...template,
        id: String(template.id),
        created_at: template.created_at ?? now,
        updated_at: now
      };
      mockState.consultationTemplates = [
        ...mockState.consultationTemplates.filter((item) => item.id !== stored.id),
        stored
      ];
      return stored as T;
    }
    case "delete_consultation_template":
      mockState.consultationTemplates = mockState.consultationTemplates.filter(
        (template) => template.id !== args?.id
      );
      return undefined as T;
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
    case "check_medication_safety": {
      // Espeja el motor del backend con un subconjunto del dataset sembrado.
      const refs: Record<string, { ingredient: string; display: string; cls: string }> = {
        ibuprofeno: { ingredient: "ibuprofen", display: "Ibuprofeno", cls: "AINE" },
        advil: { ingredient: "ibuprofen", display: "Ibuprofeno", cls: "AINE" },
        motrin: { ingredient: "ibuprofen", display: "Ibuprofeno", cls: "AINE" },
        naproxeno: { ingredient: "naproxen", display: "Naproxeno", cls: "AINE" },
        aleve: { ingredient: "naproxen", display: "Naproxeno", cls: "AINE" },
        warfarina: { ingredient: "warfarin", display: "Warfarina", cls: "Anticoagulante" },
        coumadin: { ingredient: "warfarin", display: "Warfarina", cls: "Anticoagulante" },
        sildenafil: { ingredient: "sildenafil", display: "Sildenafil", cls: "Inhibidor PDE5" },
        nitroglicerina: { ingredient: "nitroglicerina", display: "Nitroglicerina", cls: "Nitrato" },
        enalapril: { ingredient: "enalapril", display: "Enalapril", cls: "IECA" },
        renitec: { ingredient: "enalapril", display: "Enalapril", cls: "IECA" },
        losartan: { ingredient: "losartan", display: "Losartan", cls: "ARA2" },
        cozaar: { ingredient: "losartan", display: "Losartan", cls: "ARA2" },
        furosemida: { ingredient: "furosemide", display: "Furosemida", cls: "Diuretico" },
        furosemide: { ingredient: "furosemide", display: "Furosemida", cls: "Diuretico" },
        lasix: { ingredient: "furosemide", display: "Furosemida", cls: "Diuretico" },
        // Marcas comerciales MX (rebanada 4): el mock espeja el reconocimiento.
        sintrom: { ingredient: "acenocoumarol", display: "Acenocumarol", cls: "Anticoagulante" },
        flanax: { ingredient: "naproxen", display: "Naproxeno", cls: "AINE" },
        naxen: { ingredient: "naproxen", display: "Naproxeno", cls: "AINE" },
        tafil: { ingredient: "alprazolam", display: "Alprazolam", cls: "Benzodiacepina" },
        klaricid: { ingredient: "clarithromycin", display: "Claritromicina", cls: "Inhibidor fuerte CYP3A4" },
        lipitor: { ingredient: "atorvastatin", display: "Atorvastatina", cls: "Estatina CYP3A4 riesgo moderado" },
        amoxicilina: { ingredient: "amoxicilina", display: "Amoxicilina", cls: "Penicilina" },
        paracetamol: { ingredient: "acetaminophen", display: "Paracetamol", cls: "Analgesico" },
        acetaminofen: { ingredient: "acetaminophen", display: "Paracetamol", cls: "Analgesico" },
        tylenol: { ingredient: "acetaminophen", display: "Paracetamol", cls: "Analgesico" },
        tempra: { ingredient: "acetaminophen", display: "Paracetamol", cls: "Analgesico" }
      };
      // Base ONChigh (paso 25): pares citando la fuente real, no DDInter.
      const interactions: Record<string, { severity: string; description: string }> = {
        "ibuprofen|warfarin": { severity: "MAJOR", description: "Riesgo aumentado de sangrado por efecto sinergico sobre la hemostasia." },
        "naproxen|warfarin": { severity: "MAJOR", description: "Riesgo aumentado de sangrado por efecto sinergico sobre la hemostasia." },
        "nitroglicerina|sildenafil": { severity: "CONTRAINDICATED", description: "Hipotension grave por vasodilatacion sumada: combinacion contraindicada." },
        "enalapril|ibuprofen": { severity: "MAJOR", description: "Deterioro de la funcion renal, hiperpotasemia y menor efecto antihipertensivo." },
        "acenocoumarol|naproxen": { severity: "MAJOR", description: "Riesgo aumentado de sangrado por efecto sinergico sobre la hemostasia." },
        "acenocoumarol|ibuprofen": { severity: "MAJOR", description: "Riesgo aumentado de sangrado por efecto sinergico sobre la hemostasia." },
        "atorvastatin|clarithromycin": { severity: "MAJOR", description: "Riesgo aumentado de miopatia/rabdomiolisis: considerar suspender, reducir o cambiar la estatina." },
        "clarithromycin|simvastatin": { severity: "CONTRAINDICATED", description: "Miopatia/rabdomiolisis por aumento marcado de la estatina: simvastatina contraindicada con inhibidores fuertes de CYP3A4." }
      };
      // Reglas de tres clases (triple whammy): se evaluan por las clases presentes.
      const tripleRules: Array<{ classes: [string, string, string]; description: string }> = [
        { classes: ["IECA", "Diuretico", "AINE"], description: "Triple whammy: IECA + diuretico + AINE eleva el riesgo de lesion renal aguda. Vigilar funcion renal y potasio; evitar o suspender el AINE." },
        { classes: ["ARA2", "Diuretico", "AINE"], description: "Triple whammy: ARA2 + diuretico + AINE eleva el riesgo de lesion renal aguda. Vigilar funcion renal y potasio; evitar o suspender el AINE." }
      ];
      const input = (args?.medications as string[]) ?? [];
      const normalized = input.map((raw) => {
        const ref = refs[raw.trim().toLowerCase()];
        return ref
          ? { input: raw, ingredient: ref.ingredient, displayName: ref.display, drugClass: ref.cls, recognized: true }
          : { input: raw, ingredient: null, displayName: null, drugClass: null, recognized: false };
      });
      const recognized = normalized.filter((n) => n.recognized);
      const interactionAlerts: Array<Record<string, unknown>> = [];
      const duplicateTherapy: Array<Record<string, unknown>> = [];
      for (let i = 0; i < recognized.length; i++) {
        for (let j = i + 1; j < recognized.length; j++) {
          const [a, b] = [recognized[i].ingredient!, recognized[j].ingredient!].sort();
          const hit = interactions[`${a}|${b}`];
          if (hit) {
            interactionAlerts.push({ drugA: recognized[i].displayName, drugB: recognized[j].displayName, severity: hit.severity, description: hit.description, source: "ONChigh", sourceVersion: "onchigh-2026-07-07" });
          }
          if (recognized[i].drugClass && recognized[i].drugClass === recognized[j].drugClass && recognized[i].ingredient !== recognized[j].ingredient) {
            duplicateTherapy.push({ drugA: recognized[i].displayName, drugB: recognized[j].displayName, drugClass: recognized[i].drugClass });
          }
        }
      }
      const allergyAlerts: Array<Record<string, unknown>> = [];
      const allergies = (mockState.encounter.patient.allergies ?? "").toLowerCase();
      for (const drug of recognized) {
        const cls = (drug.drugClass ?? "").toLowerCase();
        if (allergies && cls && (allergies.includes(cls) || cls.includes(allergies))) {
          allergyAlerts.push({ drug: drug.displayName, matchedAllergy: allergies, viaClass: drug.drugClass, source: "Alergias registradas en el expediente" });
        }
      }
      // Interacciones de tres clases: primer farmaco representante por clase.
      const classRep: Record<string, { displayName: string | null }> = {};
      for (const drug of recognized) {
        const cls = drug.drugClass ?? "";
        if (cls && !classRep[cls]) classRep[cls] = { displayName: drug.displayName };
      }
      const tripleInteractions: Array<Record<string, unknown>> = [];
      for (const rule of tripleRules) {
        const [ca, cb, cc] = rule.classes;
        if (classRep[ca] && classRep[cb] && classRep[cc]) {
          tripleInteractions.push({
            drugA: classRep[ca].displayName,
            drugB: classRep[cb].displayName,
            drugC: classRep[cc].displayName,
            severity: "MAJOR",
            description: rule.description,
            source: "ONChigh",
            sourceVersion: "onchigh-2026-07-07"
          });
        }
      }
      const unrecognized = normalized.filter((n) => !n.recognized).map((n) => n.input);
      interactionAlerts.sort((x, y) => {
        const rank = (s: string) => ({ CONTRAINDICATED: 4, MAJOR: 3, MODERATE: 2, MINOR: 1 }[s] ?? 0);
        return rank(String(y.severity)) - rank(String(x.severity));
      });
      // Respaldo openFDA simulado: acetaminophen + warfarin sin interaccion estructurada.
      const ingredients = recognized.map((r) => r.ingredient);
      const labelNotes: Array<Record<string, unknown>> = [];
      if (ingredients.includes("acetaminophen") && ingredients.includes("warfarin") && mockState.medicationRef.labels > 0) {
        labelNotes.push({
          drugA: "Paracetamol",
          drugB: "Warfarina",
          text: "Puede potenciar el efecto de la warfarina con uso prolongado.",
          source: "openFDA"
        });
      }
      return {
        normalized,
        unrecognized,
        interactions: interactionAlerts,
        allergyAlerts,
        duplicateTherapy,
        tripleInteractions,
        labelNotes,
        referenceVersion: "onchigh-mx-2026-07-07",
        hasAlerts:
          interactionAlerts.length + allergyAlerts.length + duplicateTherapy.length + tripleInteractions.length > 0
      } as T;
    }
    case "medication_reference_status":
      return { ...mockState.medicationRef } as T;
    case "import_medication_reference": {
      const medRows = String(args?.medicationsCsv ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !/^name\s*,/i.test(l));
      const ddRows = String(args?.ddinterCsv ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !/drug_a/i.test(l));
      const version = String(args?.version ?? "").trim();
      let labelRows = 0;
      try {
        const parsed = JSON.parse(String(args?.openfdaJson ?? "") || "{}");
        labelRows = Array.isArray(parsed.results)
          ? parsed.results.filter(
              (r: { drug_interactions?: unknown[] }) => Array.isArray(r.drug_interactions) && r.drug_interactions.length > 0
            ).length
          : 0;
      } catch {
        labelRows = 0;
      }
      if (medRows.length > 0) mockState.medicationRef.medications = medRows.length;
      if (ddRows.length > 0) mockState.medicationRef.interactions = ddRows.length;
      if (labelRows > 0) mockState.medicationRef.labels = labelRows;
      mockState.medicationRef.version = version;
      return { medications: medRows.length, interactions: ddRows.length, labels: labelRows, version } as T;
    }
    case "update_medication_reference": {
      // En navegador no hay red: simula una descarga a escala realista de DDInter.
      const version = String(args?.version ?? "").trim() || "oficial-demo";
      const medsUrl = String(args?.medicationsUrl ?? "").trim();
      const ddUrl = String(args?.ddinterUrl ?? "").trim();
      const fdaUrl = String(args?.openfdaUrl ?? "").trim();
      const medications = medsUrl ? 1287 : mockState.medicationRef.medications;
      const interactions = ddUrl ? 3402 : mockState.medicationRef.interactions;
      const labels = fdaUrl ? 940 : mockState.medicationRef.labels;
      mockState.medicationRef = { version, medications, interactions, labels };
      return { medications, interactions, labels, version } as T;
    }
    case "update_medication_reference_from_midoc": {
      const version = "onchigh-mx-2026-07-07";
      const medications = 150;
      const interactions = 188;
      const labels = 64;
      mockState.medicationRef = { version, medications, interactions, labels };
      return { medications, interactions, labels, version } as T;
    }
    case "extract_prescription_medications": {
      const known = ["ibuprofeno", "advil", "naproxeno", "warfarina", "coumadin", "sildenafil", "viagra", "nitroglicerina", "amoxicilina", "amoxil", "paracetamol", "acetaminofen", "tylenol", "tempra"];
      const display: Record<string, string> = {
        ibuprofeno: "Ibuprofeno", advil: "Ibuprofeno", naproxeno: "Naproxeno", warfarina: "Warfarina", coumadin: "Warfarina",
        sildenafil: "Sildenafil", viagra: "Sildenafil", nitroglicerina: "Nitroglicerina", amoxicilina: "Amoxicilina", amoxil: "Amoxicilina",
        paracetamol: "Paracetamol", acetaminofen: "Paracetamol", tylenol: "Paracetamol", tempra: "Paracetamol"
      };
      const text = String(args?.prescription ?? "").toLowerCase();
      const found: Array<{ pos: number; name: string }> = [];
      const seen = new Set<string>();
      for (const k of known) {
        const m = new RegExp(`\\b${k}\\b`).exec(text);
        if (m && !seen.has(display[k])) {
          seen.add(display[k]);
          found.push({ pos: m.index, name: display[k] });
        }
      }
      found.sort((a, b) => a.pos - b.pos);
      return found.map((f) => f.name) as T;
    }
    case "transcription_recommendation":
      // Equipo de demostracion: 16 GB sin GPU (CPU optimizada) → turbo-q5 agil.
      return {
        totalRamMb: 16 * 1024,
        cpuCores: 8,
        hasGpu: false,
        accel: "cpu",
        accelLabel: "CPU optimizada (OpenBLAS)",
        modelId: "large-v3-turbo",
        modelLabel: "Whisper large-v3-turbo cuantizado (alta precision y rapido en CPU)",
        modelRamMb: 2 * 1024,
        diskMb: 575,
        realtimeCapable: true,
        recommendCloudFallback: false,
        reason:
          "Equipo sin GPU con 6 GB o mas y CPU de 8+ nucleos: large-v3-turbo cuantizado ofrece alta precision clinica con transcripcion agil."
      } as T;
    case "transcription_model_status": {
      const ids = ["small", "medium", "large-v3-turbo", "large-v3", "vad-silero"];
      return ids.map((modelId) => {
        const total = MOCK_MODEL_SIZES[modelId];
        const m = mockState.transcriptionModels[modelId];
        if (m && m.downloading && !m.present) {
          // Simula avance de la descarga en cada sondeo (~6 pasos).
          m.downloaded = Math.min(m.total, m.downloaded + Math.ceil(m.total / 6));
          if (m.downloaded >= m.total) {
            m.present = true;
            m.downloading = false;
          }
        }
        return {
          modelId,
          fileName: MOCK_MODEL_FILES[modelId] ?? `ggml-${modelId}.bin`,
          expectedSizeBytes: total,
          downloadedBytes: m ? m.downloaded : 0,
          present: m ? m.present : false,
          verified: false, // sin checksum fijado en el mock
          downloading: m ? m.downloading : false,
          error: m ? m.error : null
        };
      }) as T;
    }
    case "download_transcription_model": {
      const modelId = String(args?.modelId ?? "");
      if (!(modelId in MOCK_MODEL_SIZES)) {
        throw `modelo no reconocido: ${modelId}`;
      }
      mockState.transcriptionModels[modelId] = {
        downloaded: 0,
        total: MOCK_MODEL_SIZES[modelId],
        present: false,
        downloading: true,
        error: null
      };
      return undefined as T;
    }
    case "diarization_model_status": {
      const ids = ["diarization-segmentation", "diarization-embedding"];
      return ids.map((modelId) => {
        const total = MOCK_DIARIZATION_SIZES[modelId];
        const m = mockState.diarizationModels[modelId];
        if (m && m.downloading && !m.present) {
          // Simula el avance de la descarga en cada sondeo (~4 pasos).
          m.downloaded = Math.min(m.total, m.downloaded + Math.ceil(m.total / 4));
          if (m.downloaded >= m.total) {
            m.present = true;
            m.downloading = false;
          }
        }
        return {
          modelId,
          fileName:
            modelId === "diarization-segmentation"
              ? "sherpa-segmentation-3.0.onnx"
              : "sherpa-embedding-campplus.onnx",
          expectedSizeBytes: total,
          downloadedBytes: m ? m.downloaded : 0,
          present: m ? m.present : false,
          verified: false, // sin checksum fijado en el mock
          downloading: m ? m.downloading : false,
          error: m ? m.error : null
        };
      }) as T;
    }
    case "download_diarization_model": {
      const modelId = String(args?.modelId ?? "");
      if (!(modelId in MOCK_DIARIZATION_SIZES)) {
        throw `modelo no reconocido: ${modelId}`;
      }
      mockState.diarizationModels[modelId] = {
        downloaded: 0,
        total: MOCK_DIARIZATION_SIZES[modelId],
        present: false,
        downloading: true,
        error: null
      };
      return undefined as T;
    }
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
    case "arco_list_requests":
      return mockState.arcoRequests as T;
    case "arco_record_request": {
      const req = {
        id: `arco-${mockState.arcoRequests.length + 1}`,
        patient_id: String(args?.patientId ?? "pat-1"),
        request_type: String(args?.requestType ?? "ACCESS"),
        status: "PENDING",
        notes: (args?.notes as string | undefined) ?? null,
        requested_at: new Date().toISOString(),
        fulfilled_at: null,
        result_summary: null
      };
      mockState.arcoRequests.unshift(req);
      return req as T;
    }
    case "arco_mark_fulfilled": {
      const req = mockState.arcoRequests.find((r) => r.id === args?.requestId);
      if (req) {
        req.status = "FULFILLED";
        req.fulfilled_at = new Date().toISOString();
        req.result_summary = String(args?.resultSummary ?? "");
      }
      return req as T;
    }
    case "arco_export_patient_data":
      return {
        patient_id: String(args?.patientId ?? "pat-1"),
        first_name: "Hugo",
        last_name: "Paz",
        phone: "614 000 1111",
        email: "hugo@example.com",
        birth_date: null,
        sex: null,
        allergies: "ninguna",
        medical_background: null,
        family_background: null,
        encounters: [],
        documents: [],
        medical_history_versions: mockState.medicalHistoryVersions,
        generated_at: new Date().toISOString()
      } as T;
    case "arco_fulfill_cancellation": {
      const req = mockState.arcoRequests.find((r) => r.id === args?.requestId);
      if (req) {
        req.status = "FULFILLED";
        req.fulfilled_at = new Date().toISOString();
        req.result_summary = "Expediente clinico eliminado; identidad seudonimizada.";
      }
      return {
        patient_id: String(req?.patient_id ?? "pat-1"),
        deleted_encounters: 0,
        deleted_notes: 0,
        deleted_prescriptions: 0,
        deleted_documents: 0,
        deleted_ai_runs: 0,
        deleted_ai_consents: 0,
        deleted_precheckins: 0,
        deleted_medical_history_versions: 0,
        anonymized_visits: 0,
        anonymized_appointments: 0
      } as T;
    }
    default:
      throw new Error(`mock sin comando: ${command}`);
  }
}
