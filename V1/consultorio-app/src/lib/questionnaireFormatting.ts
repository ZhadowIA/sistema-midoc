const SYMPTOM_CODE_LABELS: Record<string, string> = {
  DOLOR: "Dolor / Trauma físico",
  RESPIRATORIO: "Respiratorio / Gripe",
  DIGESTIVO: "Digestivo / Estómago",
  URINARIO: "Urinario / Vías bajas",
  CONTROL: "Chequeo / Control",
  OTRO: "Otro / Emocional",
};

const DYNAMIC_LABELS: Record<string, string> = {
  location: "Ubicación del dolor",
  intensity: "Intensidad del dolor (1-10)",
  type: "Tipo de dolor",
  drycough: "Tos seca",
  phlegmcough: "Tos con flemas",
  shortnessofbreath: "Falta de aire",
  bodyache: "Cuerpo cortado",
  sorethroat: "Dolor de garganta",
  phlegmcolor: "Color de la flema",
  nauseavomiting: "Náusea o vómito",
  constipation: "Estreñimiento",
  heartburn: "Ardor estomacal",
  bloating: "Inflamación",
  diarrheacount: "Evacuaciones líquidas por día",
  urinaryburning: "Ardor al orinar",
  frequenturination: "Orina frecuente (poca cantidad)",
  bloodinurine: "Sangre en orina",
  lowerbackpain: "Dolor en la espalda baja",
  urinaryfever: "Fiebre",
  checkup: "Motivo del chequeo",
  desc: "Descripción del síntoma",
  fever: "Fiebre",
  fiebre: "Fiebre",
  tosseca: "Tos seca",
  tosconflemas: "Tos con flemas",
  faltadeaire: "Falta de aire",
  cuerpocortado: "Cuerpo cortado",
  dolordegarganta: "Dolor de garganta",
  nauseaovomito: "Náusea o vómito",
  diarrea: "Diarrea",
  estrenimiento: "Estreñimiento",
  ardorestomacal: "Ardor estomacal",
  inflamacion: "Inflamación",
  ardoralorinar: "Ardor al orinar",
  orinaacadaratopoco: "Orina frecuente (poca cantidad)",
  sangreenorina: "Sangre en orina",
  dolorenlaespaldabaja: "Dolor en la espalda baja",
};

const VALUE_LABELS: Record<string, string> = {
  ...DYNAMIC_LABELS,
  ninguna: "Ninguna",
};

function normalizeLookupKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function toSentenceCaseIdentifier(value: string): string {
  const withSpaces = value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  if (!withSpaces) return value;

  const words = withSpaces.split(" ");
  const normalizedWords = words.map((word, index) => {
    if (/^[A-ZÁÉÍÓÚÜÑ0-9]{2,}$/.test(word)) return word;
    const lower = word.toLowerCase();
    if (index === 0) {
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    return lower;
  });

  return normalizedWords.join(" ");
}

function resolveKnownLabel(raw: string): string | null {
  if (!raw) return null;
  const normalized = normalizeLookupKey(raw);
  const symptomLabel = SYMPTOM_CODE_LABELS[raw.trim().toUpperCase()];
  if (symptomLabel) return symptomLabel;
  if (DYNAMIC_LABELS[normalized]) return DYNAMIC_LABELS[normalized];
  if (VALUE_LABELS[normalized]) return VALUE_LABELS[normalized];
  return null;
}

function splitCategoryNamespace(raw: string): { categoryId: string | null; key: string } {
  const trimmed = raw.trim();
  const namespacedMatch = trimmed.match(/^([A-Za-z0-9]+)__(.+)$/);
  if (!namespacedMatch) {
    return { categoryId: null, key: trimmed };
  }

  const categoryId = namespacedMatch[1].toUpperCase();
  if (!SYMPTOM_CODE_LABELS[categoryId]) {
    return { categoryId: null, key: trimmed };
  }

  return { categoryId, key: namespacedMatch[2] };
}

export function formatQuestionnaireLabel(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (!trimmed) return "Pregunta";

  const { categoryId, key } = splitCategoryNamespace(trimmed);
  const baseLabel = resolveKnownLabel(key) || toSentenceCaseIdentifier(key);

  if (!categoryId) return baseLabel;

  return `${baseLabel} (${SYMPTOM_CODE_LABELS[categoryId]})`;
}

export function formatQuestionnaireTag(rawTag: string): string {
  const trimmed = rawTag.trim();
  if (!trimmed) return "";
  return resolveKnownLabel(trimmed) || toSentenceCaseIdentifier(trimmed);
}

export function formatQuestionnaireValue(value: unknown): string {
  if (value === null || value === undefined) return "No especificado";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return String(value);

  if (Array.isArray(value)) {
    const items = value
      .map((item) => formatQuestionnaireValue(item))
      .filter((item) => item !== "No especificado");
    return items.length > 0 ? items.join(", ") : "No especificado";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "No especificado";

    if (/^(true|false)$/i.test(trimmed)) {
      return /^true$/i.test(trimmed) ? "Sí" : "No";
    }

    const known = resolveKnownLabel(trimmed);
    if (known) return known;

    const looksLikeIdentifier =
      /[_-]/.test(trimmed) ||
      /[a-z][A-Z]/.test(trimmed) ||
      /^[A-Z0-9_]+$/.test(trimmed);

    return looksLikeIdentifier ? toSentenceCaseIdentifier(trimmed) : trimmed;
  }

  return String(value);
}
