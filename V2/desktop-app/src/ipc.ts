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

async function mockCall<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 120));
  const e = mockState.encounter;

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
    case "sync_now":
      return { applied_events: 0, cursor: 7 } as T;
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
    default:
      throw new Error(`mock sin comando: ${command}`);
  }
}
