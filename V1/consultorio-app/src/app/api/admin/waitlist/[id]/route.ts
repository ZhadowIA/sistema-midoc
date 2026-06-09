import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireAgendaAccess } from '@/lib/medicalApi'
import { can, PERMISSIONS } from '@/lib/permissions'
import { SUBSCRIPTION_FEATURES } from '@/lib/subscriptionFeatures'

const patchSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'BOOKED', 'REMOVED']).optional(),
  priority: z.number().int().min(1).max(999).optional(),
  appointmentType: z.enum(['NORMAL', 'EXTENDED']).nullable().optional(),
  preferredWeekdays: z.array(z.number().int().min(1).max(7)).max(7).nullable().optional(),
  preferredStartMinute: z.number().int().min(0).max(1439).nullable().optional(),
  preferredEndMinute: z.number().int().min(0).max(1439).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params

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

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', details: parsed.error.issues }, { status: 400 })
    }

    const entry = await prisma.waitlistEntry.findUnique({
      where: { id: params.id },
      select: { id: true, doctorId: true, clinicId: true },
    })
    if (!entry) return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })

    if (authUser.role === 'DOCTOR' && entry.doctorId !== authUser.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    if (authUser.role === 'CLINIC_ADMIN' && entry.doctorId !== authUser.id) {
      const actor = await prisma.user.findUnique({ where: { id: authUser.id }, select: { clinicId: true } })
      if (
        !actor?.clinicId ||
        !can(authUser, PERMISSIONS.CLINIC_MANAGE_DOCTORS, {
          sameClinic: actor.clinicId === entry.clinicId,
        })
      ) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
      }
    }

    const updated = await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: {
        status: parsed.data.status,
        priority: parsed.data.priority,
        appointmentType: parsed.data.appointmentType,
        preferredWeekdays: parsed.data.preferredWeekdays ?? undefined,
        preferredStartMinute: parsed.data.preferredStartMinute ?? undefined,
        preferredEndMinute: parsed.data.preferredEndMinute ?? undefined,
        notes: parsed.data.notes,
      },
    })

    return NextResponse.json({ success: true, entry: updated })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
