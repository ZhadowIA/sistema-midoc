// Datos del medico que exige la receta (Reglamento de Insumos para la Salud).
// Regla 4.6: se editan aqui o en la web; el portal manda y la app solo cambia su
// copia cuando el portal acepta. Puro para probarlo con `node --test`.

export interface Prescriber {
  professionalName: string;
  licenseNumber: string | null;
  degreeInstitution: string | null;
  specialtyTitle: string | null;
  specialtyLicenseNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  /** Version que el portal exige de vuelta al editar. */
  updatedAt: string;
}

export type PrescriberField = Exclude<keyof Prescriber, "updatedAt">;
export type PrescriberDraft = Record<PrescriberField, string>;
export type PrescriberInput = Record<PrescriberField, string | null> & { expectedUpdatedAt: string };

export interface PrescriberView {
  linked: boolean;
  prescriber: Prescriber | null;
}

export type PrescriberSave =
  | { kind: "saved"; prescriber: Prescriber }
  | { kind: "conflict"; message: string; current: Prescriber };

export const PRESCRIBER_FIELDS: { key: PrescriberField; label: string; hint?: string; full?: boolean }[] = [
  { key: "professionalName", label: "Nombre profesional", full: true },
  { key: "licenseNumber", label: "Cédula profesional" },
  { key: "degreeInstitution", label: "Institución que expidió el título" },
  { key: "specialtyTitle", label: "Especialidad", hint: "Déjalo vacío si no ejerces una especialidad." },
  { key: "specialtyLicenseNumber", label: "Cédula de especialidad" },
  { key: "addressLine1", label: "Domicilio del consultorio", full: true },
  { key: "addressLine2", label: "Interior, colonia u otra referencia", full: true },
  { key: "city", label: "Ciudad" },
  { key: "state", label: "Estado" },
  { key: "postalCode", label: "Código postal" }
];

export function toDraft(prescriber: Prescriber): PrescriberDraft {
  return Object.fromEntries(PRESCRIBER_FIELDS.map(({ key }) => [key, prescriber[key] ?? ""])) as PrescriberDraft;
}

export function isDirty(draft: PrescriberDraft, saved: Prescriber): boolean {
  return PRESCRIBER_FIELDS.some(({ key }) => draft[key].trim() !== (saved[key] ?? "").trim());
}

/** Lo mismo que rechazaria el portal, dicho antes de enviar. */
export function validateDraft(draft: PrescriberDraft): string[] {
  const errors: string[] = [];
  if (!draft.professionalName.trim()) errors.push("Captura tu nombre profesional.");
  if (!draft.licenseNumber.trim()) errors.push("Captura tu cédula profesional.");
  if (draft.specialtyTitle.trim() && !draft.specialtyLicenseNumber.trim()) {
    errors.push("La especialidad requiere su cédula de especialidad.");
  }
  return errors;
}

export function toInput(draft: PrescriberDraft, expectedUpdatedAt: string): PrescriberInput {
  const fields = Object.fromEntries(
    PRESCRIBER_FIELDS.map(({ key }) => [key, draft[key].trim() || null])
  ) as Record<PrescriberField, string | null>;
  return { ...fields, expectedUpdatedAt };
}
