import { MedicalSpecialty } from "@prisma/client";

export type EncounterSectionEntries = ReadonlyArray<readonly [string, string]>;

export interface SpecialtyTemplate {
  key: MedicalSpecialty;
  label: string;
  reviewOfSystems: EncounterSectionEntries;
  physicalExam: EncounterSectionEntries;
  diagnosticPlan: EncounterSectionEntries;
  treatmentPlan: EncounterSectionEntries;
}

export const SPECIALTY_TRANSLATIONS: Record<MedicalSpecialty, string> = {
  FAMILY_MEDICINE: "Medicina Familiar / General",
  PEDIATRICS: "Pediatría",
  GYNECOLOGY_OBSTETRICS: "Ginecología y Obstetricia",
  DERMATOLOGY: "Dermatología",
  CARDIOLOGY: "Cardiología",
  MENTAL_HEALTH: "Psiquiatría y Salud Mental",
  DENTISTRY: "Odontología",
  OPHTHALMOLOGY: "Oftalmología",
};

export const SPECIALTY_TEMPLATES: Record<MedicalSpecialty, SpecialtyTemplate> = {
  FAMILY_MEDICINE: {
    key: "FAMILY_MEDICINE",
    label: SPECIALTY_TRANSLATIONS.FAMILY_MEDICINE,
    reviewOfSystems: [
      ["respiratorio", "Respiratorio"],
      ["cardiovascular", "Cardiovascular"],
      ["digestivo", "Digestivo"],
      ["genitourinario", "Genitourinario"],
      ["musculoesqueletico", "Musculoesquelético"],
      ["neurologico", "Neurológico"],
      ["endocrino", "Endocrino"],
      ["piel", "Piel y tegumentos"],
      ["preventivo", "Preventivo y Tamizajes"],
      ["factoresRiesgo", "Factores de Riesgo"],
    ],
    physicalExam: [
      ["general", "General"],
      ["cabezaCuello", "Cabeza y cuello"],
      ["cardiopulmonar", "Cardiopulmonar"],
      ["abdomen", "Abdomen"],
      ["extremidades", "Extremidades"],
      ["neurologico", "Neurológico"],
      ["piel", "Piel y tegumentos"],
      ["otros", "Otros hallazgos"],
    ],
    diagnosticPlan: [
      ["laboratorios", "Laboratorios"],
      ["gabinete", "Imagen / Gabinete"],
      ["interconsultas", "Interconsultas"],
    ],
    treatmentPlan: [
      ["farmacologico", "Farmacológico"],
      ["no_farmacologico", "No farmacológico"],
      ["preventivo", "Plan Preventivo"],
      ["educacion", "Educación al paciente"],
    ],
  },
  PEDIATRICS: {
    key: "PEDIATRICS",
    label: SPECIALTY_TRANSLATIONS.PEDIATRICS,
    reviewOfSystems: [
      ["hitosDesarrollo", "Hitos de desarrollo"],
      ["vacunacion", "Vacunación"],
      ["alimentacion", "Alimentación / Nutrición"],
      ["respiratorio", "Respiratorio"],
      ["digestivo", "Digestivo"],
      ["otrosSistemas", "Otros sistemas"],
    ],
    physicalExam: [
      ["general", "General y Estado de alerta"],
      ["cabezaCuello", "Cabeza, cuello y fontanelas"],
      ["cardiopulmonar", "Cardiopulmonar"],
      ["abdomen", "Abdomen"],
      ["genitales", "Genitales"],
      ["neurologico", "Neurológico y Reflejos"],
      ["musculoesqueletico", "Musculoesquelético"],
      ["piel", "Piel"],
      ["alertas", "Alertas pediátricas"],
    ],
    diagnosticPlan: [
      ["laboratorios", "Laboratorios"],
      ["gabinete", "Imagen / Gabinete"],
      ["tamizajes", "Tamizajes (Neonatal/Auditivo/Visual)"],
      ["interconsultas", "Interconsultas"],
    ],
    treatmentPlan: [
      ["farmacologico", "Farmacológico"],
      ["nutricion", "Plan nutricional"],
      ["estimulacion", "Estimulación temprana"],
      ["educacion", "Educación a los padres"],
    ],
  },
  GYNECOLOGY_OBSTETRICS: {
    key: "GYNECOLOGY_OBSTETRICS",
    label: SPECIALTY_TRANSLATIONS.GYNECOLOGY_OBSTETRICS,
    reviewOfSystems: [
      ["antecedentesGO", "Antecedentes Gineco-Obstétricos"],
      ["fumFpp", "FUM / FPP / SDG"],
      ["controlPrenatal", "Control Prenatal"],
      ["sangrado", "Sangrado transvaginal"],
      ["flujo", "Flujo vaginal"],
      ["dolor", "Dolor pélvico"],
      ["otrosSistemas", "Otros sistemas"],
    ],
    physicalExam: [
      ["general", "General"],
      ["mamas", "Exploración de mamas"],
      ["abdomen", "Abdomen (Fondo uterino, FCF, Actividad uterina)"],
      ["especuloscopia", "Especuloscopía"],
      ["tactoVaginal", "Tacto vaginal"],
      ["extremidades", "Extremidades"],
    ],
    diagnosticPlan: [
      ["laboratorios", "Laboratorios"],
      ["ultrasonido", "Ultrasonido"],
      ["tamizajes", "Papanicolaou / Mastografía / Tamiz"],
      ["interconsultas", "Interconsultas"],
    ],
    treatmentPlan: [
      ["farmacologico", "Farmacológico"],
      ["suplementacion", "Suplementación"],
      ["planParto", "Plan de resolución de embarazo"],
      ["educacion", "Educación y Prevención"],
    ],
  },
  DERMATOLOGY: {
    key: "DERMATOLOGY",
    label: SPECIALTY_TRANSLATIONS.DERMATOLOGY,
    reviewOfSystems: [
      ["tiempoEvolucion", "Tiempo de evolución"],
      ["sintomasAcompanantes", "Síntomas acompañantes (Prurito/Ardor/Dolor)"],
      ["tratamientosPrevios", "Tratamientos previos"],
      ["antecedentesPersonales", "Antecedentes personales"],
      ["antecedentesFamiliares", "Antecedentes familiares"],
      ["otrosSistemas", "Otros sistemas"],
    ],
    physicalExam: [
      ["general", "General"],
      ["topografia", "Topografía (Mapa descriptivo de lesiones)"],
      ["morfologia", "Morfología (Tipo de lesión, color, bordes)"],
      ["dermoscopia", "Hallazgos por Dermoscopia"],
      ["anexos", "Anexos (Pelo y Uñas)"],
      ["mucosas", "Mucosas"],
    ],
    diagnosticPlan: [
      ["biopsia", "Biopsia / Toma de muestra"],
      ["luzWood", "Lámpara de Wood"],
      ["laboratorios", "Laboratorios"],
      ["interconsultas", "Interconsultas"],
    ],
    treatmentPlan: [
      ["topico", "Tratamiento Tópico"],
      ["sistemico", "Tratamiento Sistémico"],
      ["procedimientos", "Procedimientos Quirúrgicos / Estéticos"],
      ["cuidadosGenerales", "Cuidados Generales y Skincare"],
    ],
  },
  CARDIOLOGY: {
    key: "CARDIOLOGY",
    label: SPECIALTY_TRANSLATIONS.CARDIOLOGY,
    reviewOfSystems: [
      ["sintomasCardinales", "Síntomas Cardinales (Angina, Disnea, Síncope, Palpitaciones)"],
      ["factoresCV", "Factores de Riesgo Cardiovascular"],
      ["capacidadFuncional", "Capacidad Funcional (NYHA/CCS)"],
      ["respiratorio", "Respiratorio"],
      ["otrosSistemas", "Otros sistemas"],
    ],
    physicalExam: [
      ["general", "General"],
      ["signosVitalesAvanzados", "Análisis de Signos Vitales y Pulsos"],
      ["cuello", "Cuello (Ingurgitación yeyular, Soplos carotídeos)"],
      ["torax", "Tórax (Ruidos cardíacos, Soplos)"],
      ["pulmones", "Campos pulmonares"],
      ["abdomen", "Abdomen"],
      ["extremidades", "Extremidades (Edema)"],
      ["escalasRiesgo", "Escalas de Riesgo (TIMI, GRACE, ASCVD)"],
    ],
    diagnosticPlan: [
      ["ecg", "Electrocardiograma de Reposo"],
      ["ecocardiograma", "Ecocardiograma"],
      ["holterMAPA", "Holter / MAPA"],
      ["pruebaEsfuerzo", "Prueba de Esfuerzo / Medicina Nuclear"],
      ["laboratorios", "Laboratorios (Biomarcadores, Lípidos)"],
    ],
    treatmentPlan: [
      ["farmacologico", "Farmacológico"],
      ["intervencionismo", "Plan de Intervencionismo / Cirugía"],
      ["rehabilitacion", "Rehabilitación Cardíaca"],
      ["educacion", "Educación y Dieta"],
    ],
  },
  MENTAL_HEALTH: {
    key: "MENTAL_HEALTH",
    label: SPECIALTY_TRANSLATIONS.MENTAL_HEALTH,
    reviewOfSystems: [
      ["motivoConsulta", "Motivo de consulta principal"],
      ["historiaEnfermedad", "Historia de la enfermedad actual"],
      ["antecedentesPsiquiatricos", "Antecedentes psiquiátricos"],
      ["sustancias", "Consumo de sustancias"],
      ["phq9_gad7", "Escalas (PHQ-9, GAD-7, etc.)"],
      ["riesgo", "Riesgo autolítico o heteroagresivo"],
      ["suenoApetito", "Patrones de sueño y apetito"],
    ],
    physicalExam: [
      ["aspectoGeneral", "Aspecto y Actitud General"],
      ["psicomotricidad", "Psicomotricidad"],
      ["lenguaje", "Lenguaje"],
      ["afecto", "Afecto y Ánimo"],
      ["pensamiento", "Forma y Contenido del Pensamiento"],
      ["percepcion", "Percepción"],
      ["sensorioCognicion", "Sensorio y Cognición"],
      ["juicio", "Juicio e Introspección"],
    ],
    diagnosticPlan: [
      ["laboratorios", "Laboratorios y Gabinete"],
      ["psicologia", "Valoración por Psicología / Neuropsicología"],
      ["escalasDiagnosticas", "Otras escalas diagnósticas"],
      ["interconsultas", "Interconsultas"],
    ],
    treatmentPlan: [
      ["psicofarmacologico", "Tratamiento Psicofarmacológico"],
      ["psicoterapia", "Recomendaciones Psicoterapéuticas"],
      ["psicoeducacion", "Psicoeducación"],
      ["seguimiento", "Plan de seguimiento de riesgo"],
    ],
  },
  DENTISTRY: {
    key: "DENTISTRY",
    label: SPECIALTY_TRANSLATIONS.DENTISTRY,
    reviewOfSystems: [
      ["motivoConsulta", "Motivo de Consulta Dental"],
      ["dolorDental", "Dolor (Características e intensidad)"],
      ["sangradoGingival", "Sangrado gingival"],
      ["habitos", "Hábitos parafuncionales"],
      ["antecedentesSistemicos", "Antecedentes Sistémicos Relevantes"],
    ],
    physicalExam: [
      ["exploracionExtraoral", "Exploración Extraoral (ATM, Ganglios, Simetría)"],
      ["exploracionIntraoral", "Exploración Intraoral (Tejidos blandos, Mucosas)"],
      ["odontograma_descriptivo", "Odontograma Descriptivo (Caries, Restauraciones)"],
      ["periodontograma_descriptivo", "Periodontograma Descriptivo (Bolsas, Movilidad)"],
      ["oclusion", "Oclusión y Alineación"],
    ],
    diagnosticPlan: [
      ["radiografias", "Radiografías (Periapical, Panorámica)"],
      ["modelosEstudio", "Modelos de Estudio / Escaneo 3D"],
      ["tomografia", "Tomografía (CBCT)"],
      ["otros", "Fotografías Clínicas / Otros"],
    ],
    treatmentPlan: [
      ["preventivo", "Tratamiento Preventivo (Limpieza, Flúor)"],
      ["operatoriaRestauradora", "Operatoria y Restauradora"],
      ["endodoncia", "Endodoncia"],
      ["periodoncia", "Periodoncia"],
      ["cirugia", "Cirugía Oral"],
      ["farmacologico", "Receta Farmacológica"],
    ],
  },
  OPHTHALMOLOGY: {
    key: "OPHTHALMOLOGY",
    label: SPECIALTY_TRANSLATIONS.OPHTHALMOLOGY,
    reviewOfSystems: [
      ["agudezaVisualSubjetiva", "Cambios en Agudeza Visual"],
      ["ojoRojo", "Ojo Rojo / Secreción"],
      ["dolorOcular", "Dolor Ocular"],
      ["fotopsiasMiodesopsias", "Fotopsias / Miodesopsias"],
      ["antecedentesOculares", "Antecedentes Oculares"],
      ["antecedentesSistemicos", "Antecedentes Sistémicos Relevantes"],
    ],
    physicalExam: [
      ["agudezaVisualOD", "Agudeza Visual OD (Ojo Derecho)"],
      ["agudezaVisualOI", "Agudeza Visual OI (Ojo Izquierdo)"],
      ["refraccion", "Refracción"],
      ["pio", "PIO (Presión Intraocular)"],
      ["anexosOculares", "Anexos Oculares (Párpados, Vía Lagrimal)"],
      ["segmentoAnterior", "Segmento Anterior (Córnea, Cristalino)"],
      ["fondoOjo", "Fondo de Ojo / Segmento Posterior"],
      ["motilidadOcular", "Motilidad Ocular / Pupilas"],
    ],
    diagnosticPlan: [
      ["oct", "Tomografía de Coherencia Óptica (OCT)"],
      ["campimetria", "Campimetría"],
      ["topografia", "Topografía Corneal"],
      ["fluorangiografia", "Fluorangiografía"],
      ["laboratorios", "Laboratorios / Gabinete"],
    ],
    treatmentPlan: [
      ["topico", "Tratamiento Tópico (Gotas / Ungüentos)"],
      ["sistemico", "Tratamiento Sistémico"],
      ["laser", "Tratamiento Láser"],
      ["cirugia", "Tratamiento Quirúrgico"],
      ["lentes", "Prescripción Óptica"],
    ],
  },
};

export function resolveSpecialtyTemplate(specialty: MedicalSpecialty | null | undefined): SpecialtyTemplate {
  if (!specialty || !SPECIALTY_TEMPLATES[specialty]) {
    return SPECIALTY_TEMPLATES.FAMILY_MEDICINE;
  }
  return SPECIALTY_TEMPLATES[specialty];
}

export function formatSpecialty(specialty: string | null | undefined): string {
  if (!specialty) return "Médico Especialista";
  return SPECIALTY_TRANSLATIONS[specialty as MedicalSpecialty] || specialty;
}
