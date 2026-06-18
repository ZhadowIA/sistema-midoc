// Espejo (a mano) del contrato `consultorio-app/src/lib/medical-history.ts`.
// Las dos apps no comparten paquete: cualquier cambio del contrato debe
// replicarse aqui. Este modulo formatea, para la vista del medico, el JSON de
// historia clinica que el paciente envio sellado (kind medical-history).

export interface MedicalHistoryRow {
  label: string;
  value: string;
}

export interface MedicalHistoryGroup {
  key: string;
  title: string;
  rows: MedicalHistoryRow[];
}

type FieldKind = "text" | "textarea" | "number" | "date" | "select" | "yesno";

interface FieldDef {
  key: string;
  label: string;
  kind?: FieldKind;
  options?: { value: string; label: string }[];
}

interface GroupDef {
  key: string;
  title: string;
  fields: FieldDef[];
}

const SEX_LABELS: Record<string, string> = { F: "Femenino", M: "Masculino" };

const GENERAL_FIELDS: FieldDef[] = [
  { key: "sex", label: "Sexo biologico" },
  { key: "allergies", label: "Alergias" },
  { key: "currentMedications", label: "Medicamentos cronicos" }
];

const RELATION_OPTIONS = [
  { value: "padre", label: "Padre" },
  { value: "madre", label: "Madre" },
  { value: "hijo", label: "Hijo/a" },
  { value: "pareja", label: "Pareja" },
  { value: "hermano", label: "Hermano/a" },
  { value: "otro", label: "Otro" }
];

// Heredo-familiares: estructura por padecimiento (relatives[] + tipo/notas).
const FAMILY_RELATIVES: Record<string, string> = {
  abueloPaterno: "Abuelo paterno",
  abuelaPaterna: "Abuela paterna",
  abueloMaterno: "Abuelo materno",
  abuelaMaterna: "Abuela materna",
  padre: "Padre",
  madre: "Madre",
  hermanos: "Hermanos",
  tios: "Tios"
};

const FAMILY_CONDITIONS: Array<{ key: string; label: string }> = [
  { key: "diabetes", label: "Diabetes" },
  { key: "hipertension", label: "Hipertension arterial" },
  { key: "cardiopatia", label: "Infarto / enfermedad cardiaca" },
  { key: "evc", label: "Derrame cerebral / embolia / EVC" },
  { key: "dislipidemia", label: "Colesterol o trigliceridos altos" },
  { key: "obesidad", label: "Obesidad" },
  { key: "renal", label: "Enfermedad renal cronica / dialisis" },
  { key: "cancer", label: "Cancer" },
  { key: "tiroides", label: "Enfermedades tiroideas" },
  { key: "autoinmunes", label: "Enfermedades autoinmunes" },
  { key: "asma", label: "Asma / alergias importantes" },
  { key: "neurologicas", label: "Enfermedades neurologicas" },
  { key: "psiquiatricas", label: "Enfermedades psiquiatricas" },
  { key: "trombosis", label: "Trombosis / problemas de coagulacion" },
  { key: "varices", label: "Varices / insuficiencia venosa" },
  { key: "sangre", label: "Enfermedades de la sangre" },
  { key: "hepaticas", label: "Enfermedades hepaticas" },
  { key: "digestivas", label: "Enfermedades digestivas" },
  { key: "osteoporosis", label: "Osteoporosis / fracturas frecuentes" },
  { key: "respiratorias", label: "Enfermedades respiratorias cronicas" },
  { key: "congenitas", label: "Malformaciones congenitas / geneticas" }
];

const FAMILY_HISTORY_KEY = "familyHistory";

// Sub-preguntas de una enfermedad cronica (apartado patologico).
function chronicDisease(key: string, label: string, extra: FieldDef[] = []): FieldDef[] {
  return [
    { key, label, kind: "yesno" },
    { key: `${key}Desde`, label: "Desde cuando" },
    ...extra,
    { key: `${key}Medicamento`, label: "Con que medicamento se controla" },
    { key: `${key}Complicaciones`, label: "Ha presentado alguna complicacion" }
  ];
}

function yesNo(items: Array<[string, string]>): FieldDef[] {
  return items.map(([key, label]) => ({ key, label, kind: "yesno" as FieldKind }));
}

// Grupos con sus campos APLANADOS (los sub-bloques del contrato se muestran como
// filas seguidas; el orden se conserva). Espeja MEDICAL_HISTORY_GROUPS.
const MEDICAL_HISTORY_GROUPS: GroupDef[] = [
  {
    key: "identification",
    title: "Ficha de identificacion",
    fields: [
      { key: "apellidoPaterno", label: "Apellido paterno" },
      { key: "apellidoMaterno", label: "Apellido materno" },
      { key: "fechaNacimiento", label: "Fecha de nacimiento" },
      { key: "lugarNacimiento", label: "Lugar de nacimiento" },
      { key: "estadoCivil", label: "Estado civil" },
      { key: "ocupacion", label: "Ocupacion" },
      { key: "bloodType", label: "Grupo sanguineo" },
      { key: "municipio", label: "Municipio" },
      { key: "estado", label: "Estado" },
      { key: "calle", label: "Calle" },
      { key: "numero", label: "Numero" },
      { key: "codigoPostal", label: "Codigo postal" },
      { key: "telefono", label: "Telefono" }
    ]
  },
  {
    key: "emergencyContact",
    title: "Contacto de emergencia",
    fields: [
      { key: "nombre", label: "Nombre del contacto" },
      { key: "telefono", label: "Telefono del contacto" },
      { key: "relacion", label: "Relacion con el contacto", kind: "select", options: RELATION_OPTIONS }
    ]
  },
  { key: FAMILY_HISTORY_KEY, title: "Antecedentes heredo-familiares", fields: [] },
  {
    key: "nonPathological",
    title: "Antecedentes personales no patologicos",
    fields: [
      { key: "banoDiario", label: "Bano (veces/sem)" },
      { key: "aseoBucal", label: "Aseo bucal (veces/sem)" },
      { key: "cambioRopa", label: "Cambio de ropa (veces/sem)" },
      { key: "leche", label: "Leche (veces/sem)" },
      { key: "carne", label: "Carne (veces/sem)" },
      { key: "huevos", label: "Huevos (veces/sem)" },
      { key: "verduras", label: "Verduras (veces/sem)" },
      { key: "frutas", label: "Frutas (veces/sem)" },
      { key: "cereales", label: "Cereales (veces/sem)" },
      { key: "leguminosas", label: "Leguminosas (veces/sem)" },
      { key: "antitetanica", label: "Inmunizacion antitetanica" },
      { key: "antisarampion", label: "Inmunizacion antisarampion" },
      { key: "antirubeola", label: "Inmunizacion antirubeola" },
      { key: "antihepatica", label: "Inmunizacion antihepatica" },
      { key: "desparasitacion", label: "Desparasitacion" },
      { key: "alcohol", label: "Consume alcohol", kind: "yesno" },
      { key: "alcoholEdadInicio", label: "Edad de inicio del alcohol" },
      { key: "alcoholCantidad", label: "Cantidad de bebidas que ingiere" },
      { key: "tabaco", label: "Fuma", kind: "yesno" },
      { key: "tabacoEdadInicio", label: "Edad de inicio del tabaco" },
      { key: "tabacoCigarrosDia", label: "Cigarros al dia" },
      { key: "otrasToxicomanias", label: "Otras toxicomanias" },
      { key: "tenencia", label: "Tipo de vivienda", kind: "select", options: [
        { value: "propia", label: "Propia" },
        { value: "rentada", label: "Rentada" },
        { value: "prestada", label: "Prestada" }
      ] },
      { key: "personasCasa", label: "Personas que habitan la casa" },
      { key: "habitaciones", label: "Habitaciones" },
      { key: "aguaPotable", label: "Cuenta con agua potable", kind: "yesno" },
      { key: "drenaje", label: "Cuenta con drenaje", kind: "yesno" },
      { key: "animales", label: "Animales en casa" },
      { key: "vidaSexualActiva", label: "Ha tenido relaciones sexuales", kind: "yesno" },
      { key: "vidaSexualEdadInicio", label: "Edad de inicio de vida sexual" },
      { key: "vidaSexualFrecuencia", label: "Frecuencia" },
      { key: "vidaSexualParejas", label: "Numero de parejas" },
      { key: "vidaSexualSexoservidoras", label: "Con sexoservidoras", kind: "yesno" },
      { key: "vidaSexualProteccion", label: "Proteccion (cual)" }
    ]
  },
  {
    key: "gyneco",
    title: "Antecedentes gineco-obstetricos",
    fields: [
      { key: "menarca", label: "Edad de la primera menstruacion" },
      { key: "ciclo", label: "Ciclo (cada cuantos dias y duracion)" },
      { key: "dismenorrea", label: "Presenta dolor", kind: "yesno" },
      { key: "dismenorreaMedicamento", label: "Requiere medicamentos", kind: "yesno" },
      { key: "embarazos", label: "Se ha embarazado", kind: "yesno" },
      { key: "gestas", label: "Numero de embarazos" },
      { key: "abortos", label: "Abortos" },
      { key: "complicacionesObst", label: "Complicaciones" },
      { key: "fum", label: "Fecha de ultima regla" }
    ]
  },
  {
    key: "pathological",
    title: "Antecedentes personales patologicos",
    fields: [
      { key: "cirugia", label: "Intervenido quirurgicamente", kind: "yesno" },
      { key: "cirugiaDeQue", label: "De que" },
      { key: "cirugiaFecha", label: "Fecha de la cirugia" },
      { key: "cirugiaComplicaciones", label: "Complicaciones de la cirugia" },
      { key: "transfusion", label: "Ha sido transfundido", kind: "yesno" },
      { key: "transfusionMotivo", label: "Motivo de la transfusion" },
      { key: "transfusionFecha", label: "Fecha de la transfusion" },
      { key: "transfusionComplicaciones", label: "Complicaciones de la transfusion" },
      { key: "alergia", label: "Ha presentado reaccion alergica", kind: "yesno" },
      { key: "alergiaFecha", label: "Fecha de la reaccion" },
      { key: "alergiaA", label: "Alergia a" },
      ...chronicDisease("diabetico", "Es diabetico"),
      ...chronicDisease("hipertenso", "Es hipertenso"),
      ...chronicDisease("convulsiones", "Presenta convulsiones", [
        { key: "convulsionesOcasiona", label: "Que las ocasiona" }
      ])
    ]
  },
  {
    key: "systemsReview",
    title: "Interrogatorio por aparatos y sistemas",
    fields: [
      ...yesNo([
        ["digFrecuentesDolores", "Dolores de estomago frecuentes"],
        ["digEstrenimiento", "Estrenimiento"],
        ["digDiarrea", "Diarrea"],
        ["digNauseas", "Nauseas o vomito"],
        ["digAgruras", "Agruras"]
      ]),
      { key: "digDesparasitado", label: "Desparasitado (cuando y con que)" },
      ...yesNo([
        ["respTos", "Tos frecuente"],
        ["respDolorPecho", "Dolor de pecho (respiratorio)"],
        ["respDolorEspalda", "Dolor de espalda"],
        ["circPalpitaciones", "Palpitaciones"],
        ["circFatiga", "Fatiga al esfuerzo"],
        ["circDolorPecho", "Dolor de pecho (circulatorio)"],
        ["circHinchazon", "Hinchazon de cara, manos o piernas"],
        ["circMareos", "Mareos"],
        ["circDolorCabeza", "Dolor de cabeza frecuente"],
        ["circZumbido", "Zumbido de oidos"],
        ["circAdormecimiento", "Adormecimiento de alguna parte"],
        ["circCalambres", "Calambres"],
        ["genuMolestiaOrinar", "Molestia para orinar"],
        ["genuArdor", "Ardor / mal olor / aumento al orinar"],
        ["genuDolorOrinar", "Dolor al orinar"],
        ["genuDolorRelaciones", "Dolor en relaciones sexuales"],
        ["genuSecreciones", "Secreciones genitales"]
      ]),
      { key: "genuColor", label: "Color, cantidad, olor" },
      { key: "genuAnticonceptivo", label: "Usa metodo anticonceptivo", kind: "yesno" },
      { key: "genuAnticonceptivoCual", label: "Cual metodo" },
      { key: "genuAnticonceptivoDesde", label: "Desde cuando" },
      { key: "nervDuermesBien", label: "Duerme bien", kind: "yesno" },
      { key: "nervHorasDuermes", label: "Horas que duerme" },
      ...yesNo([
        ["nervVision", "Problemas de vision"],
        ["nervAudicion", "Problemas de audicion"],
        ["nervOlfato", "Problemas de olfato"],
        ["muscDoloresArticulares", "Dolores articulares"],
        ["muscDoloresMusculares", "Dolores musculares"]
      ]),
      { key: "embFur", label: "Embarazo: fecha de ultima regla" },
      { key: "embProbableParto", label: "Embarazo: fecha probable de parto" },
      { key: "embSemanas", label: "Semanas de embarazo" },
      { key: "embSintomas", label: "Embarazo: sintomas" },
      { key: "embAntecedentes", label: "Embarazo: antecedentes de importancia" }
    ]
  }
];

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function valueForField(container: Record<string, unknown>, field: FieldDef): string {
  const raw = cleanText(container[field.key]);
  if (!raw) return "";
  if (field.key === "sex") return SEX_LABELS[raw] ?? raw;
  if (field.kind === "yesno") return raw === "si" ? "Si" : raw === "no" ? "No" : raw;
  if (field.kind === "select" && field.options) {
    return field.options.find((option) => option.value === raw)?.label ?? raw;
  }
  return raw;
}

/** Heredo-familiares: "Diabetes: Padre, Madre (tipo) - notas". */
function familyHistoryRows(parsed: Record<string, unknown>): MedicalHistoryRow[] {
  const value = parsed[FAMILY_HISTORY_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const container = value as Record<string, unknown>;
  return FAMILY_CONDITIONS.flatMap((condition) => {
    const entry = container[condition.key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const relatives = Array.isArray(record.relatives)
      ? (record.relatives as unknown[])
          .map((relative) => FAMILY_RELATIVES[String(relative)] ?? String(relative))
          .filter(Boolean)
      : [];
    const type = cleanText(record.type);
    const notes = cleanText(record.notes);
    if (relatives.length === 0 && !type && !notes) return [];
    let text = relatives.join(", ");
    if (type) text = text ? `${text} (${type})` : type;
    if (notes) text = text ? `${text} - ${notes}` : notes;
    return [{ label: condition.label, value: text }];
  });
}

function rowsFromGroup(group: GroupDef, parsed: Record<string, unknown>): MedicalHistoryRow[] {
  if (group.key === FAMILY_HISTORY_KEY) return familyHistoryRows(parsed);
  const value = parsed[group.key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const container = value as Record<string, unknown>;
  return group.fields.flatMap((field) => {
    const text = valueForField(container, field);
    return text ? [{ label: field.label, value: text }] : [];
  });
}

function unknownRows(
  group: GroupDef,
  parsed: Record<string, unknown>,
  knownKeys: Set<string>
): MedicalHistoryRow[] {
  if (group.key === FAMILY_HISTORY_KEY) return [];
  const value = parsed[group.key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) => {
    if (knownKeys.has(key)) return [];
    const text = cleanText(raw);
    return text ? [{ label: key, value: text }] : [];
  });
}

export function formatMedicalHistoryForDisplay(raw: string | null): MedicalHistoryGroup[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (Array.isArray(parsed.conversation)) return [];

    const groups: MedicalHistoryGroup[] = [];
    const generalRows = GENERAL_FIELDS.flatMap((field) => {
      const text = valueForField(parsed, field);
      return text ? [{ label: field.label, value: text }] : [];
    });
    if (generalRows.length > 0) {
      groups.push({ key: "general", title: "Datos generales", rows: generalRows });
    }

    for (const group of MEDICAL_HISTORY_GROUPS) {
      const rows = rowsFromGroup(group, parsed);
      const knownKeys = new Set(group.fields.map((field) => field.key));
      const extraRows = unknownRows(group, parsed, knownKeys);
      if (rows.length > 0 || extraRows.length > 0) {
        groups.push({ key: group.key, title: group.title, rows: [...rows, ...extraRows] });
      }
    }

    return groups;
  } catch {
    return raw.trim() ? [{ key: "raw", title: "Respuestas", rows: [{ label: "Texto", value: raw }] }] : [];
  }
}

export function flattenMedicalHistoryDisplayRows(raw: string | null): Array<[string, string]> {
  return formatMedicalHistoryForDisplay(raw).flatMap((group) =>
    group.rows.map(
      (row): [string, string] => [
        group.key === "general" ? row.label : `${group.title} · ${row.label}`,
        row.value
      ]
    )
  );
}

export function linesForMedicalHistoryGroup(
  raw: string | null,
  groupKey: string
): string[] {
  return formatMedicalHistoryForDisplay(raw)
    .find((group) => group.key === groupKey)
    ?.rows.map((row) => `${row.label}: ${row.value}`) ?? [];
}
