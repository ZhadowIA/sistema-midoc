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
  slotMinutes: 30,
  aiConsent: false,
  aiVoiceConsent: false,
  aiRunSeq: 0,
  aiBudgetCents: 0,
  aiRuns: [] as Array<{ id: string; usage_type: string; cost_cents: number; status: string; reported: boolean }>,
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
      scheduled_start: slotDate(1, 9, 30),
      scheduled_end: slotDate(1, 10, 0),
      service_name: "Seguimiento",
      reason: null,
      patient_name: "Maria Elena Duarte",
      patient_phone: "614 000 2222",
      has_precheckin: false
    },
    {
      id: "appt-3",
      status: "CANCELLED",
      scheduled_start: slotDate(1, 12, 0),
      scheduled_end: slotDate(1, 12, 30),
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
      if (args?.linkPatientId || args?.forceNew) {
        return { kind: "encounter", encounter_id: e.id } as T;
      }
      const appt = mockState.appointments.find((a) => a.id === args?.appointmentId);
      const candidates = matchPatientsMock(appt?.patient_name, appt?.patient_phone);
      if (candidates.length === 0) {
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
    case "check_medication_safety": {
      // Espeja el motor del backend con un subconjunto del dataset sembrado.
      const refs: Record<string, { ingredient: string; display: string; cls: string }> = {
        ibuprofeno: { ingredient: "ibuprofeno", display: "Ibuprofeno", cls: "AINE" },
        naproxeno: { ingredient: "naproxeno", display: "Naproxeno", cls: "AINE" },
        warfarina: { ingredient: "warfarina", display: "Warfarina", cls: "Anticoagulante" },
        sildenafil: { ingredient: "sildenafil", display: "Sildenafil", cls: "Inhibidor PDE5" },
        nitroglicerina: { ingredient: "nitroglicerina", display: "Nitroglicerina", cls: "Nitrato" },
        amoxicilina: { ingredient: "amoxicilina", display: "Amoxicilina", cls: "Penicilina" },
        paracetamol: { ingredient: "paracetamol", display: "Paracetamol", cls: "Analgesico" }
      };
      const interactions: Record<string, { severity: string; description: string }> = {
        "ibuprofeno|warfarina": { severity: "MAJOR", description: "Los AINE aumentan el riesgo de sangrado con warfarina." },
        "naproxeno|warfarina": { severity: "MAJOR", description: "Los AINE aumentan el riesgo de sangrado con warfarina." },
        "nitroglicerina|sildenafil": { severity: "CONTRAINDICATED", description: "Hipotension grave por combinar nitrato con inhibidor de PDE5." }
      };
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
            interactionAlerts.push({ drugA: recognized[i].displayName, drugB: recognized[j].displayName, severity: hit.severity, description: hit.description, source: "Conjunto sembrado MiDoc (interaccion clinica conocida)", sourceVersion: "seed-v1" });
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
      const unrecognized = normalized.filter((n) => !n.recognized).map((n) => n.input);
      interactionAlerts.sort((x, y) => {
        const rank = (s: string) => ({ CONTRAINDICATED: 4, MAJOR: 3, MODERATE: 2, MINOR: 1 }[s] ?? 0);
        return rank(String(y.severity)) - rank(String(x.severity));
      });
      // Respaldo openFDA simulado: paracetamol + warfarina sin interaccion estructurada.
      const ingredients = recognized.map((r) => r.ingredient);
      const labelNotes: Array<Record<string, unknown>> = [];
      if (ingredients.includes("paracetamol") && ingredients.includes("warfarina") && mockState.medicationRef.labels > 0) {
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
        labelNotes,
        referenceVersion: "seed-v1",
        hasAlerts: interactionAlerts.length + allergyAlerts.length + duplicateTherapy.length > 0
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
    case "extract_prescription_medications": {
      const known = ["ibuprofeno", "naproxeno", "warfarina", "sildenafil", "nitroglicerina", "amoxicilina", "paracetamol"];
      const display: Record<string, string> = {
        ibuprofeno: "Ibuprofeno", naproxeno: "Naproxeno", warfarina: "Warfarina", sildenafil: "Sildenafil",
        nitroglicerina: "Nitroglicerina", amoxicilina: "Amoxicilina", paracetamol: "Paracetamol"
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
      // Equipo de demostracion: 16 GB sin GPU → modelo mediano por lotes.
      return {
        totalRamMb: 16 * 1024,
        cpuCores: 8,
        hasGpu: false,
        modelId: "medium",
        modelLabel: "Whisper medium (recomendado para terminos clinicos)",
        modelRamMb: 5 * 1024,
        diskMb: 1500,
        realtimeCapable: true,
        recommendCloudFallback: false,
        reason:
          "Equipo con 16 GB o mas y CPU de 8+ nucleos: el modelo mediano ofrece buena precision clinica con transcripcion agil."
      } as T;
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
        anonymized_visits: 0,
        anonymized_appointments: 0
      } as T;
    }
    default:
      throw new Error(`mock sin comando: ${command}`);
  }
}
