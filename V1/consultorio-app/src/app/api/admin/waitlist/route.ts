import { NextResponse } from 'next/server'
import { WaitlistEntryStatus } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireAgendaAccess } from '@/lib/medicalApi'
import { WaitlistService } from '@/services/WaitlistService'
import { can, PERMISSIONS } from '@/lib/permissions'
import { SUBSCRIPTION_FEATURES } from '@/lib/subscriptionFeatures'

const createEntrySchema = z.object({
  doctorId: z.string().min(1).optional(),
  patientId: z.string().min(1),
  appointmentType: z.enum(['NORMAL', 'EXTENDED']).optional(),
  preferredWeekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  preferredStartMinute: z.number().int().min(0).max(1439).optional(),
  preferredEndMinute: z.number().int().min(0).max(1439).optional(),
  priority: z.number().int().min(1).max(999).optional(),
  notes: z.string().max(500).optional(),
})
const statusQuerySchema = z.nativeEnum(WaitlistEntryStatus)

async function resolveDoctorScope(authUser: { id: string; role: string }, requestedDoctorId?: string) {
  const actor = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { id: true, role: true, clinicId: true },
  })
  if (!actor) return null

  const targetDoctorId = requestedDoctorId && requestedDoctorId.trim().length > 0 ? requestedDoctorId : actor.id
  if (targetDoctorId === actor.id) {
    return { doctorId: actor.id, clinicId: actor.clinicId ?? null }
  }

  if (!can(actor.role, PERMISSIONS.CLINIC_MANAGE_DOCTORS)) return null
  if (!actor.clinicId) return null

  const doctor = await prisma.user.findFirst({
    where: {
      id: targetDoctorId,
      clinicId: actor.clinicId,
      active: true,
      role: { in: ['DOCTOR', 'CLINIC_ADMIN'] },
    },
    select: { id: true, clinicId: true },
  })

  if (!doctor) return null
  return { doctorId: doctor.id, clinicId: doctor.clinicId ?? null }
}

export async function GET(request: Request) {
  try {
    const access = await requireAgendaAccess({
      allowSecretary: false,
      requiredFeature: SUBSCRIPTION_FEATURES.AGENDA_WAITLIST,
      featureForbiddenMessage: 'La lista de espera no está incluida en tu plan.',
    })
    if (access.response) return access.response
    const authUser = access.context.user
    if (!can(authUser, PERMISSIONS.APPOINTMENT_UPDATE)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const scope = await resolveDoctorScope(authUser, searchParams.get('doctorId') ?? undefined)
    if (!scope) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const statusRaw = searchParams.get('status')
    const status = statusRaw ? statusQuerySchema.safeParse(statusRaw).data : undefined

    const entries = await prisma.waitlistEntry.findMany({
      where: {
        doctorId: scope.doctorId,
        ...(status ? { status } : {}),
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastNamePaternal: true,
            lastNameMaternal: true,
            phone: true,
          },
        },
        offers: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json({ success: true, entries })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAgendaAccess({
      allowSecretary: false,
      requiredFeature: SUBSCRIPTION_FEATURES.AGENDA_WAITLIST,
      featureForbiddenMessage: 'La lista de espera no está incluida en tu plan.',
    })
    if (access.response) return access.response
    const authUser = access.context.user
    if (!can(authUser, PERMISSIONS.APPOINTMENT_CREATE)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const parsed = createEntrySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', details: parsed.error.issues }, { status: 400 })
    }

    const scope = await resolveDoctorScope(authUser, parsed.data.doctorId)
    if (!scope) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const patient = await prisma.patient.findFirst({
      where: {
        id: parsed.data.patientId,
        OR: [
          { ownerDoctorId: scope.doctorId },
          ...(scope.clinicId ? [{ clinicId: scope.clinicId }] : []),
        ],
      },
      select: { id: true },
    })

    if (!patient) {
      return NextResponse.json(
        { error: 'No se encontró el paciente dentro del alcance del médico/clínica.' },
        { status: 404 }
      )
    }

    const entry = await WaitlistService.createEntry({
      doctorId: scope.doctorId,
      clinicId: scope.clinicId,
      patientId: parsed.data.patientId,
      appointmentType: parsed.data.appointmentType ?? null,
      preferredWeekdays: parsed.data.preferredWeekdays ?? null,
      preferredStartMinute: parsed.data.preferredStartMinute ?? null,
      preferredEndMinute: parsed.data.preferredEndMinute ?? null,
      priority: parsed.data.priority,
      notes: parsed.data.notes ?? null,
    })

    return NextResponse.json({ success: true, entry }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
