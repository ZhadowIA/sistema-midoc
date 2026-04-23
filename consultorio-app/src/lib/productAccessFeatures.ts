export function coerceFeaturesForProductAccess(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function getModuleAccessFromFeatures(features: Record<string, unknown>) {
  const agendaEnabled = features["agenda.enabled"] === true
  const clinicalEnabled =
    features["clinical.enabled"] === true || features["clinical.history"] === true

  return {
    agendaEnabled,
    clinicalEnabled,
  }
}
