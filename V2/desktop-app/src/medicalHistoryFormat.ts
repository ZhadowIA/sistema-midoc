export interface MedicalHistoryRow {
  label: string;
  value: string;
}

export interface MedicalHistoryGroup {
  key: string;
  title: string;
  rows: MedicalHistoryRow[];
}

interface FieldDef {
  key: string;
  label: string;
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

const MEDICAL_HISTORY_GROUPS: GroupDef[] = [
  {
    key: "identification",
    title: "Identificacion",
    fields: [
      { key: "gender", label: "Genero" },
      { key: "maritalStatus", label: "Estado civil" },
      { key: "occupation", label: "Ocupacion" },
      { key: "bloodType", label: "Grupo sanguineo" }
    ]
  },
  {
    key: "familyHistory",
    title: "Antecedentes heredofamiliares",
    fields: [
      { key: "diabetes", label: "Diabetes" },
      { key: "hipertension", label: "Hipertension" },
      { key: "cardiopatia", label: "Cardiopatia" },
      { key: "cancer", label: "Cancer" },
      { key: "obesidad", label: "Obesidad" },
      { key: "dislipidemia", label: "Dislipidemia" },
      { key: "enfRenal", label: "Enfermedad renal" },
      { key: "enfTiroidea", label: "Enfermedad tiroidea" },
      { key: "autoinmunes", label: "Autoinmunes" },
      { key: "psiquiatricos", label: "Psiquiatricos" },
      { key: "trombosis", label: "Trombosis" },
      { key: "otros", label: "Otros" }
    ]
  },
  {
    key: "nonPathological",
    title: "Antecedentes personales no patologicos",
    fields: [
      { key: "tabaquismo", label: "Tabaquismo" },
      { key: "alcohol", label: "Alcohol" },
      { key: "toxicomanias", label: "Toxicomanias" },
      { key: "actividadFisica", label: "Actividad fisica" },
      { key: "alimentacion", label: "Alimentacion" },
      { key: "inmunizaciones", label: "Inmunizaciones" },
      { key: "sueno", label: "Sueno" },
      { key: "viajesRecientes", label: "Viajes recientes" },
      { key: "contactoAnimales", label: "Contacto con animales" }
    ]
  },
  {
    key: "pathological",
    title: "Antecedentes personales patologicos",
    fields: [
      { key: "enfCronicas", label: "Enfermedades cronicas" },
      { key: "cirugias", label: "Cirugias" },
      { key: "hospitalizaciones", label: "Hospitalizaciones" },
      { key: "transfusiones", label: "Transfusiones" },
      { key: "traumatismos", label: "Traumatismos" },
      { key: "infecciosas", label: "Infecciosas relevantes" }
    ]
  },
  {
    key: "gyneco",
    title: "Antecedentes ginecoobstetricos",
    fields: [
      { key: "menarca", label: "Menarca" },
      { key: "fum", label: "FUM (ultima menstruacion)" },
      { key: "ciclo", label: "Ciclo" },
      { key: "ivsa", label: "IVSA" },
      { key: "mpf", label: "Metodo de planificacion" },
      { key: "gestas", label: "Gestas" },
      { key: "partos", label: "Partos" },
      { key: "cesareas", label: "Cesareas" },
      { key: "abortos", label: "Abortos" },
      { key: "papanicolau", label: "Ultimo Papanicolau" },
      { key: "mastografia", label: "Ultima mastografia" }
    ]
  },
  {
    key: "andro",
    title: "Antecedentes andrologicos",
    fields: [
      { key: "ivsa", label: "IVSA" },
      { key: "etsPrevias", label: "ETS previas" },
      { key: "sintomasProstaticos", label: "Sintomas prostaticos" },
      { key: "disfuncionErectil", label: "Disfuncion erectil" },
      { key: "urologicos", label: "Antecedentes urologicos" },
      { key: "vasectomia", label: "Vasectomia" },
      { key: "psa", label: "PSA (ultimo valor)" }
    ]
  }
];

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function valueForField(container: Record<string, unknown>, field: FieldDef): string {
  const raw = cleanText(container[field.key]);
  if (field.key === "sex") {
    return SEX_LABELS[raw] ?? raw;
  }
  return raw;
}

function rowsFromGroup(group: GroupDef, parsed: Record<string, unknown>): MedicalHistoryRow[] {
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
