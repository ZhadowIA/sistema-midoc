'use client'

import { useEffect, useRef, useCallback } from 'react'
import { getOrCreateUtmContext, type UtmContext } from '@/lib/bookingChannel'

export type FunnelStep =
  | 'BOOKING_VISIT'
  | 'BOOKING_STARTED'
  | 'DOCTOR_SELECTED'
  | 'SLOT_SELECTED'
  | 'PATIENT_INFO_STARTED'
  | 'PATIENT_INFO_COMPLETED'
  | 'BOOKING_CONFIRMED'
  | 'PAYMENT_STARTED'
  | 'PAYMENT_COMPLETED'
  | 'APPOINTMENT_COMPLETED'

interface TrackOptions {
  doctorId?: string
  appointmentId?: string
  metadata?: Record<string, unknown>
}

export function useFunnelTracking() {
  const utmRef = useRef<UtmContext | null>(null)

  useEffect(() => {
    utmRef.current = getOrCreateUtmContext()
  }, [])

  const track = useCallback(async (step: FunnelStep, options: TrackOptions = {}) => {
    const utm = utmRef.current
    if (!utm) return

    try {
      await fetch('/api/internal/funnel/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step,
          sessionId: utm.sessionId,
          channel: utm.referrerChannel,
          utmSource: utm.utmSource,
          utmMedium: utm.utmMedium,
          utmCampaign: utm.utmCampaign,
          utmContent: utm.utmContent,
          referrer: typeof document !== 'undefined' ? document.referrer || null : null,
          doctorId: options.doctorId,
          appointmentId: options.appointmentId,
          metadata: options.metadata,
        }),
      })
    } catch {
      // fire-and-forget — nunca bloquear el flujo de reserva
    }
  }, [])

  const getUtmContext = useCallback((): UtmContext | null => utmRef.current, [])

  return { track, getUtmContext }
}
