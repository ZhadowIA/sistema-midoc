import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'

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
    const authUser = await getAuthenticatedUser()
    if (!authUser || (authUser.role !== 'DOCTOR' && authUser.role !== 'ADMIN' && authUser.role !== 'CLINIC_ADMIN')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const category = new URL(request.url).searchParams.get('category')

    const policies = await prisma.dataRetentionPolicy.findMany({
      where: {
        active: true,
        ...(category ? { dataCategory: category as never } : {}),
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
    const authUser = await getAuthenticatedUser()
    if (!authUser || (authUser.role !== 'DOCTOR' && authUser.role !== 'ADMIN' && authUser.role !== 'CLINIC_ADMIN')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', details: parsed.error.issues }, { status: 400 })
    }

    if (parsed.data.scope === 'CLINIC' && !parsed.data.clinicId) {
      return NextResponse.json({ error: 'clinicId es requerido para scope CLINIC' }, { status: 400 })
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