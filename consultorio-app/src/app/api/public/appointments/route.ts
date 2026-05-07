import { NextResponse } from 'next/server'
import { AppointmentService } from '@/services/AppointmentService'
import { getAuthenticatedUser } from '@/lib/auth'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'
import { ContractValidationError, parsePublicAppointmentPayload } from '@/lib/publicApiContracts'
import { getRequestIp, getUserAgent } from '@/lib/requestContext'
import { verifyRecaptchaToken } from '@/lib/recaptcha'
import { emitMetric, withEndpointObservability } from '@/lib/observability'

export async function POST(request: Request) {
  return withEndpointObservability({ endpoint: 'api.public.appointments.create', method: 'POST' }, async () => {
    const rateLimit = await checkRateLimit(request, {
      key: 'public:appointments:create',
      limit: 8,
      windowMs: 15 * 60_000,
    })
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit)

    try {
      emitMetric({ domain: 'agenda', metric: 'public_booking_attempt' })
      const body = await request.json()
      const parsed = parsePublicAppointmentPayload(body)
      const { bookAsGuest, recaptchaToken, ...appointmentPayload } = parsed

      const recaptcha = await verifyRecaptchaToken(recaptchaToken, { expectedAction: 'booking' })
      if (!recaptcha.ok) {
        emitMetric({ domain: 'agenda', metric: 'public_booking_blocked_recaptcha', tags: { reason: recaptcha.reason } })
        const status = recaptcha.reason === 'missing-token' ? 400 : 403
        return NextResponse.json(
          {
            error: 'No fue posible verificar que la solicitud provenga de un usuario real.',
            recaptchaReason: recaptcha.reason,
          },
          { status },
        )
      }

      const authUser = await getAuthenticatedUser()
      const bookingWithLinkedAccount = authUser?.role === 'PATIENT' && !bookAsGuest
      const email = parsed.email.trim()
      const patientUserId = bookingWithLinkedAccount ? authUser.id : undefined

      if (bookingWithLinkedAccount && !email) {
        return NextResponse.json(
          { error: 'El correo es obligatorio cuando agendas con cuenta vinculada.' },
          { status: 400 },
        )
      }

      const result = await AppointmentService.createPublicAppointment({
        ...appointmentPayload,
        userId: patientUserId,
        email: email || undefined,
        ipAddress: getRequestIp(request),
        userAgent: getUserAgent(request),
      })

      emitMetric({ domain: 'agenda', metric: 'public_booking_success' })
      return NextResponse.json(result, { status: 201 })
    } catch (error: unknown) {
      if (error instanceof ContractValidationError) {
        emitMetric({ domain: 'agenda', metric: 'public_booking_validation_error' })
        return NextResponse.json({ error: error.message, details: error.details }, { status: error.status })
      }
      emitMetric({ domain: 'agenda', metric: 'public_booking_failed' })
      const message = error instanceof Error ? error.message : 'Error interno'
      return NextResponse.json({ error: message }, { status: 409 })
    }
  })
}
