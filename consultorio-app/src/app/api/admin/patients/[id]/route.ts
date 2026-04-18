import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const patient = await prisma.patient.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        medicalRecord: true,
        appointments: {
          where: { doctorId },
          orderBy: { startTime: 'desc' },
          include: {
            clinicalNote: true,
            questionnaire: {
              select: {
                createdAt: true,
              },
            },
            notifications: {
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                type: true,
                status: true,
                createdAt: true,
                sentAt: true,
              },
            },
          },
        },
      },
    })

    if (!patient) return jsonNoStore({ error: 'Paciente no encontrado' }, { status: 404 })

    const isOwnedByDoctor = patient.ownerDoctorId === doctorId || patient.appointments.length > 0
    if (!isOwnedByDoctor) {
      return jsonNoStore({ error: 'No autorizado para ver este paciente' }, { status: 403 })
    }

    if (!patient.ownerDoctorId) {
      await prisma.patient.update({
        where: { id: patient.id },
        data: { ownerDoctorId: doctorId },
      })
      patient.ownerDoctorId = doctorId
    }

    const timeline = patient.appointments.map((appointment) => {
      const note = appointment.clinicalNote
      const soapSections = [note?.subjective, note?.objective, note?.assessment, note?.plan]
      const completedSoapSections = soapSections.filter((section) => Boolean(section?.trim())).length
      const soapCompletionPct = Math.round((completedSoapSections / 4) * 100)

      const notificationSummary = appointment.notifications.reduce(
        (acc, notification) => {
          acc.total += 1
          if (notification.status === 'SENT') acc.sent += 1
          if (notification.status === 'FAILED') acc.failed += 1
          if (notification.status === 'PENDING') acc.pending += 1
          return acc
        },
        { total: 0, sent: 0, failed: 0, pending: 0 }
      )

      return {
        id: appointment.id,
        status: appointment.status,
        source: appointment.source,
        appointmentType: appointment.appointmentType,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        durationMin: appointment.durationMin,
        questionnaireAnswered: appointment.questionnaireAnswered,
        questionnaireAnsweredAt: appointment.questionnaire?.createdAt || null,
        hasClinicalNote: Boolean(note),
        soap: note
          ? {
              subjective: note.subjective,
              objective: note.objective,
              assessment: note.assessment,
              plan: note.plan,
            }
          : null,
        soapCompletion: {
          completedSections: completedSoapSections,
          totalSections: 4,
          pct: soapCompletionPct,
        },
        notificationSummary,
      }
    })

    const summary = {
      totalAppointments: timeline.length,
      completedAppointments: timeline.filter((item) => item.status === 'COMPLETED').length,
      appointmentsWithSoap: timeline.filter((item) => item.hasClinicalNote).length,
      questionnairesAnswered: timeline.filter((item) => item.questionnaireAnswered).length,
    }

    return jsonNoStore({
      ...patient,
      linkedAccount: patient.user
        ? {
            id: patient.user.id,
            name: patient.user.name,
            email: patient.user.email,
          }
        : null,
      timeline,
      summary,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const body = await request.json()

    const patient = await prisma.patient.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        ownerDoctorId: true,
        appointments: {
          where: { doctorId },
          select: { id: true },
          take: 1,
        },
      },
    })

    if (!patient) return jsonNoStore({ error: 'Paciente no encontrado' }, { status: 404 })

    const isOwnedByDoctor = patient.ownerDoctorId === doctorId || patient.appointments.length > 0
    if (!isOwnedByDoctor) {
      return jsonNoStore({ error: 'No autorizado para modificar este paciente' }, { status: 403 })
    }

    if (!patient.ownerDoctorId) {
      await prisma.patient.update({
        where: { id: patient.id },
        data: { ownerDoctorId: doctorId },
      })
    }

    // Upsert medical record globally for this patient
    const record = await prisma.medicalRecord.upsert({
      where: { patientId: params.id },
      update: {
        bloodType: body.bloodType !== undefined ? body.bloodType : undefined,
        allergies: body.allergies !== undefined ? body.allergies : undefined,
        chronicConditions: body.chronicConditions !== undefined ? body.chronicConditions : undefined,
        familyHistory: body.familyHistory !== undefined ? body.familyHistory : undefined,
      },
      create: {
        patientId: params.id,
        bloodType: body.bloodType || null,
        allergies: body.allergies || null,
        chronicConditions: body.chronicConditions || null,
        familyHistory: body.familyHistory || null,
      },
    })

    return jsonNoStore(record)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
