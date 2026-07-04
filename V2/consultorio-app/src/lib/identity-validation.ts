import { ServiceError } from "./errors";
import { onlyDigits } from "./phone";

class IdentityValidationError extends ServiceError {}

const FIELD_LIMITS = {
  firstName: 80,
  lastName: 120,
  professionalName: 120,
  phone: 13
} as const;

function collapseSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function letterCount(value: string) {
  return Array.from(value).filter((char) => /\p{L}/u.test(char)).length;
}

function simplifiedLetters(value: string) {
  return Array.from(value.toLowerCase())
    .filter((char) => /\p{L}/u.test(char))
    .join("");
}

export function normalizePersonName(
  value: string,
  field: "firstName" | "lastName"
) {
  const normalized = collapseSpaces(value);
  const maxLength = FIELD_LIMITS[field];

  if (normalized.length < 2 || normalized.length > maxLength || letterCount(normalized) < 2) {
    throw new IdentityValidationError("Nombre invalido.", 400);
  }

  return normalized;
}

export function normalizeProfessionalName(value: string) {
  const normalized = collapseSpaces(value);
  const letters = simplifiedLetters(normalized);
  const uniqueLetters = new Set(Array.from(letters));

  if (
    normalized.length < 5 ||
    normalized.length > FIELD_LIMITS.professionalName ||
    letters.length < 3 ||
    uniqueLetters.size < 2
  ) {
    throw new IdentityValidationError("Nombre profesional invalido.", 400);
  }

  return normalized;
}

export function normalizeMexicanE164Phone(value: string | null | undefined) {
  if (value === null) {
    return null;
  }

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const trimmed = value.trim();
  const digits = onlyDigits(trimmed);
  const normalized =
    digits.length === 10 ? `+52${digits}` : digits.length === 12 && digits.startsWith("52") ? `+${digits}` : trimmed;

  if (!/^\+52\d{10}$/.test(normalized) || normalized.length > FIELD_LIMITS.phone) {
    throw new IdentityValidationError("Telefono mexicano invalido.", 400);
  }

  return normalized;
}

export function normalizeLicenseNumber(value: string) {
  const normalized = collapseSpaces(value).toUpperCase();
  const digitCount = onlyDigits(normalized).length;

  if (
    normalized.length < 5 ||
    normalized.length > 30 ||
    digitCount < 5 ||
    !/^[A-Z0-9 -]+$/.test(normalized)
  ) {
    throw new IdentityValidationError("Cedula profesional invalida.", 400);
  }

  return normalized;
}

export function assertPasswordConfirmation(password: string, confirmation?: string) {
  if (confirmation !== undefined && confirmation !== password) {
    throw new IdentityValidationError("La confirmacion de contrasena no coincide.", 400);
  }
}
