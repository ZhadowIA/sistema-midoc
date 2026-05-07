import prisma from '@/lib/prisma'
import { formatPatientName } from '@/lib/patientName'
import { ensureOfficialReceipt } from '@/lib/billingReceipt'

function getAmountMx(appointmentType: 'NORMAL' | 'EXTENDED', normalPrice: number, extendedPrice: number) {
  return appointmentType === 'EXTENDED' ? extendedPrice : normalPrice
}

export async function getBillingReceipts(doctorId: string) {
  const [config, appointments] = await Promise.all([
    prisma.doctorConfig.findUnique({
      where: { doctorId },
      select: {
        normalConsultationPrice: true,
        extendedConsultationPrice: true,
        receiptSeries: true,
        issuerLegalName: true,
        issuerTaxId: true,
        issuerTaxRegime: true,
        issuerFiscalZipCode: true,
      },
    }),
    prisma.appointment.findMany({
      where: { doctorId, status: 'COMPLETED' },
      orderBy: { startTime: 'desc' },
      take: 50,
      select: {
        id: true,
        startTime: true,
        appointmentType: true,
        patient: {
          select: {
            firstName: true,
            lastNamePaternal: true,
            lastNameMaternal: true,
            taxId: true,
            fiscalZipCode: true,
          },
        },
        doctor: { select: { name: true } },
      },
    }),
  ])

  const normalPrice = Number(config?.normalConsultationPrice ?? 0)
  const extendedPrice = Number(config?.extendedConsultationPrice ?? normalPrice)

  const receipts = await Promise.all(
    appointments.map(async (appointment) => {
      const amountMx = getAmountMx(appointment.appointmentType, normalPrice, extendedPrice)
      const official = await ensureOfficialReceipt({
        doctorId,
        appointmentId: appointment.id,
        issuedAt: appointment.startTime,
        preferredSeries: config?.receiptSeries,
      })

      return {
        appointmentId: appointment.id,
        series: official.series,
        folioNumber: official.folioNumber,
        folio: `${official.series}-${String(official.folioNumber).padStart(6, '0')}`,
        date: appointment.startTime,
        patientName: formatPatientName(appointment.patient),
        appointmentType: appointment.appointmentType,
        amountMx,
        currency: 'MXN',
        issuerFiscalData: {
          legalName: (config?.issuerLegalName ?? '').trim() || appointment.doctor.name,
          taxId: (config?.issuerTaxId ?? '').trim() || 'NO REGISTRADO',
          taxRegime: (config?.issuerTaxRegime ?? '').trim() || 'NO REGISTRADO',
          fiscalZipCode: (config?.issuerFiscalZipCode ?? '').trim() || 'NO REGISTRADO',
        },
        receiverFiscalData: {
          legalName: formatPatientName(appointment.patient),
          taxId: (appointment.patient.taxId ?? '').trim() || 'NO REGISTRADO',
          fiscalZipCode: (appointment.patient.fiscalZipCode ?? '').trim() || 'NO REGISTRADO',
        },
      }
    }),
  )

  return {
    receipts,
    priceConfig: {
      normalConsultationPrice: normalPrice,
      extendedConsultationPrice: extendedPrice,
    },
  }
}

