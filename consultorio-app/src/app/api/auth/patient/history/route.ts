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
        paymentStatus: true,
        depositRequiredAmount: true,
        depositPaidAmount: true,
        depositDueAt: true,
        depositPaidAt: true,
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
            doctorConfig: {
              select: {
                normalConsultationPrice: true,
                extendedConsultationPrice: true,
              },
            },
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
        billingReceipt: {
          select: {
            id: true,
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

    const pendingPayments = appointments
      .filter(
        (item) =>
          (
            item.paymentStatus === 'PAYMENT_PENDING' ||
            (
              (item.status === 'PENDING' || item.status === 'CONFIRMED' || item.status === 'RESCHEDULED') &&
              !item.billingReceipt
            )
          ) &&
          new Date(item.startTime).getTime() > Date.now()
      )
      .map((item) => {
        const config = item.doctor.doctorConfig
        const estimatedAmount =
          item.depositRequiredAmount ??
          (item.appointmentType === 'EXTENDED'
            ? config?.extendedConsultationPrice
            : config?.normalConsultationPrice)
        return {
          appointmentId: item.id,
          estimatedAmount: estimatedAmount ? Number(estimatedAmount) : null,
          currency: 'MXN',
          dueAt: item.startTime,
          paymentStatus: item.paymentStatus,
          depositDueAt: item.depositDueAt,
          depositPaidAt: item.depositPaidAt,
        }
      })

    const pendingTotal = pendingPayments.reduce((acc, item) => acc + (item.estimatedAmount ?? 0), 0)

    return NextResponse.json({
      appointments,
      summary,
      billing: {
        pendingCount: pendingPayments.length,
        pendingTotal,
        pendingItems: pendingPayments,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
