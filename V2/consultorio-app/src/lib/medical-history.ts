import { z } from "zod";

/**
 * Contrato compartido del formulario de antecedentes (historia clinica) que el
 * paciente puede contestar antes de la consulta. Es la fuente de verdad de los
 * campos: el formulario publico y la vista del medico se construyen sobre estos
 * grupos. CLINICO: las respuestas viajan SIEMPRE selladas (sealed box X25519)
 * hacia la app del medico; la nube nunca las ve en claro (paso 19, rebanada 7).
 *
 * Todos los campos son opcionales: lo que el paciente no conteste en casa, el
 * medico lo terminara de llenar en la consulta.
 */

export const BIOLOGICAL_SEX = ["", "F", "M"] as const;
export type BiologicalSex = (typeof BIOLOGICAL_SEX)[number];

/** Un campo de texto libre con su etiqueta y modo de captura. */
export type FieldKind = "text" | "textarea";

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
};

export type GroupDef = {
  key: string;
  title: string;
  /** Solo se muestra cuando el sexo biologico capturado coincide. */
  onlyForSex?: Exclude<BiologicalSex, "">;
  fields: FieldDef[];
};

/**
 * Grupos del formulario en orden de captura. La rama gineco/andrologica se
 * muestra de forma condicional segun el sexo biologico.
 */
export const MEDICAL_HISTORY_GROUPS: readonly GroupDef[] = [
  {
    key: "identification",
    title: "Identificacion",
    fields: [
      { key: "gender", label: "Genero", kind: "text" },
      { key: "maritalStatus", label: "Estado civil", kind: "text" },
      { key: "occupation", label: "Ocupacion", kind: "text" },
      { key: "bloodType", label: "Grupo sanguineo", kind: "text", placeholder: "Ej. O+" }
    ]
  },
  {
    key: "familyHistory",
    title: "Antecedentes heredofamiliares",
    fields: [
      { key: "diabetes", label: "Diabetes", kind: "text", placeholder: "Ej. padre, madre" },
      { key: "hipertension", label: "Hipertension", kind: "text", placeholder: "Ej. padre, madre" },
      { key: "cardiopatia", label: "Cardiopatia", kind: "text" },
      { key: "cancer", label: "Cancer", kind: "text" },
      { key: "obesidad", label: "Obesidad", kind: "text" },
      { key: "dislipidemia", label: "Dislipidemia", kind: "text" },
      { key: "enfRenal", label: "Enfermedad renal", kind: "text" },
      { key: "enfTiroidea", label: "Enfermedad tiroidea", kind: "text" },
      { key: "autoinmunes", label: "Autoinmunes", kind: "text" },
      { key: "psiquiatricos", label: "Psiquiatricos", kind: "text" },
      { key: "trombosis", label: "Trombosis", kind: "text" },
      { key: "otros", label: "Otros", kind: "text" }
    ]
  },
  {
    key: "nonPathological",
    title: "Antecedentes personales no patologicos",
    fields: [
      { key: "tabaquismo", label: "Tabaquismo", kind: "text" },
      { key: "alcohol", label: "Alcohol", kind: "text" },
      { key: "toxicomanias", label: "Toxicomanias", kind: "text" },
      { key: "actividadFisica", label: "Actividad fisica", kind: "text" },
      { key: "alimentacion", label: "Alimentacion", kind: "text" },
      { key: "inmunizaciones", label: "Inmunizaciones", kind: "text" },
      { key: "sueno", label: "Sueno", kind: "text" },
      { key: "viajesRecientes", label: "Viajes recientes", kind: "text" },
      { key: "contactoAnimales", label: "Contacto con animales", kind: "text" }
    ]
  },
  {
    key: "pathological",
    title: "Antecedentes personales patologicos",
    fields: [
      { key: "enfCronicas", label: "Enfermedades cronicas", kind: "textarea" },
      { key: "cirugias", label: "Cirugias", kind: "textarea" },
      { key: "hospitalizaciones", label: "Hospitalizaciones", kind: "textarea" },
      { key: "transfusiones", label: "Transfusiones", kind: "textarea" },
      { key: "traumatismos", label: "Traumatismos", kind: "textarea" },
      { key: "infecciosas", label: "Infecciosas relevantes", kind: "textarea" }
    ]
  },
  {
    key: "gyneco",
    title: "Antecedentes ginecoobstetricos",
    onlyForSex: "F",
    fields: [
      { key: "menarca", label: "Menarca", kind: "text" },
      { key: "fum", label: "FUM (ultima menstruacion)", kind: "text" },
      { key: "ciclo", label: "Ciclo", kind: "text" },
      { key: "ivsa", label: "IVSA", kind: "text" },
      { key: "mpf", label: "Metodo de planificacion", kind: "text" },
      { key: "gestas", label: "Gestas", kind: "text" },
      { key: "partos", label: "Partos", kind: "text" },
      { key: "cesareas", label: "Cesareas", kind: "text" },
      { key: "abortos", label: "Abortos", kind: "text" },
      { key: "papanicolau", label: "Ultimo Papanicolau", kind: "text" },
      { key: "mastografia", label: "Ultima mastografia", kind: "text" }
    ]
  },
  {
    key: "andro",
    title: "Antecedentes andrologicos",
    onlyForSex: "M",
    fields: [
      { key: "ivsa", label: "IVSA", kind: "text" },
      { key: "etsPrevias", label: "ETS previas", kind: "text" },
      { key: "sintomasProstaticos", label: "Sintomas prostaticos", kind: "text" },
      { key: "disfuncionErectil", label: "Disfuncion erectil", kind: "text" },
      { key: "urologicos", label: "Antecedentes urologicos", kind: "text" },
      { key: "vasectomia", label: "Vasectomia", kind: "text" },
      { key: "psa", label: "PSA (ultimo valor)", kind: "text" }
    ]
  }
];

/** Limite por campo: evita sobres gigantes y abusos del buzon. */
const FIELD_MAX = 2000;
const freeText = z.string().trim().max(FIELD_MAX).optional();

function groupSchema(group: GroupDef) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of group.fields) {
    shape[field.key] = freeText;
  }
  return z.object(shape).partial();
}

/**
 * Esquema Zod del payload de antecedentes. Se valida en el cliente antes de
 * sellar y en la app del medico al descifrar; la nube nunca lo ve.
 */
export const medicalHistorySchema = z.object({
  sex: z.enum(BIOLOGICAL_SEX).optional(),
  identification: groupSchema(MEDICAL_HISTORY_GROUPS[0]).optional(),
  familyHistory: groupSchema(MEDICAL_HISTORY_GROUPS[1]).optional(),
  nonPathological: groupSchema(MEDICAL_HISTORY_GROUPS[2]).optional(),
  pathological: groupSchema(MEDICAL_HISTORY_GROUPS[3]).optional(),
  gyneco: groupSchema(MEDICAL_HISTORY_GROUPS[4]).optional(),
  andro: groupSchema(MEDICAL_HISTORY_GROUPS[5]).optional(),
  allergies: z.string().trim().max(FIELD_MAX).optional(),
  currentMedications: z.string().trim().max(FIELD_MAX).optional()
});

export type MedicalHistoryPayload = z.infer<typeof medicalHistorySchema>;

/** Marca que viaja en el meta del sobre sellado para distinguir el tipo. */
export const MEDICAL_HISTORY_ENVELOPE_KIND = "medical-history" as const;
