import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { can, PERMISSIONS } from '@/lib/permissions'

const createSchema = z.object({
  scope: z.enum(['GLOBAL', 'CLINIC']).default('GLOBAL'),
  clinicId: z.string().min(1).optional(),
  dataCategory: z.enum(['APPOINTMENTS', 'CLINICAL_NOTES', 'CONSENTS', 'AUDIT_LOGS', 'PATIENT_DOCUMENTS']),
  retentionDays: z.number().int().min(1).max(36500),
  hardDelete: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
})

export async function GET(request: Request) {
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const authUser = access.context.user
    if (!can(authUser, PERMISSIONS.CLINICAL_NOTE_READ)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const actor = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { clinicId: true },
    })

    const category = new URL(request.url).searchParams.get('category')
    const policyScopeFilter =
      authUser.role === 'ADMIN'
        ? {}
        : actor?.clinicId
          ? { OR: [{ scope: 'GLOBAL' as const }, { clinicId: actor.clinicId }] }
          : { scope: 'GLOBAL' as const }

    const policies = await prisma.dataRetentionPolicy.findMany({
      where: {
        active: true,
        ...(category ? { dataCategory: category as never } : {}),
        ...policyScopeFilter,
      },
      orderBy: [{ scope: 'asc' }, { dataCategory: 'asc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({ policies })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const authUser = access.context.user
    if (!can(authUser, PERMISSIONS.CLINICAL_NOTE_WRITE)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const actor = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { clinicId: true },
    })

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', details: parsed.error.issues }, { status: 400 })
    }

    if (parsed.data.scope === 'CLINIC' && !parsed.data.clinicId) {
      return NextResponse.json({ error: 'clinicId es requerido para scope CLINIC' }, { status: 400 })
    }
    if (parsed.data.scope === 'GLOBAL' && authUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Solo ADMIN puede crear políticas globales.' }, { status: 403 })
    }
    if (parsed.data.scope === 'CLINIC' && authUser.role !== 'ADMIN') {
      if (!actor?.clinicId || parsed.data.clinicId !== actor.clinicId) {
        return NextResponse.json({ error: 'No autorizado para crear políticas de otra clínica.' }, { status: 403 })
      }
    }

    const created = await prisma.dataRetentionPolicy.create({
      data: {
        scope: parsed.data.scope,
        clinicId: parsed.data.scope === 'CLINIC' ? parsed.data.clinicId ?? null : null,
        dataCategory: parsed.data.dataCategory,
        retentionDays: parsed.data.retentionDays,
        hardDelete: parsed.data.hardDelete,
        notes: parsed.data.notes,
      },
    })

    return NextResponse.json({ success: true, policy: created }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
