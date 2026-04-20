import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { toLocalDateKey } from '@/lib/dateTime'

export async function GET() {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || authUser.role !== 'PATIENT') {
      return NextResponse.json({ authenticated: false })
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    })

    if (!user || user.role !== 'PATIENT') {
      return NextResponse.json({ authenticated: false })
    }

    const latestPatient = await prisma.patient.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastNamePaternal: true,
        lastNameMaternal: true,
        phone: true,
        email: true,
        dateOfBirth: true,
      },
    })

    return NextResponse.json({
      authenticated: true,
      user,
      profile: latestPatient
        ? {
            id: latestPatient.id,
            firstName: latestPatient.firstName,
            lastNamePaternal: latestPatient.lastNamePaternal,
            lastNameMaternal: latestPatient.lastNameMaternal,
            phone: latestPatient.phone,
            email: latestPatient.email,
            dateOfBirth: toLocalDateKey(latestPatient.dateOfBirth),
          }
        : null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
