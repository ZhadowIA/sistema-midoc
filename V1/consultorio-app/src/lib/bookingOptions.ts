export const PATIENT_SEX_VALUES = ['MALE', 'FEMALE', 'INTERSEX'] as const

export const PATIENT_GENDER_VALUES = [
  'NOT_SPECIFIED',
  'MASCULINE',
  'FEMININE',
  'TRANSGENDER',
  'TRANSSEXUAL',
  'TRAVESTI',
  'INTERSEX',
  'OTHER',
] as const

export const PATIENT_RELATION_VALUES = [
  'SELF',
  'SPOUSE',
  'PARENT',
  'CHILD',
  'SIBLING',
  'FRIEND',
  'CAREGIVER',
  'OTHER',
] as const

export const SEX_OPTIONS = [
  { value: 'MALE', label: 'Hombre' },
  { value: 'FEMALE', label: 'Mujer' },
  { value: 'INTERSEX', label: 'Intersexual' },
] as const

export const GENDER_OPTIONS = [
  { value: 'NOT_SPECIFIED', label: 'No especificado' },
  { value: 'MASCULINE', label: 'Masculino' },
  { value: 'FEMININE', label: 'Femenino' },
  { value: 'TRANSGENDER', label: 'Transgénero' },
  { value: 'TRANSSEXUAL', label: 'Transexual' },
  { value: 'TRAVESTI', label: 'Travesti' },
  { value: 'INTERSEX', label: 'Intersexual' },
  { value: 'OTHER', label: 'Otro' },
] as const

export const RELATION_OPTIONS = [
  { value: 'SELF', label: 'El paciente mismo' },
  { value: 'SPOUSE', label: 'Cónyuge / Pareja' },
  { value: 'PARENT', label: 'Padre / Madre' },
  { value: 'CHILD', label: 'Hijo(a)' },
  { value: 'SIBLING', label: 'Hermano(a)' },
  { value: 'FRIEND', label: 'Amigo(a)' },
  { value: 'CAREGIVER', label: 'Cuidador(a)' },
  { value: 'OTHER', label: 'Otro' },
] as const
