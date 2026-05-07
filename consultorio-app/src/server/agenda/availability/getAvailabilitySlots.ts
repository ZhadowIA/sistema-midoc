import { AvailabilityService } from '@/services/AvailabilityService'
import { AvailabilityInputError } from '@/server/agenda/availability/errors'

type SlotType = 'normal' | 'extended'

type GetAvailabilitySlotsInput = {
  doctorId: string
  date: string | null
  type: SlotType | null
}

export async function getAvailabilitySlots(input: GetAvailabilitySlotsInput) {
  if (!input.date || !input.type) {
    throw new AvailabilityInputError('Faltan parámetros (date, type)')
  }

  return AvailabilityService.getAvailability(input.doctorId, input.date, input.type)
}

