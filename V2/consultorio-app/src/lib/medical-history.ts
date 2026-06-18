import { z } from "zod";

/**
 * Contrato compartido del cuestionario de historia clinica que el paciente puede
 * contestar antes de la consulta. Es la fuente de verdad de los campos: el
 * formulario publico y la vista del medico se construyen sobre estos grupos.
 * CLINICO: las respuestas viajan SIEMPRE selladas (sealed box X25519) hacia la
 * app del medico; la nube nunca las ve en claro (paso 19).
 *
 * Todos los campos son opcionales: se le recomienda enormemente al paciente
 * contestarlo, pero nunca es obligatorio. Lo que no conteste en casa, el medico
 * lo terminara de llenar en la consulta.
 *
 * Convencion: las etiquetas son ASCII (sin acentos), igual que el resto del
 * codigo, para evitar problemas de codificacion. Este archivo se ESPEJA a mano en
 * `desktop-app/src/medicalHistoryFormat.ts` (apps separadas, sin paquete comun):
 * cualquier cambio aqui debe replicarse alli.
 */

export const BIOLOGICAL_SEX = ["", "F", "M"] as const;
export type BiologicalSex = (typeof BIOLOGICAL_SEX)[number];

/** Modo de captura de un campo. Determina el control en el formulario y el
 *  formato de presentacion; el almacenamiento siempre es texto en el JSON. */
export type FieldKind = "text" | "textarea" | "number" | "date" | "select" | "yesno";

export type FieldOption = { value: string; label: string };

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  /** Sufijo/unidad mostrado junto al control (p.ej. "veces/sem", "anios"). */
  suffix?: string;
  /** Opciones para `kind: "select"`. */
  options?: FieldOption[];
  min?: number;
  max?: number;
  /** Solo se muestra si otro campo del mismo grupo tiene uno de estos valores. */
  showWhen?: { field: string; equals: string | string[] };
};

export type BlockDef = {
  title: string;
  onlyForSex?: Exclude<BiologicalSex, "">;
  fields: FieldDef[];
};

/** A quien le toca capturar la seccion. El formulario publico omite "doctor". */
export type GroupAudience = "patient" | "doctor" | "both";

export type GroupDef = {
  key: string;
  title: string;
  onlyForSex?: Exclude<BiologicalSex, "">;
  audience?: GroupAudience;
  /** Un grupo usa `fields` (plano) o `blocks` (con sub-encabezados). */
  fields?: FieldDef[];
  blocks?: BlockDef[];
};

/* ---------- Heredo-familiares (estructura por padecimiento) ---------- */

export const FAMILY_RELATIVES: readonly FieldOption[] = [
  { value: "abueloPaterno", label: "Abuelo paterno" },
  { value: "abuelaPaterna", label: "Abuela paterna" },
  { value: "abueloMaterno", label: "Abuelo materno" },
  { value: "abuelaMaterna", label: "Abuela materna" },
  { value: "padre", label: "Padre" },
  { value: "madre", label: "Madre" },
  { value: "hermanos", label: "Hermanos" },
  { value: "tios", label: "Tios" }
];

export type FamilyConditionDef = { key: string; label: string; hasType?: boolean };

export const FAMILY_CONDITIONS: readonly FamilyConditionDef[] = [
  { key: "diabetes", label: "Diabetes" },
  { key: "hipertension", label: "Hipertension arterial" },
  { key: "cardiopatia", label: "Infarto / enfermedad cardiaca" },
  { key: "evc", label: "Derrame cerebral / embolia / EVC" },
  { key: "dislipidemia", label: "Colesterol o trigliceridos altos" },
  { key: "obesidad", label: "Obesidad" },
  { key: "renal", label: "Enfermedad renal cronica / dialisis" },
  { key: "cancer", label: "Cancer", hasType: true },
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

const RELATION_OPTIONS: FieldOption[] = [
  { value: "padre", label: "Padre" },
  { value: "madre", label: "Madre" },
  { value: "hijo", label: "Hijo/a" },
  { value: "pareja", label: "Pareja" },
  { value: "hermano", label: "Hermano/a" },
  { value: "otro", label: "Otro" }
];

const SI_NO = "si";

/** Bloque de sub-preguntas para una enfermedad cronica del apartado patologico. */
function chronicDiseaseBlock(
  title: string,
  key: string,
  question: string,
  extra: FieldDef[] = []
): BlockDef {
  const reveal = { field: key, equals: SI_NO };
  return {
    title,
    fields: [
      { key, label: question, kind: "yesno" },
      { key: `${key}Desde`, label: "Desde cuando", kind: "text", showWhen: reveal },
      ...extra.map((field) => ({ ...field, showWhen: reveal })),
      { key: `${key}Medicamento`, label: "Con que medicamento se controla", kind: "text", showWhen: reveal },
      { key: `${key}Complicaciones`, label: "Ha presentado alguna complicacion", kind: "text", showWhen: reveal }
    ]
  };
}

/** Bloque "tienes <X>?" para el interrogatorio por aparatos y sistemas (medico). */
function symptomFields(items: Array<[string, string]>): FieldDef[] {
  return items.map(([key, label]) => ({ key, label, kind: "yesno" as FieldKind }));
}

/**
 * Grupos del cuestionario en orden de captura. Las ramas condicionales (por sexo
 * y por respuesta previa) se controlan con `onlyForSex` y `showWhen`.
 */
export const MEDICAL_HISTORY_GROUPS: readonly GroupDef[] = [
  {
    key: "identification",
    title: "Ficha de identificacion",
    fields: [
      { key: "apellidoPaterno", label: "Apellido paterno", kind: "text" },
      { key: "apellidoMaterno", label: "Apellido materno", kind: "text" },
      { key: "fechaNacimiento", label: "Fecha de nacimiento", kind: "date" },
      { key: "lugarNacimiento", label: "Lugar de nacimiento", kind: "text" },
      { key: "estadoCivil", label: "Estado civil", kind: "text" },
      { key: "ocupacion", label: "Ocupacion", kind: "text" },
      { key: "bloodType", label: "Grupo sanguineo", kind: "text", placeholder: "Ej. O+" },
      { key: "municipio", label: "Municipio", kind: "text" },
      { key: "estado", label: "Estado", kind: "text" },
      { key: "calle", label: "Calle", kind: "text" },
      { key: "numero", label: "Numero", kind: "text" },
      { key: "codigoPostal", label: "Codigo postal", kind: "text" },
      { key: "telefono", label: "Telefono", kind: "text" }
    ]
  },
  {
    key: "emergencyContact",
    title: "Contacto de emergencia",
    fields: [
      { key: "nombre", label: "Nombre del contacto", kind: "text" },
      { key: "telefono", label: "Telefono del contacto", kind: "text" },
      { key: "relacion", label: "Relacion con el contacto", kind: "select", options: RELATION_OPTIONS }
    ]
  },
  // familyHistory: estructura especial (por padecimiento), no usa fields/blocks.
  // Se valida y renderiza aparte (ver FAMILY_CONDITIONS / familyHistorySchema).
  {
    key: "familyHistory",
    title: "Antecedentes heredo-familiares"
  },
  {
    key: "nonPathological",
    title: "Antecedentes personales no patologicos",
    blocks: [
      {
        title: "Habitos higienicos (veces por semana)",
        fields: [
          { key: "banoDiario", label: "Bano", kind: "number", suffix: "veces/sem", min: 0, max: 21 },
          { key: "aseoBucal", label: "Aseo bucal", kind: "number", suffix: "veces/sem", min: 0, max: 35 },
          { key: "cambioRopa", label: "Cambio de ropa", kind: "number", suffix: "veces/sem", min: 0, max: 21 }
        ]
      },
      {
        title: "Habitos alimenticios (veces por semana)",
        fields: [
          { key: "leche", label: "Leche", kind: "number", suffix: "veces/sem", min: 0, max: 35 },
          { key: "carne", label: "Carne", kind: "number", suffix: "veces/sem", min: 0, max: 35 },
          { key: "huevos", label: "Huevos", kind: "number", suffix: "veces/sem", min: 0, max: 35 },
          { key: "verduras", label: "Verduras", kind: "number", suffix: "veces/sem", min: 0, max: 35 },
          { key: "frutas", label: "Frutas", kind: "number", suffix: "veces/sem", min: 0, max: 35 },
          { key: "cereales", label: "Cereales", kind: "number", suffix: "veces/sem", min: 0, max: 35 },
          { key: "leguminosas", label: "Leguminosas", kind: "number", suffix: "veces/sem", min: 0, max: 35 }
        ]
      },
      {
        title: "Inmunizaciones (fecha o anio)",
        fields: [
          { key: "antitetanica", label: "Antitetanica", kind: "date" },
          { key: "antisarampion", label: "Antisarampion", kind: "date" },
          { key: "antirubeola", label: "Antirubeola", kind: "date" },
          { key: "antihepatica", label: "Antihepatica", kind: "date" },
          { key: "desparasitacion", label: "Desparasitacion", kind: "date" }
        ]
      },
      {
        title: "Alcoholismo",
        fields: [
          { key: "alcohol", label: "Consume alcohol", kind: "yesno" },
          { key: "alcoholEdadInicio", label: "A que edad empezo a tomar", kind: "number", suffix: "anios", showWhen: { field: "alcohol", equals: SI_NO } },
          { key: "alcoholCantidad", label: "Que cantidad de bebidas ingiere", kind: "text", showWhen: { field: "alcohol", equals: SI_NO } }
        ]
      },
      {
        title: "Tabaquismo y toxicomanias",
        fields: [
          { key: "tabaco", label: "Fuma", kind: "yesno" },
          { key: "tabacoEdadInicio", label: "A que edad empezo a fumar", kind: "number", suffix: "anios", showWhen: { field: "tabaco", equals: SI_NO } },
          { key: "tabacoCigarrosDia", label: "Cuantos cigarros fuma al dia", kind: "number", showWhen: { field: "tabaco", equals: SI_NO } },
          { key: "otrasToxicomanias", label: "Otras toxicomanias", kind: "text" }
        ]
      },
      {
        title: "Vivienda",
        fields: [
          {
            key: "tenencia",
            label: "La casa donde vive es",
            kind: "select",
            options: [
              { value: "propia", label: "Propia" },
              { value: "rentada", label: "Rentada" },
              { value: "prestada", label: "Prestada" }
            ]
          },
          { key: "personasCasa", label: "Cuantas personas habitan la casa", kind: "number", min: 1 },
          { key: "habitaciones", label: "Cuantas habitaciones tiene", kind: "number", min: 0 },
          { key: "aguaPotable", label: "Cuenta con agua potable", kind: "yesno" },
          { key: "drenaje", label: "Cuenta con drenaje", kind: "yesno" },
          { key: "animales", label: "Animales en casa (cuales y cuantos)", kind: "text" }
        ]
      },
      {
        title: "Vida sexual",
        fields: [
          { key: "vidaSexualActiva", label: "Ha tenido relaciones sexuales", kind: "yesno" },
          { key: "vidaSexualEdadInicio", label: "A que edad inicio", kind: "number", suffix: "anios", showWhen: { field: "vidaSexualActiva", equals: SI_NO } },
          { key: "vidaSexualFrecuencia", label: "Con que frecuencia", kind: "text", showWhen: { field: "vidaSexualActiva", equals: SI_NO } },
          { key: "vidaSexualParejas", label: "Cuantas parejas ha tenido", kind: "number", showWhen: { field: "vidaSexualActiva", equals: SI_NO } },
          { key: "vidaSexualSexoservidoras", label: "Con sexoservidoras", kind: "yesno", showWhen: { field: "vidaSexualActiva", equals: SI_NO } },
          { key: "vidaSexualProteccion", label: "Usa proteccion (cual)", kind: "text", showWhen: { field: "vidaSexualActiva", equals: SI_NO } }
        ]
      }
    ]
  },
  {
    key: "gyneco",
    title: "Antecedentes gineco-obstetricos",
    onlyForSex: "F",
    fields: [
      { key: "menarca", label: "A que edad fue tu primera menstruacion", kind: "number", suffix: "anios" },
      { key: "ciclo", label: "Cada cuantos dias y cuantos dura", kind: "text" },
      { key: "dismenorrea", label: "Presentas dolor", kind: "yesno" },
      { key: "dismenorreaMedicamento", label: "Te obliga a tomar medicamentos", kind: "yesno", showWhen: { field: "dismenorrea", equals: SI_NO } },
      { key: "embarazos", label: "Te has embarazado", kind: "yesno" },
      { key: "gestas", label: "Cuantos embarazos", kind: "number", showWhen: { field: "embarazos", equals: SI_NO } },
      { key: "abortos", label: "Abortos", kind: "number", showWhen: { field: "embarazos", equals: SI_NO } },
      { key: "complicacionesObst", label: "Complicaciones", kind: "text", showWhen: { field: "embarazos", equals: SI_NO } },
      { key: "fum", label: "Fecha de ultima regla", kind: "date" }
    ]
  },
  {
    key: "pathological",
    title: "Antecedentes personales patologicos",
    blocks: [
      {
        title: "Quirurgicos",
        fields: [
          { key: "cirugia", label: "Te han intervenido quirurgicamente", kind: "yesno" },
          { key: "cirugiaDeQue", label: "De que", kind: "text", showWhen: { field: "cirugia", equals: SI_NO } },
          { key: "cirugiaFecha", label: "En que fecha", kind: "text", showWhen: { field: "cirugia", equals: SI_NO } },
          { key: "cirugiaComplicaciones", label: "Complicaciones", kind: "text", showWhen: { field: "cirugia", equals: SI_NO } }
        ]
      },
      {
        title: "Transfusiones",
        fields: [
          { key: "transfusion", label: "Te han transfundido alguna vez", kind: "yesno" },
          { key: "transfusionMotivo", label: "Motivo", kind: "text", showWhen: { field: "transfusion", equals: SI_NO } },
          { key: "transfusionFecha", label: "En que fecha", kind: "text", showWhen: { field: "transfusion", equals: SI_NO } },
          { key: "transfusionComplicaciones", label: "Existieron complicaciones", kind: "text", showWhen: { field: "transfusion", equals: SI_NO } }
        ]
      },
      {
        title: "Alergias",
        fields: [
          { key: "alergia", label: "Ha presentado alguna reaccion alergica", kind: "yesno" },
          { key: "alergiaFecha", label: "En que fecha", kind: "text", showWhen: { field: "alergia", equals: SI_NO } },
          { key: "alergiaA", label: "A algun alimento, medicamento, sustancia, etc.", kind: "text", showWhen: { field: "alergia", equals: SI_NO } }
        ]
      },
      chronicDiseaseBlock("Diabetes", "diabetico", "Eres diabetico"),
      chronicDiseaseBlock("Hipertension", "hipertenso", "Eres hipertenso"),
      chronicDiseaseBlock("Convulsiones", "convulsiones", "Presentas convulsiones", [
        { key: "convulsionesOcasiona", label: "Que las ocasiona", kind: "text" }
      ])
    ]
  },
  {
    key: "systemsReview",
    title: "Interrogatorio por aparatos y sistemas",
    audience: "doctor",
    blocks: [
      {
        title: "Sistema digestivo",
        fields: [
          ...symptomFields([
            ["digFrecuentesDolores", "Tienes frecuentes dolores de estomago"],
            ["digEstrenimiento", "Tienes estrenimiento"],
            ["digDiarrea", "Tienes diarrea"],
            ["digNauseas", "Tienes nauseas o vomito"],
            ["digAgruras", "Tienes agruras"]
          ]),
          { key: "digDesparasitado", label: "Te has desparasitado (cuando y con que)", kind: "text" }
        ]
      },
      {
        title: "Sistema respiratorio",
        fields: symptomFields([
          ["respTos", "Tienes frecuentemente tos"],
          ["respDolorPecho", "Tienes dolor de pecho"],
          ["respDolorEspalda", "Tienes dolor de espalda"]
        ])
      },
      {
        title: "Sistema circulatorio",
        fields: symptomFields([
          ["circPalpitaciones", "Tienes palpitaciones"],
          ["circFatiga", "Presentas fatiga al realizar esfuerzos fisicos"],
          ["circDolorPecho", "Tienes dolor de pecho"],
          ["circHinchazon", "Te has hinchado de cara, manos o piernas"],
          ["circMareos", "Tienes mareos"],
          ["circDolorCabeza", "Tienes dolor de cabeza frecuente"],
          ["circZumbido", "Tienes zumbido de oidos"],
          ["circAdormecimiento", "Tienes adormecimiento de alguna parte del cuerpo"],
          ["circCalambres", "Tienes calambres"]
        ])
      },
      {
        title: "Sistema genitourinario",
        fields: [
          ...symptomFields([
            ["genuMolestiaOrinar", "Tienes alguna molestia para orinar"],
            ["genuArdor", "Ardor, mal olor, aumento en el numero de veces al orinar"],
            ["genuDolorOrinar", "Dolor al orinar"],
            ["genuDolorRelaciones", "Dolor al tener relaciones sexuales"],
            ["genuSecreciones", "Secreciones por genitales"]
          ]),
          { key: "genuColor", label: "Color, cantidad, olor", kind: "text" },
          { key: "genuAnticonceptivo", label: "Utilizas algun metodo anticonceptivo", kind: "yesno" },
          { key: "genuAnticonceptivoCual", label: "Cual metodo", kind: "text", showWhen: { field: "genuAnticonceptivo", equals: SI_NO } },
          { key: "genuAnticonceptivoDesde", label: "Desde cuando", kind: "text", showWhen: { field: "genuAnticonceptivo", equals: SI_NO } }
        ]
      },
      {
        title: "Sistema nervioso",
        fields: [
          { key: "nervDuermesBien", label: "Duermes bien", kind: "yesno" },
          { key: "nervHorasDuermes", label: "Cuantas horas duermes", kind: "number", suffix: "horas" },
          ...symptomFields([
            ["nervVision", "Tienes problemas de vision"],
            ["nervAudicion", "Tienes problemas de audicion"],
            ["nervOlfato", "Tienes problemas de olfato"]
          ])
        ]
      },
      {
        title: "Sistema musculo esqueletico",
        fields: symptomFields([
          ["muscDoloresArticulares", "Tienes dolores articulares"],
          ["muscDoloresMusculares", "Tienes dolores musculares"]
        ])
      },
      {
        title: "Embarazo",
        onlyForSex: "F",
        fields: [
          { key: "embFur", label: "Fecha de ultima regla", kind: "date" },
          { key: "embProbableParto", label: "Fecha probable de parto", kind: "date" },
          { key: "embSemanas", label: "Semanas de embarazo", kind: "number", suffix: "sem" },
          { key: "embSintomas", label: "Sintomas", kind: "textarea" },
          { key: "embAntecedentes", label: "Antecedentes de importancia", kind: "textarea" }
        ]
      }
    ]
  }
];

/** Devuelve los campos planos de un grupo (sea con `fields` o con `blocks`). */
export function groupFields(group: GroupDef): FieldDef[] {
  if (group.fields) return group.fields;
  if (group.blocks) return group.blocks.flatMap((block) => block.fields);
  return [];
}

/** Grupos que el paciente contesta en el portal (omite los de audiencia medica). */
export function patientGroups(sex: BiologicalSex): GroupDef[] {
  return MEDICAL_HISTORY_GROUPS.filter(
    (group) =>
      group.audience !== "doctor" && (!group.onlyForSex || group.onlyForSex === sex)
  );
}

/* ---------- Esquema Zod ---------- */

/** Limite por campo: evita sobres gigantes y abusos del buzon. */
const FIELD_MAX = 2000;
const freeText = z.string().trim().max(FIELD_MAX).optional();

function groupSchema(group: GroupDef) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of groupFields(group)) {
    shape[field.key] = freeText;
  }
  return z.object(shape).partial();
}

const relativeValues = FAMILY_RELATIVES.map((relative) => relative.value) as [
  string,
  ...string[]
];

const familyConditionEntry = z
  .object({
    relatives: z.array(z.enum(relativeValues)).optional(),
    type: freeText,
    notes: freeText
  })
  .partial();

const familyHistorySchema = z
  .object(
    Object.fromEntries(
      FAMILY_CONDITIONS.map((condition) => [condition.key, familyConditionEntry.optional()])
    )
  )
  .partial();

function schemaForGroup(group: GroupDef): z.ZodTypeAny {
  if (group.key === "familyHistory") return familyHistorySchema.optional();
  return groupSchema(group).optional();
}

/**
 * Esquema Zod del payload. Se valida en el cliente antes de sellar y en la app
 * del medico al descifrar; la nube nunca lo ve. Cada grupo es opcional.
 */
export const medicalHistorySchema = z.object({
  sex: z.enum(BIOLOGICAL_SEX).optional(),
  allergies: freeText,
  currentMedications: freeText,
  ...Object.fromEntries(
    MEDICAL_HISTORY_GROUPS.map((group) => [group.key, schemaForGroup(group)])
  )
});

export type MedicalHistoryPayload = z.infer<typeof medicalHistorySchema>;

/** Marca que viaja en el meta del sobre sellado para distinguir el tipo. */
export const MEDICAL_HISTORY_ENVELOPE_KIND = "medical-history" as const;
