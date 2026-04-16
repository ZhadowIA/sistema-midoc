import { NextResponse } from 'next/server'
import { AppointmentService } from '@/services/AppointmentService'
import { getAuthenticatedUser } from '@/lib/auth'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'
import { ContractValidationError, parsePublicAppointmentPayload } from '@/lib/publicApiContracts'

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, {
    key: 'public:appointments:create',
    limit: 8,
    windowMs: 15 * 60_000,
  })
  if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit)

  try {
    const body = await request.json()
    const parsed = parsePublicAppointmentPayload(body)
    const { bookAsGuest, ...appointmentPayload } = parsed

    const authUser = await getAuthenticatedUser()
    const bookingWithLinkedAccount = authUser?.role === 'PATIENT' && !bookAsGuest
    const email = parsed.email.trim()
    const patientUserId = bookingWithLinkedAccount ? authUser.id : undefined

    if (bookingWithLinkedAccount && !email) {
      return NextResponse.json(
        { error: 'El correo es obligatorio cuando agendas con cuenta vinculada.' },
        { status: 400 }
      )
    }

    const result = await AppointmentService.createPublicAppointment({
      ...appointmentPayload,
      userId: patientUserId,
      email: email || undefined,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof ContractValidationError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
