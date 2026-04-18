import { addMinutes, format } from 'date-fns'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { getWhatsAppProviderSendUrl } from '@/lib/whatsappProvider'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { getRequestIp, getUserAgent } from '@/lib/requestContext'

const ALLOWED_STATUS = new Set(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'])

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, doctorId },
      include: {
        patient: true,
        questionnaire: true,
        doctor: true,
        consentCaptures: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    })

    if (!appointment) {
      return jsonNoStore({ error: 'Cita no encontrada' }, { status: 404 })
    }

    return jsonNoStore(appointment)
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientValidationError) {
      const message = error.message.includes('ownerDoctorId')
        ? 'El servidor requiere reinicio para cargar cambios de base de datos. Detén y vuelve a iniciar la app.'
        : 'Datos inválidos para actualizar la cita.'
      return jsonNoStore({ error: message }, { status: 400 })
    }

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
    const actorUserId = access.context.user.id
    const ipAddress = getRequestIp(request)
    const userAgent = getUserAgent(request)

    const body = await request.json()

    const existing = await prisma.appointment.findFirst({
      where: { id: params.id, doctorId },
      include: { patient: true },
    })
    if (!existing) return jsonNoStore({ error: 'No autorizado' }, { status: 403 })

    if (body.action === 'ASSIGN_PATIENT') {
      if (!body.patientId || typeof body.patientId !== 'string') {
        return jsonNoStore({ error: 'Falta patientId' }, { status: 400 })
      }

      const targetPatient = await prisma.patient.findFirst({
        where: {
          id: body.patientId,
          ownerDoctorId: doctorId,
        },
        select: { id: true },
      })

      if (!targetPatient) {
        return jsonNoStore(
          { error: 'No se encontró el paciente en tu directorio.' },
          { status: 404 }
        )
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.appointment.update({
          where: { id: params.id },
          data: { patientId: targetPatient.id },
        })

        await tx.clinicalNote.updateMany({
          where: { appointmentId: params.id },
          data: { patientId: targetPatient.id },
        })

        await AppointmentAuditService.safeLog(
          {
            doctorId,
            appointmentId: params.id,
            patientId: targetPatient.id,
            actorType: 'DOCTOR',
            actorUserId,
            source: 'ADMIN_PANEL',
            action: 'PATIENT_ASSIGNED_TO_APPOINTMENT',
            ipAddress,
            userAgent,
            metadata: {
              previousPatientId: existing.patientId,
              nextPatientId: targetPatient.id,
            },
          },
          tx
        )

        return tx.appointment.findUnique({
          where: { id: params.id },
          include: {
            patient: true,
            questionnaire: true,
            doctor: true,
          },
        })
      })

      if (!updated) {
        return jsonNoStore({ error: 'No fue posible asignar la cita.' }, { status: 500 })
      }

      return jsonNoStore(updated)
    }

    if (body.action === 'CREATE_AND_ASSIGN_PATIENT') {
      const normalizedFullName = existing.patient.fullName.trim()
      const normalizedPhone = existing.patient.phone.trim()

      const updated = await prisma.$transaction(async (tx) => {
        let createdPatientInAction = false
        let targetPatient = await tx.patient.findFirst({
          where: {
            ownerDoctorId: doctorId,
            fullName: normalizedFullName,
            phone: normalizedPhone,
          },
        })

        if (!targetPatient) {
          targetPatient = await tx.patient.create({
            data: {
              ownerDoctorId: doctorId,
              userId: existing.patient.userId || undefined,
              fullName: normalizedFullName,
              phone: normalizedPhone,
              email: existing.patient.email?.trim().toLowerCase() || undefined,
              dateOfBirth: existing.patient.dateOfBirth,
            },
          })
          createdPatientInAction = true
        } else if (!targetPatient.userId && existing.patient.userId) {
          targetPatient = await tx.patient.update({
            where: { id: targetPatient.id },
            data: { userId: existing.patient.userId },
          })
        }

        await tx.appointment.update({
          where: { id: params.id },
          data: { patientId: targetPatient.id },
        })

        await tx.clinicalNote.updateMany({
          where: { appointmentId: params.id },
          data: { patientId: targetPatient.id },
        })

        if (createdPatientInAction) {
          await AppointmentAuditService.safeLog(
            {
              doctorId,
              appointmentId: params.id,
              patientId: targetPatient.id,
              actorType: 'DOCTOR',
              actorUserId,
              source: 'ADMIN_PANEL',
              action: 'PATIENT_CREATED_FROM_APPOINTMENT',
              ipAddress,
              userAgent,
              metadata: {
                fullName: normalizedFullName,
                phone: normalizedPhone,
              },
            },
            tx
          )
        }

        await AppointmentAuditService.safeLog(
          {
            doctorId,
            appointmentId: params.id,
            patientId: targetPatient.id,
            actorType: 'DOCTOR',
            actorUserId,
            source: 'ADMIN_PANEL',
            action: 'PATIENT_ASSIGNED_TO_APPOINTMENT',
            ipAddress,
            userAgent,
            metadata: {
              previousPatientId: existing.patientId,
              nextPatientId: targetPatient.id,
              createdPatientInAction,
            },
          },
          tx
        )

        return tx.appointment.findUnique({
          where: { id: params.id },
          include: {
            patient: true,
            questionnaire: true,
            doctor: true,
          },
        })
      })

      if (!updated) {
        return jsonNoStore({ error: 'No fue posible crear y vincular el paciente.' }, { status: 500 })
      }

      return jsonNoStore(updated)
    }

    if (body.action === 'RESCHEDULE') {
      if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
        return jsonNoStore(
          { error: 'INVALID_STATE', message: 'No se puede reagendar una cita cancelada o completada.' },
          { status: 409 }
        )
      }

      if (!body.newStartTime || typeof body.newStartTime !== 'string') {
        return jsonNoStore({ error: 'Falta newStartTime' }, { status: 400 })
      }

      const newStart = new Date(body.newStartTime)
      if (Number.isNaN(newStart.getTime())) {
        return jsonNoStore({ error: 'Fecha/hora inválida' }, { status: 400 })
      }

      const newEnd = addMinutes(newStart, existing.durationMin)

      const overlapAppointment = await prisma.appointment.findFirst({
        where: {
          doctorId,
          id: { not: params.id },
          status: { notIn: ['CANCELLED'] },
          startTime: { lt: newEnd },
          endTime: { gt: newStart },
        },
      })

      if (overlapAppointment) {
        return jsonNoStore(
          { error: 'OVERLAP', message: 'Ya hay una cita agendada en este horario.' },
          { status: 409 }
        )
      }

      const overlapBlock = await prisma.scheduleBlock.findFirst({
        where: {
          doctorId,
          startTime: { lt: newEnd },
          endTime: { gt: newStart },
        },
      })

      if (overlapBlock) {
        return jsonNoStore(
          { error: 'BLOCKED', message: 'Ese horario está bloqueado en agenda.' },
          { status: 409 }
        )
      }

      const localDate = new Date(newStart)
      localDate.setHours(0, 0, 0, 0)

      const updated = await prisma.appointment.update({
        where: { id: params.id },
        data: {
          date: localDate,
          startTime: newStart,
          endTime: newEnd,
          notes: body.notes !== undefined ? body.notes : existing.notes,
          status: existing.status === 'PENDING' ? 'PENDING' : 'CONFIRMED',
        },
        include: {
          patient: true,
          questionnaire: true,
          doctor: true,
        },
      })

      await AppointmentAuditService.safeLog({
        doctorId,
        appointmentId: updated.id,
        patientId: updated.patientId,
        actorType: 'DOCTOR',
        actorUserId,
        source: 'ADMIN_PANEL',
        action: 'APPOINTMENT_RESCHEDULED',
        ipAddress,
        userAgent,
        fromStatus: existing.status,
        toStatus: updated.status,
        metadata: {
          previousStartTime: existing.startTime.toISOString(),
          previousEndTime: existing.endTime.toISOString(),
          nextStartTime: updated.startTime.toISOString(),
          nextEndTime: updated.endTime.toISOString(),
        },
      })

      const config = await prisma.doctorConfig.findUnique({ where: { doctorId } })
      if (config?.whatsappConnected) {
        const msg = `Hola *${updated.patient.fullName}*, te informamos que tu cita fue reagendada. Nueva fecha y hora: *${format(updated.startTime, 'dd/MM/yyyy HH:mm')}*.`
        try {
          await fetch(getWhatsAppProviderSendUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              doctorId,
              to: updated.patient.phone,
              message: msg,
            }),
          })
        } catch (err) {
          console.error('Error WA Admin:', err)
        }
      }

      return jsonNoStore(updated)
    }

    const requestedStatus = typeof body.status === 'string' ? body.status : undefined
    if (requestedStatus && !ALLOWED_STATUS.has(requestedStatus)) {
      return jsonNoStore(
        { error: 'Estado inválido. Usa acción RESCHEDULE para reagendar.' },
        { status: 400 }
      )
    }

    const updated = await prisma.appointment.update({
      where: { id: params.id },
      data: {
        status: requestedStatus ?? existing.status,
        notes: body.notes !== undefined ? body.notes : undefined,
      },
      include: {
        patient: true,
        questionnaire: true,
        doctor: true,
      },
    })

    if (existing.status !== updated.status) {
      await AppointmentAuditService.safeLog({
        doctorId,
        appointmentId: updated.id,
        patientId: updated.patientId,
        actorType: 'DOCTOR',
        actorUserId,
        source: 'ADMIN_PANEL',
        ipAddress,
        userAgent,
        action:
          updated.status === 'CANCELLED'
            ? 'APPOINTMENT_CANCELLED'
            : 'APPOINTMENT_STATUS_CHANGED',
        fromStatus: existing.status,
        toStatus: updated.status,
      })
    }

    const config = await prisma.doctorConfig.findUnique({ where: { doctorId } })
    if (config?.whatsappConnected && existing.status !== updated.status) {
      let msg = ''
      if (updated.status === 'CANCELLED') {
        msg = `Hola *${updated.patient.fullName}*, lamentamos informarte que tu cita programada para el ${format(existing.startTime, 'dd/MM/yyyy HH:mm')} ha sido *CANCELADA* por el doctor. Por favor contáctanos para más información.`
      }

      if (msg) {
        try {
          await fetch(getWhatsAppProviderSendUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              doctorId,
              to: updated.patient.phone,
              message: msg,
            }),
          })
        } catch (err) {
          console.error('Error WA Admin:', err)
        }
      }
    }

    return jsonNoStore(updated)
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientValidationError) {
      const message = error.message.includes('ownerDoctorId')
        ? 'El servidor requiere reinicio para cargar cambios de base de datos. Detén y vuelve a iniciar la app.'
        : 'Datos inválidos para actualizar la cita.'
      return jsonNoStore({ error: message }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
