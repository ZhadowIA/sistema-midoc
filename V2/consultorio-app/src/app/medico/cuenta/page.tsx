import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { UserRole } from "@prisma/client";

import { SESSION_COOKIE_NAME } from "../../../lib/auth/session-cookie";
import { validateAuthSession } from "../../../services/auth/auth-service";
import { getDoctorWorkspace } from "../../../services/doctor/doctor-profile-service";
import { getCreditBalance, listCreditMovements } from "../../../services/ai/credit-ledger";
import { getLicenseOverview } from "../../../services/license/license-service";
import { CuentaClient } from "./cuenta-client";

export const metadata: Metadata = {
  title: "Cuenta"
};

// Pagina de entrada del medico tras el reenfoque: cuenta, perfil clinico que
// usa la app de escritorio, licencia de compra unica con sus equipos y saldo de
// creditos de IA (paso 29). Sin datos clinicos.
export default async function CuentaPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = sessionToken ? await validateAuthSession(sessionToken) : null;

  if (!user || user.role !== UserRole.DOCTOR) {
    redirect("/medico/login");
  }

  const [workspace, overview, balance, movements] = await Promise.all([
    getDoctorWorkspace(user.id),
    getLicenseOverview(user.id),
    getCreditBalance(user.id),
    listCreditMovements(user.id)
  ]);
  const license = overview.license;

  return (
    <CuentaClient
      account={{
        email: user.email,
        emailVerified: Boolean(user.emailVerifiedAt),
        status: user.status,
        professionalName: workspace.professionalName,
        licenseNumber: workspace.licenseNumber,
        clinicalProfile: workspace.specialty
      }}
      license={
        license
          ? {
              status: license.status,
              purchasedAt: license.purchasedAt,
              updatesUntil: license.updatesUntil,
              maxDevices: license.maxDevices,
              devices: license.devices.map((device) => ({
                id: device.id,
                deviceName: device.deviceName,
                activatedAt: device.activatedAt.toISOString(),
                lastSeenAt: device.lastSeenAt.toISOString()
              }))
            }
          : null
      }
      credits={{
        balance: balance.balance,
        expiringCredits: balance.expiringCredits,
        nextExpiry: balance.nextExpiry?.toISOString() ?? null,
        movements: movements.map((movement) => ({
          type: movement.type,
          kind: movement.kind,
          credits: movement.credits,
          at: movement.at.toISOString(),
          expiresAt: movement.expiresAt?.toISOString() ?? null
        }))
      }}
    />
  );
}
