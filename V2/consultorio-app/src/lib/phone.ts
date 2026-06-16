// Utilidades de telefono para el agendado publico. CONTACTO (no PHI): solo se
// usa para notificar al paciente o a su responsable. La validacion es de 10
// digitos nacionales con clave de pais autodetectada (Mexico por defecto) y
// editable.

export type Country = {
  code: string;
  name: string;
  dial: string;
};

// Lista curada para el alcance del piloto (Mexico y paises cercanos). Todos con
// numero nacional de 10 digitos, que es lo que valida el formulario.
export const COUNTRIES: Country[] = [
  { code: "MX", name: "México", dial: "+52" },
  { code: "US", name: "Estados Unidos", dial: "+1" },
  { code: "CA", name: "Canadá", dial: "+1" },
  { code: "CO", name: "Colombia", dial: "+57" },
  { code: "AR", name: "Argentina", dial: "+54" },
  { code: "PE", name: "Perú", dial: "+51" },
  { code: "CL", name: "Chile", dial: "+56" },
  { code: "GT", name: "Guatemala", dial: "+502" },
  { code: "ES", name: "España", dial: "+34" }
];

export const DEFAULT_COUNTRY = "MX";

/** Numero de digitos del numero nacional (Mexico, EE. UU. y la lista usan 10). */
export const NATIONAL_NUMBER_LENGTH = 10;

/** Detecta el pais por la region del locale ("es-MX" -> MX); Mexico por defecto. */
export function detectCountry(locale?: string): string {
  const source =
    locale ?? (typeof navigator !== "undefined" ? navigator.language : "");
  const region = source.split("-")[1]?.toUpperCase();
  if (region && COUNTRIES.some((country) => country.code === region)) {
    return region;
  }
  return DEFAULT_COUNTRY;
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** `true` si el numero nacional tiene exactamente 10 digitos. */
export function isValidNationalNumber(national: string): boolean {
  return onlyDigits(national).length === NATIONAL_NUMBER_LENGTH;
}

export function dialForCountry(code: string): string {
  return COUNTRIES.find((country) => country.code === code)?.dial ?? "+52";
}

/** Telefono legible para guardar/mostrar, p. ej. "+52 5512345678". */
export function formatFullPhone(countryCode: string, national: string): string {
  return `${dialForCountry(countryCode)} ${onlyDigits(national)}`;
}
