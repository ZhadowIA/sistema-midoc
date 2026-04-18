type IdentifierContext = {
  patientName?: string | null;
  doctorName?: string | null;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scrubKnownName(input: string, name: string | null | undefined, replacement: string) {
  const cleanName = name?.trim();
  if (!cleanName) return input;

  const parts = cleanName.split(/\s+/).filter((part) => part.length >= 3);
  const patterns = [cleanName, ...parts];

  return patterns.reduce((current, candidate) => {
    const pattern = new RegExp(`\\b${escapeRegExp(candidate)}\\b`, "gi");
    return current.replace(pattern, replacement);
  }, input);
}

export function pseudonymizeClinicalText(input: string, identifiers?: IdentifierContext) {
  let output = input;
  output = scrubKnownName(output, identifiers?.patientName, "[PACIENTE]");
  output = scrubKnownName(output, identifiers?.doctorName, "[MEDICO]");
  output = output.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]");
  output = output.replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[TELEFONO]");
  return output;
}

export function pseudonymizeStructuredData(value: unknown, identifiers?: IdentifierContext): unknown {
  if (typeof value === "string") {
    return pseudonymizeClinicalText(value, identifiers);
  }

  if (Array.isArray(value)) {
    return value.map((item) => pseudonymizeStructuredData(item, identifiers));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        pseudonymizeStructuredData(nestedValue, identifiers),
      ])
    );
  }

  return value;
}
