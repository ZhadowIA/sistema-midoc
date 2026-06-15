import { type User } from "@prisma/client";

import { requireDoctorUser } from "./session-user";
import { ServiceError } from "../errors";
import {
  resolveDoctorCapabilities,
  type Capability,
  type ResolvedSubscription
} from "../../services/subscription/subscription-service";

/**
 * Exige que el medico autenticado tenga habilitada una capacidad por su plan vigente.
 * Bloquea con 402 (pago requerido) cuando la suscripcion no da derecho o el plan no
 * incluye la capacidad. Usar en route handlers que protegen features comerciales.
 */
export async function requireCapability(
  request: Request,
  capability: Capability
): Promise<{ user: User; subscription: ResolvedSubscription }> {
  const user = await requireDoctorUser(request);
  const subscription = await resolveDoctorCapabilities(user.id);

  if (!subscription.capabilities[capability]) {
    throw new ServiceError(
      "Tu plan no incluye esta funcion o tu suscripcion no esta activa.",
      402
    );
  }

  return { user, subscription };
}
