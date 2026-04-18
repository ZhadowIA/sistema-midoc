import { getAuthenticatedMedicalContext, getAuthenticatedUser } from "@/lib/auth";
import { jsonNoStore } from "@/lib/http";

export async function requireMedicalDoctorApiAccess() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      context: null,
      response: jsonNoStore({ error: "No autorizado" }, { status: 401 }),
    };
  }

  const context = await getAuthenticatedMedicalContext({ allowSecretary: false });
  if (!context) {
    return {
      context: null,
      response: jsonNoStore(
        { error: "Acceso denegado. El rol Asistente no puede consultar expedientes médicos." },
        { status: 403 }
      ),
    };
  }

  return { context, response: null };
}
