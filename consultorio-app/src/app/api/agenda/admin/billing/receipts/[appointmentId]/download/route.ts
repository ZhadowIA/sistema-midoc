import { format } from 'date-fns'
import prisma from '@/lib/prisma'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { formatPatientName } from '@/lib/patientName'
import { ensureOfficialReceipt } from '@/lib/billingReceipt'

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim() || 'No registrado'
}

export async function GET(
  _request: Request,
  props: { params: Promise<{ appointmentId: string }> },
) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const [config, appointment] = await Promise.all([
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
      prisma.appointment.findFirst({
        where: {
          id: params.appointmentId,
          doctorId,
          status: 'COMPLETED',
        },
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
          doctor: {
            select: { name: true, specialty: true },
          },
        },
      }),
    ])

    if (!appointment) {
      return new Response(JSON.stringify({ error: 'Cita completada no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const normalPrice = Number(config?.normalConsultationPrice ?? 0)
    const extendedPrice = Number(config?.extendedConsultationPrice ?? normalPrice)
    const amountMx = appointment.appointmentType === 'EXTENDED' ? extendedPrice : normalPrice
    const official = await ensureOfficialReceipt({
      doctorId,
      appointmentId: appointment.id,
      issuedAt: appointment.startTime,
      preferredSeries: config?.receiptSeries,
    })
    const folio = `${official.series}-${String(official.folioNumber).padStart(6, '0')}`
    const patientName = formatPatientName(appointment.patient)
    const issuerLegalName = (config?.issuerLegalName ?? '').trim() || appointment.doctor.name

    const lines = [
      'RECIBO BASICO - MIDOC',
      '=====================================',
      `Serie: ${official.series}`,
      `Folio: ${official.folioNumber}`,
      `Folio completo: ${folio}`,
      `Fecha de consulta: ${format(appointment.startTime, 'dd/MM/yyyy HH:mm')}`,
      `Paciente: ${patientName}`,
      `Medico: ${appointment.doctor.name}`,
      `Especialidad: ${normalizeText(appointment.doctor.specialty)}`,
      `Tipo de consulta: ${appointment.appointmentType}`,
      '',
      `Importe: $${amountMx.toFixed(2)} MXN`,
      '',
      'DATOS FISCALES EMISOR',
      `Razon social: ${issuerLegalName}`,
      `RFC: ${normalizeText(config?.issuerTaxId)}`,
      `Regimen fiscal: ${normalizeText(config?.issuerTaxRegime)}`,
      `CP fiscal: ${normalizeText(config?.issuerFiscalZipCode)}`,
      '',
      'DATOS FISCALES RECEPTOR',
      `Razon social: ${patientName}`,
      `RFC: ${normalizeText(appointment.patient.taxId)}`,
      `CP fiscal: ${normalizeText(appointment.patient.fiscalZipCode)}`,
      '',
      'Este documento es un recibo simple para control administrativo interno.',
    ]

    const fileName = `recibo-${folio}.txt`
    return new Response(lines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
