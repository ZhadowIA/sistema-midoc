import type { AuthenticatedRole, AuthenticatedUser } from "@/lib/auth";

export const PERMISSIONS = {
  APPOINTMENT_CREATE: "appointment:create",
  APPOINTMENT_UPDATE: "appointment:update",
  APPOINTMENT_RESCHEDULE: "appointment:reschedule",
  CLINICAL_NOTE_READ: "clinical-note:read",
  CLINICAL_NOTE_WRITE: "clinical-note:write",
  CLINICAL_NOTE_SIGN: "clinical-note:sign",
  BILLING_READ: "billing:read",
  BILLING_MANAGE: "billing:manage",
  CLINIC_MANAGE_DOCTORS: "clinic:manage-doctors",
  CLINIC_MANAGE_SEATS: "clinic:manage-seats",
  SECURITY_INCIDENT_READ: "security:incident-read",
  SECURITY_INCIDENT_WRITE: "security:incident-write",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type PermissionContext = {
  /** true when actor and target belong to the same clinic scope */
  sameClinic?: boolean;
  /** true when actor owns the target resource (appointment, patient, etc.) */
  ownsResource?: boolean;
};

const ROLE_PERMISSIONS: Record<AuthenticatedRole, ReadonlySet<Permission>> = {
  ADMIN: new Set(Object.values(PERMISSIONS)),
  CLINIC_ADMIN: new Set<Permission>([
    PERMISSIONS.APPOINTMENT_CREATE,
    PERMISSIONS.APPOINTMENT_UPDATE,
    PERMISSIONS.APPOINTMENT_RESCHEDULE,
    PERMISSIONS.CLINICAL_NOTE_READ,
    PERMISSIONS.CLINICAL_NOTE_WRITE,
    PERMISSIONS.CLINICAL_NOTE_SIGN,
    PERMISSIONS.BILLING_READ,
    PERMISSIONS.BILLING_MANAGE,
    PERMISSIONS.CLINIC_MANAGE_DOCTORS,
    PERMISSIONS.CLINIC_MANAGE_SEATS,
    PERMISSIONS.SECURITY_INCIDENT_READ,
    PERMISSIONS.SECURITY_INCIDENT_WRITE,
  ]),
  DOCTOR: new Set<Permission>([
    PERMISSIONS.APPOINTMENT_CREATE,
    PERMISSIONS.APPOINTMENT_UPDATE,
    PERMISSIONS.APPOINTMENT_RESCHEDULE,
    PERMISSIONS.CLINICAL_NOTE_READ,
    PERMISSIONS.CLINICAL_NOTE_WRITE,
    PERMISSIONS.CLINICAL_NOTE_SIGN,
    PERMISSIONS.BILLING_READ,
    PERMISSIONS.SECURITY_INCIDENT_READ,
    PERMISSIONS.SECURITY_INCIDENT_WRITE,
  ]),
  SECRETARY: new Set<Permission>([
    PERMISSIONS.APPOINTMENT_CREATE,
    PERMISSIONS.APPOINTMENT_UPDATE,
    PERMISSIONS.APPOINTMENT_RESCHEDULE,
  ]),
  PATIENT: new Set<Permission>(),
};

export function can(
  userOrRole: Pick<AuthenticatedUser, "role"> | AuthenticatedRole,
  permission: Permission,
  context?: PermissionContext,
): boolean {
  const role = typeof userOrRole === "string" ? userOrRole : userOrRole.role;
  const baseAllowed = ROLE_PERMISSIONS[role]?.has(permission) === true;
  if (!baseAllowed) return false;

  // Context-aware constraints (when context is provided by caller).
  if (
    (permission === PERMISSIONS.CLINIC_MANAGE_DOCTORS ||
      permission === PERMISSIONS.CLINIC_MANAGE_SEATS) &&
    context?.sameClinic === false
  ) {
    return false;
  }

  if (
    (permission === PERMISSIONS.APPOINTMENT_UPDATE ||
      permission === PERMISSIONS.APPOINTMENT_RESCHEDULE) &&
    role === "SECRETARY" &&
    context?.ownsResource === false
  ) {
    return false;
  }

  return true;
}
