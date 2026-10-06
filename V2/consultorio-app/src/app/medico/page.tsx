import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { UserRole } from "@prisma/client";

import { SESSION_COOKIE_NAME } from "../../lib/auth/session-cookie";
import { doctorHomePath, isFrozenScopeEnabled } from "../../lib/scope";
import { getDoctorSetupStatus, validateAuthSession } from "../../services/auth/auth-service";

// Entrada unica del medico tras registrarse o iniciar sesion: decide aqui, en el
// servidor, a donde va segun el alcance vigente y su avance de configuracion.
export default async function DoctorEntryPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = sessionToken ? await validateAuthSession(sessionToken) : null;

  if (!user || user.role !== UserRole.DOCTOR) {
    redirect("/medico/login");
  }

  const { nextStep } = await getDoctorSetupStatus(user.id);
  redirect(doctorHomePath(isFrozenScopeEnabled(), nextStep));
}
