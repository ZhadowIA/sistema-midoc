import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { UserRole } from "@prisma/client";

import { SESSION_COOKIE_NAME } from "../../../lib/auth/session-cookie";
import { validateAuthSession } from "../../../services/auth/auth-service";
import { getDoctorWorkspace } from "../../../services/doctor/doctor-profile-service";
import { getDoctorSubscription } from "../../../services/subscription/subscription-service";
import { CuentaClient } from "./cuenta-client";

export const metadata: Metadata = {
  title: "Cuenta"
};

// Pagina de entrada del medico tras el reenfoque: cuenta, perfil clinico que
// usa la app de escritorio y estado de la suscripcion. Sin datos clinicos.
export default async function CuentaPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = sessionToken ? await validateAuthSession(sessionToken) : null;

  if (!user || user.role !== UserRole.DOCTOR) {
    redirect("/medico/login");
  }

  const [workspace, subscription] = await Promise.all([
    getDoctorWorkspace(user.id),
    getDoctorSubscription(user.id)
  ]);

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
      subscription={{
        status: subscription.status,
        planName: subscription.subscription?.plan.name ?? subscription.planCode,
        entitled: subscription.entitled,
        renewsAt: subscription.subscription?.renewsAt?.toISOString() ?? null
      }}
    />
  );
}
