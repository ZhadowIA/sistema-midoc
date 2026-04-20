export interface StructuredName {
  firstName: string
  lastNamePaternal: string
  lastNameMaternal: string | null
}

export interface NameParts {
  firstName?: string | null
  lastNamePaternal?: string | null
  lastNameMaternal?: string | null
  fullName?: string | null
}

export function buildFullName(parts: NameParts): string {
  return [parts.firstName, parts.lastNamePaternal, parts.lastNameMaternal]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join(' ')
}

export function formatPatientName(patient: NameParts): string {
  const structured = buildFullName(patient)
  if (structured.length > 0) return structured
  return (patient.fullName ?? '').trim()
}

export function parseFullName(fullName: string): StructuredName {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean)

  if (tokens.length === 0) {
    return { firstName: '', lastNamePaternal: '', lastNameMaternal: null }
  }
  if (tokens.length === 1) {
    return { firstName: tokens[0], lastNamePaternal: '', lastNameMaternal: null }
  }
  if (tokens.length === 2) {
    return { firstName: tokens[0], lastNamePaternal: tokens[1], lastNameMaternal: null }
  }
  if (tokens.length === 3) {
    return { firstName: tokens[0], lastNamePaternal: tokens[1], lastNameMaternal: tokens[2] }
  }

  // 4+ tokens: últimos dos son apellidos, resto es nombre compuesto.
  const maternal = tokens[tokens.length - 1]
  const paternal = tokens[tokens.length - 2]
  const firstName = tokens.slice(0, -2).join(' ')
  return { firstName, lastNamePaternal: paternal, lastNameMaternal: maternal }
}
