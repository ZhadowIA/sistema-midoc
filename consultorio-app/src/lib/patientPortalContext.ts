import prisma from '@/lib/prisma'

export async function getPatientContextByUser(userId: string) {
  const patient = await prisma.patient.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, clinicId: true, ownerDoctorId: true },
  })

  if (!patient) return null

  const latestAppointment = await prisma.appointment.findFirst({
    where: { patientId: patient.id },
    orderBy: { startTime: 'desc' },
    select: { doctorId: true, clinicId: true },
  })

  const doctorId = patient.ownerDoctorId ?? latestAppointment?.doctorId ?? null
  const clinicId = patient.clinicId ?? latestAppointment?.clinicId ?? null

  return {
    patientId: patient.id,
    doctorId,
    clinicId,
  }
}