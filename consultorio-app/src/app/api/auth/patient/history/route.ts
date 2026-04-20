import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET() {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || authUser.role !== 'PATIENT') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        patient: {
          userId: authUser.id,
        },
      },
      orderBy: { startTime: 'desc' },
      select: {
        id: true,
        status: true,
        source: true,
        appointmentType: true,
        durationMin: true,
        startTime: true,
        endTime: true,
        doctor: {
          select: {
            id: true,
            name: true,
            specialty: true,
            slug: true,
            profileImage: true,
          },
        },
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

    const summary = {
      total: appointments.length,
      completed: appointments.filter((item) => item.status === 'COMPLETED').length,
      upcoming: appointments.filter(
        (item) =>
          new Date(item.startTime).getTime() > Date.now() &&
          item.status !== 'CANCELLED'
      ).length,
      cancelled: appointments.filter((item) => item.status === 'CANCELLED').length,
    }

    return NextResponse.json({
      appointments,
      summary,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
