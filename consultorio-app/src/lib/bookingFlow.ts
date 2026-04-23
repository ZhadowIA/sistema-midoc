export type BookingPatientForm = {
  firstName: string
  lastNamePaternal: string
  lastNameMaternal: string
  email: string
  phone: string
  dateOfBirth: string
  sex: string
  gender: string
}

export type BookingResponsibleContactForm = {
  relation: string
  firstName: string
  lastNamePaternal: string
  lastNameMaternal: string
  phone: string
  email: string
}

export type BookingStep = 'auth' | 'doctor' | 'type' | 'date' | 'time' | 'info' | 'confirm'

export type SlotHoldSnapshot = {
  startTime: string
  doctorId: string
  expiresAt: string
}

type BuildPublicBookingPayloadInput = {
  formData: BookingPatientForm
  contactData: BookingResponsibleContactForm
  normalizedEmail: string
  selectedTime: string
  selectedDoctorId: string
  consultType: 'normal' | 'extended'
  patientUserId?: string
  bookAsGuest: boolean
  holdToken: string
  privacyConsentAccepted: boolean
  recaptchaToken: string
}

export function normalizePhone(value: string) {
  return value.replace(/\D+/g, '')
}

export function hasValidPhone(value: string) {
  const digits = normalizePhone(value)
  return digits.length >= 10 && digits.length <= 15
}

export function hasCompleteBookingInfo(params: {
  formData: BookingPatientForm
  contactData: BookingResponsibleContactForm
  requiresLinkedEmail: boolean
  normalizedEmail: string
}) {
  const { formData, contactData, requiresLinkedEmail, normalizedEmail } = params

  return Boolean(
    formData.firstName.trim() &&
      formData.lastNamePaternal.trim() &&
      formData.dateOfBirth &&
      formData.sex &&
      contactData.firstName.trim() &&
      contactData.lastNamePaternal.trim() &&
      hasValidPhone(contactData.phone) &&
      contactData.relation &&
      (!requiresLinkedEmail || normalizedEmail)
  )
}

export function buildPublicBookingPayload(input: BuildPublicBookingPayloadInput) {
  const {
    formData,
    contactData,
    normalizedEmail,
    selectedTime,
    selectedDoctorId,
    consultType,
    patientUserId,
    bookAsGuest,
    holdToken,
    privacyConsentAccepted,
    recaptchaToken,
  } = input

  return {
    firstName: formData.firstName.trim(),
    lastNamePaternal: formData.lastNamePaternal.trim(),
    lastNameMaternal: formData.lastNameMaternal.trim() || undefined,
    email: normalizedEmail,
    dateOfBirth: formData.dateOfBirth,
    sex: formData.sex || undefined,
    gender: formData.gender || undefined,
    contact: {
      relation: contactData.relation,
      firstName: contactData.firstName.trim(),
      lastNamePaternal: contactData.lastNamePaternal.trim(),
      lastNameMaternal: contactData.lastNameMaternal.trim() || undefined,
      phone: contactData.phone.trim(),
      email: contactData.email.trim() || undefined,
    },
    userId: bookAsGuest ? undefined : patientUserId || undefined,
    bookAsGuest,
    appointmentType: consultType.toUpperCase(),
    startTime: selectedTime,
    doctorId: selectedDoctorId,
    holdToken,
    privacyConsentAccepted,
    recaptchaToken: recaptchaToken.trim() || undefined,
  }
}

export function getBookingStepOrder(hasPreselectedDoctor: boolean): BookingStep[] {
  return hasPreselectedDoctor
    ? ['auth', 'type', 'date', 'time', 'info', 'confirm']
    : ['auth', 'doctor', 'type', 'date', 'time', 'info', 'confirm']
}

export function getNextBookingStep(params: {
  currentStep: BookingStep
  hasPreselectedDoctor: boolean
  hasCompletePatientData: boolean
}): BookingStep | null {
  const { currentStep, hasPreselectedDoctor, hasCompletePatientData } = params
  const stepOrder = getBookingStepOrder(hasPreselectedDoctor)
  const nextIndex = stepOrder.indexOf(currentStep) + 1
  if (nextIndex >= stepOrder.length) return null

  const nextStep = stepOrder[nextIndex]
  if (nextStep === 'info' && hasCompletePatientData) {
    return 'confirm'
  }

  return nextStep
}

export function getPreviousBookingStep(params: {
  currentStep: BookingStep
  hasPreselectedDoctor: boolean
  hasCompletePatientData: boolean
}): BookingStep | null {
  const { currentStep, hasPreselectedDoctor, hasCompletePatientData } = params
  const stepOrder = getBookingStepOrder(hasPreselectedDoctor)
  const prevIndex = stepOrder.indexOf(currentStep) - 1
  if (prevIndex < 0) return null

  const prevStep = stepOrder[prevIndex]
  if (prevStep === 'info' && hasCompletePatientData) {
    return 'time'
  }

  return prevStep
}

export function isSlotHoldActive(params: {
  slotHold: SlotHoldSnapshot | null
  selectedTime: string | null
  selectedDoctorId: string | null
  now: number
}) {
  const { slotHold, selectedTime, selectedDoctorId, now } = params

  return Boolean(
    selectedTime !== null &&
      selectedDoctorId !== null &&
      slotHold &&
      slotHold.startTime === selectedTime &&
      slotHold.doctorId === selectedDoctorId &&
      new Date(slotHold.expiresAt).getTime() > now
  )
}
