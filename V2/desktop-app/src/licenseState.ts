// Estado de la licencia de compra unica (paso 29) tal como lo verifica Rust sin
// red. La licencia no caduca: `updates_until` solo dice hasta cuando hay
// versiones nuevas incluidas.

import { formatDateFlexible } from "./dateOnly.ts";

export interface LicenseStatus {
  state: "VALID" | "MISSING" | "INVALID";
  reason: string | null;
  holder_name: string | null;
  holder_license_number: string | null;
  edition: string | null;
  purchased_at: string | null;
  updates_until: string | null;
  updates_included: boolean;
  max_devices: number | null;
}

export function isLicensed(license: LicenseStatus | null): boolean {
  return license?.state === "VALID";
}

/** Linea corta para la tarjeta del perfil. */
export function licenseLine(license: LicenseStatus | null): string {
  if (!license || license.state !== "VALID") return "";
  if (!license.updates_until) return "Licencia activa";
  const until = formatDateFlexible(license.updates_until);
  return license.updates_included
    ? `Licencia activa · actualizaciones hasta ${until}`
    : `Licencia activa · actualizaciones incluidas hasta ${until}`;
}

/** Por que falta activar, en palabras para el medico. */
export function activationReason(license: LicenseStatus | null, lastError: string): string {
  if (lastError) return lastError;
  if (license?.state === "INVALID" && license.reason) return license.reason;
  return "Este equipo todavía no tiene licencia de MiDoc.";
}
