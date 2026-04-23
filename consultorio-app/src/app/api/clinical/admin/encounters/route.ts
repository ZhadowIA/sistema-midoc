import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { createClinicalEncounterSchema } from '@/lib/clinicalEncounterContracts'

export async function GET(request: Request) {
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patientId')?.trim() || undefined
    const status = searchParams.get('status')?.trim() || undefined

    const encounters = await prisma.clinicalEncounter.findMany({
      where: {
        doctorId,
        ...(patientId ? { patientId } : {}),
        ...(status && (status === 'OPEN' || status === 'CLOSED' || status === 'ARCHIVED')
          ? { status }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        source: true,
        status: true,
        appointmentId: true,
        openedAt: true,
        closedAt: true,
        createdAt: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastNamePaternal: true,
            lastNameMaternal: true,
          },
        },
      },
    })

    return jsonNoStore({ encounters })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId
    const authUser = access.context.user

    const parsed = createClinicalEncounterSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Payload inválido', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const patient = await prisma.patient.findFirst({
      where: {
        id: parsed.data.patientId,
        OR: [
          { ownerDoctorId: doctorId },
          { appointments: { some: { doctorId } } },
        ],
      },
      select: { id: true, clinicId: true },
    })
    if (!patient) {
      return NextResponse.json({ error: 'Paciente no encontrado en tu contexto clínico' }, { status: 404 })
    }

    if (parsed.data.appointmentId) {
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: parsed.data.appointmentId,
          doctorId,
        },
        select: { id: true, patientId: true, clinicId: true },
      })
      if (!appointment) {
        return NextResponse.json({ error: 'Cita no encontrada para este médico' }, { status: 404 })
      }
      if (appointment.patientId !== patient.id) {
        return NextResponse.json(
          { error: 'La cita indicada no pertenece al paciente enviado' },
          { status: 409 }
        )
      }
    }

    const encounter = await prisma.clinicalEncounter.create({
      data: {
        doctorId,
        patientId: patient.id,
        clinicId: patient.clinicId,
        appointmentId: parsed.data.appointmentId,
        source: parsed.data.source,
      },
      select: {
        id: true,
        doctorId: true,
        patientId: true,
        clinicId: true,
        appointmentId: true,
        source: true,
        status: true,
        openedAt: true,
        createdAt: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        doctorId,
        appointmentId: encounter.appointmentId,
        patientId: encounter.patientId,
        actorUserId: authUser.id,
        action: 'CLINICAL_ENCOUNTER_CREATED',
        metadata: {
          encounterId: encounter.id,
          source: encounter.source,
          standalone: !encounter.appointmentId,
        },
      },
    })

    return NextResponse.json({ success: true, encounter }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
