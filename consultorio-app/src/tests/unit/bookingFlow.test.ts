import assert from 'node:assert/strict'
import {
  buildPublicBookingPayload,
  getNextBookingStep,
  getPreviousBookingStep,
  hasCompleteBookingInfo,
  hasValidPhone,
  isSlotHoldActive,
  normalizePhone,
} from '../../lib/bookingFlow.ts'
import { runSuite } from '../testHarness.ts'

const basePatientForm = {
  firstName: 'María',
  lastNamePaternal: 'Pérez',
  lastNameMaternal: 'López',
  email: '',
  phone: '',
  dateOfBirth: '2018-05-10',
  sex: 'FEMALE',
  gender: 'FEMININE',
}

const baseContactForm = {
  relation: 'CAREGIVER',
  firstName: 'Laura',
  lastNamePaternal: 'Pérez',
  lastNameMaternal: 'Torres',
  phone: '614 123 4567',
  email: 'laura@example.com',
}

export async function runBookingFlowUnitTests() {
  await runSuite('Unit: bookingFlow', [
    {
      name: 'normalizePhone strips non-digits',
      run: () => {
        assert.equal(normalizePhone('(614) 123-45-67'), '6141234567')
      },
    },
    {
      name: 'hasValidPhone accepts 10 to 15 digits',
      run: () => {
        assert.equal(hasValidPhone('6141234567'), true)
        assert.equal(hasValidPhone('+52 614 123 456789'), true)
        assert.equal(hasValidPhone('123'), false)
      },
    },
    {
      name: 'hasCompleteBookingInfo allows patient without own phone when responsible contact is valid',
      run: () => {
        assert.equal(
          hasCompleteBookingInfo({
            formData: basePatientForm,
            contactData: baseContactForm,
            requiresLinkedEmail: false,
            normalizedEmail: '',
          }),
          true
        )
      },
    },
    {
      name: 'hasCompleteBookingInfo requires email when booking with linked account',
      run: () => {
        assert.equal(
          hasCompleteBookingInfo({
            formData: basePatientForm,
            contactData: baseContactForm,
            requiresLinkedEmail: true,
            normalizedEmail: '',
          }),
          false
        )
      },
    },
    {
      name: 'hasCompleteBookingInfo rejects invalid responsible contact phone',
      run: () => {
        assert.equal(
          hasCompleteBookingInfo({
            formData: basePatientForm,
            contactData: { ...baseContactForm, phone: '123' },
            requiresLinkedEmail: false,
            normalizedEmail: '',
          }),
          false
        )
      },
    },
    {
      name: 'buildPublicBookingPayload omits patient phone and keeps responsible contact as operational contact',
      run: () => {
        const payload = buildPublicBookingPayload({
          formData: basePatientForm,
          contactData: baseContactForm,
          normalizedEmail: '',
          selectedTime: '2026-05-01T10:00:00.000-07:00',
          selectedDoctorId: 'cma1234567890123456789012',
          consultType: 'normal',
          patientUserId: 'pat_123',
          bookAsGuest: false,
          holdToken: '550e8400-e29b-41d4-a716-446655440000',
          privacyConsentAccepted: true,
          recaptchaToken: 'token',
        })

        assert.equal('phone' in payload, false)
        assert.equal(payload.contact.phone, '614 123 4567')
        assert.equal(payload.userId, 'pat_123')
        assert.equal(payload.appointmentType, 'NORMAL')
      },
    },
    {
      name: 'buildPublicBookingPayload omits empty recaptcha token',
      run: () => {
        const payload = buildPublicBookingPayload({
          formData: basePatientForm,
          contactData: baseContactForm,
          normalizedEmail: '',
          selectedTime: '2026-05-01T10:00:00.000-07:00',
          selectedDoctorId: 'cma1234567890123456789012',
          consultType: 'normal',
          patientUserId: 'pat_123',
          bookAsGuest: false,
          holdToken: '550e8400-e29b-41d4-a716-446655440000',
          privacyConsentAccepted: true,
          recaptchaToken: '',
        })

        assert.equal(payload.recaptchaToken, undefined)
      },
    },
    {
      name: 'getNextBookingStep skips info when patient data is already complete',
      run: () => {
        assert.equal(
          getNextBookingStep({
            currentStep: 'time',
            hasPreselectedDoctor: false,
            hasCompletePatientData: true,
          }),
          'confirm'
        )
      },
    },
    {
      name: 'getNextBookingStep keeps info when patient data is incomplete',
      run: () => {
        assert.equal(
          getNextBookingStep({
            currentStep: 'time',
            hasPreselectedDoctor: false,
            hasCompletePatientData: false,
          }),
          'info'
        )
      },
    },
    {
      name: 'getPreviousBookingStep returns time when going back from confirm with complete info',
      run: () => {
        assert.equal(
          getPreviousBookingStep({
            currentStep: 'confirm',
            hasPreselectedDoctor: false,
            hasCompletePatientData: true,
          }),
          'time'
        )
      },
    },
    {
      name: 'getPreviousBookingStep returns info when going back from confirm with incomplete info',
      run: () => {
        assert.equal(
          getPreviousBookingStep({
            currentStep: 'confirm',
            hasPreselectedDoctor: false,
            hasCompletePatientData: false,
          }),
          'info'
        )
      },
    },
    {
      name: 'isSlotHoldActive requires matching time, doctor and non-expired token',
      run: () => {
        const now = new Date('2026-05-01T09:00:00.000-07:00').getTime()
        assert.equal(
          isSlotHoldActive({
            slotHold: {
              startTime: '2026-05-01T10:00:00.000-07:00',
              doctorId: 'doc_1',
              expiresAt: '2026-05-01T09:10:00.000-07:00',
            },
            selectedTime: '2026-05-01T10:00:00.000-07:00',
            selectedDoctorId: 'doc_1',
            now,
          }),
          true
        )

        assert.equal(
          isSlotHoldActive({
            slotHold: {
              startTime: '2026-05-01T10:00:00.000-07:00',
              doctorId: 'doc_1',
              expiresAt: '2026-05-01T08:59:00.000-07:00',
            },
            selectedTime: '2026-05-01T10:00:00.000-07:00',
            selectedDoctorId: 'doc_1',
            now,
          }),
          false
        )
      },
    },
  ])
}
