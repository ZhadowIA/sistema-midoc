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

/** Saldo de creditos de IA tal como se leyo en la ultima sincronizacion. */
export function creditBalanceLine(balance: number): string {
  return `${balance} ${balance === 1 ? "crédito" : "créditos"} de IA`;
}

export function creditBalanceTitle(readAt: string | null): string {
  if (!readAt) return "Saldo de tu cuenta MiDoc";
  return `Saldo de tu cuenta MiDoc al sincronizar el ${formatDateFlexible(readAt)}`;
}

/** Resultado de buscar actualizaciones (paso 29 r5), tal como lo decide Rust. */
export interface UpdateCheck {
  configured: boolean;
  current_version: string;
  available: boolean;
  version: string | null;
  published_at: string | null;
  notes: string | null;
  critical: boolean;
  allowed: boolean;
  reason: string | null;
}

/** Titulo corto del aviso de actualizaciones. */
export function updateHeadline(check: UpdateCheck): string {
  if (!check.configured) return "Actualizaciones no disponibles en esta compilación";
  if (!check.available) return `MiDoc ${check.current_version} está al día`;
  if (check.allowed) return `MiDoc ${check.version} disponible${check.critical ? " (parche crítico)" : ""}`;
  return `MiDoc ${check.version} no está incluida en tu licencia`;
}
