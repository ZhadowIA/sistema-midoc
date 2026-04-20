import prisma from '@/lib/prisma'

const DEFAULT_SERIES = 'A'

export function normalizeReceiptSeries(series: string | null | undefined) {
  const value = (series ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return value || DEFAULT_SERIES
}

export async function ensureOfficialReceipt(params: {
  doctorId: string
  appointmentId: string
  issuedAt: Date
  preferredSeries?: string | null
}) {
  const series = normalizeReceiptSeries(params.preferredSeries)

  return prisma.$transaction(async (tx) => {
    const existing = await tx.billingReceipt.findUnique({
      where: { appointmentId: params.appointmentId },
      select: { series: true, folioNumber: true },
    })
    if (existing) return existing

    const latest = await tx.billingReceipt.findFirst({
      where: { doctorId: params.doctorId, series },
      orderBy: { folioNumber: 'desc' },
      select: { folioNumber: true },
    })

    return tx.billingReceipt.create({
      data: {
        doctorId: params.doctorId,
        appointmentId: params.appointmentId,
        series,
        folioNumber: (latest?.folioNumber ?? 0) + 1,
        issuedAt: params.issuedAt,
      },
      select: { series: true, folioNumber: true },
    })
  })
}
