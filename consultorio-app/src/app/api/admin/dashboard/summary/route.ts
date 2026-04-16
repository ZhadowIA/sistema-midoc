import { NextResponse } from 'next/server'
import { AuditAction, Prisma } from '@prisma/client'
import { addMonths, format, startOfMonth, subDays, subMonths } from 'date-fns'
import prisma from '@/lib/prisma'
import { getAuthenticatedDoctorId } from '@/lib/auth'
import { getDayRangeLocal } from '@/lib/dateTime'
import { NotificationService } from '@/services/NotificationService'

type DashboardItem = {
  id: string
  patientId: string
  patientName: string
  date: string
  dateLocal: string
  time: string
  startTime: string
  endTime: string
  consultType: string
  status: string
  hasQuestionnaire: boolean
}

type SetupChecklistItem = {
  id: string
  label: string
  done: boolean
  hint: string
  actionLabel: string
  actionHref: string
}

type DashboardAnalyticsPoint = {
  monthKey: string
  label: string
  totalAppointments: number
  completedAppointments: number
  estimatedRevenueCompleted: number
}

type DashboardAnalyticsSummary = {
  currentMonth: {
    monthKey: string
    label: string
    totalAppointments: number
    completedAppointments: number
    pendingAppointments: number
    confirmedAppointments: number
    cancelledAppointments: number
    estimatedRevenueCompleted: number
    estimatedRevenueScheduled: number
  }
  lastSixMonths: DashboardAnalyticsPoint[]
  priceConfig: {
    normalConsultationPrice: number
    extendedConsultationPrice: number
  }
}

type DashboardPriorityThreeSummary = {
  windowDays: number
  metrics: {
    appointmentsConsidered: number
    noShows: number
    cancellations: number
    confirmedAppointments: number
    noShowRatePct: number
    confirmationRatePct: number
    cancellationRatePct: number
    averageMinutesToConfirmation: number | null
  }
  automationRules: {
    pendingEscalationMinutes: number
    pendingOverdueMinutes: number
    pendingAutoCloseHours: number
  }
  automationExecution: {
    overduePendingNow: number
    last7Days: {
      markedOverdue: number
      escalatedReminders: number
      autoClosedNoShow: number
    }
  }
  recentAuditEvents: Array<{
    id: string
    createdAt: string
    action: string
    actionLabel: string
    source: string
    actorType: string
    appointmentId: string | null
    appointmentStartTime: string | null
    patientName: string | null
    fromStatus: string | null
    toStatus: string | null
  }>
}

const PRIORITY_THREE_ACTION_LABELS: Record<string, string> = {
  APPOINTMENT_CREATED: 'Cita creada',
  APPOINTMENT_STATUS_CHANGED: 'Cambio de estado',
  APPOINTMENT_RESCHEDULED: 'Cita reagendada',
  APPOINTMENT_CANCELLED: 'Cita cancelada',
  APPOINTMENT_MARKED_OVERDUE: 'Cita marcada como vencida',
  APPOINTMENT_REMINDER_ESCALATED: 'Recordatorio escalado',
  APPOINTMENT_AUTO_CLOSED_NO_SHOW: 'Cita cerrada por no-show',
  PATIENT_ASSIGNED_TO_APPOINTMENT: 'Paciente vinculado a cita',
  PATIENT_CREATED_FROM_APPOINTMENT: 'Paciente creado desde cita',
}

function toRatePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Number(((numerator / denominator) * 100).toFixed(1))
}

function toAverageMinutes(values: number[]): number | null {
  if (values.length === 0) return null
  const total = values.reduce((acc, value) => acc + value, 0)
  return Number((total / values.length).toFixed(1))
}

function buildPriorityThreeSummary(input: {
  now: Date
  metricsWindowDays: number
  appointmentsWindow: Array<{
    id: string
    createdAt: Date
    startTime: Date
    status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'COMPLETED'
  }>
  auditWindow: Array<{
    id: string
    appointmentId: string | null
    action: AuditAction
    createdAt: Date
    source: string
    actorType: string
    fromStatus: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'COMPLETED' | null
    toStatus: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'COMPLETED' | null
    appointment: { id: string; startTime: Date } | null
    patient: { fullName: string } | null
  }>
  overduePendingNow: number
  autoRules: {
    pendingEscalationMinutes: number
    pendingOverdueMinutes: number
    pendingAutoCloseHours: number
  }
}): DashboardPriorityThreeSummary {
  const { now, metricsWindowDays, appointmentsWindow, auditWindow, overduePendingNow, autoRules } = input
  const windowStart7Days = subDays(now, 7)

  const noShowAppointmentIds = new Set(
    auditWindow
      .filter((event) => event.action === 'APPOINTMENT_AUTO_CLOSED_NO_SHOW' && event.appointmentId)
      .map((event) => event.appointmentId as string)
  )

  const confirmationTimesByAppointment = new Map<string, Date>()
  for (const event of auditWindow) {
    if (event.toStatus !== 'CONFIRMED' || !event.appointmentId) continue
    const current = confirmationTimesByAppointment.get(event.appointmentId)
    if (!current || event.createdAt < current) {
      confirmationTimesByAppointment.set(event.appointmentId, event.createdAt)
    }
  }

  const confirmationMinutes: number[] = []
  for (const appointment of appointmentsWindow) {
    const confirmedAt = confirmationTimesByAppointment.get(appointment.id)
    if (!confirmedAt) continue
    const deltaMinutes = Math.max(0, Math.round((confirmedAt.getTime() - appointment.createdAt.getTime()) / 60_000))
    confirmationMinutes.push(deltaMinutes)
  }

  const appointmentsConsidered = appointmentsWindow.length
  const cancellations = appointmentsWindow.filter((appointment) => appointment.status === 'CANCELLED').length
  const confirmedAppointments = new Set(confirmationTimesByAppointment.keys()).size
  const noShows = noShowAppointmentIds.size

  const last7Days = {
    markedOverdue: 0,
    escalatedReminders: 0,
    autoClosedNoShow: 0,
  }

  for (const event of auditWindow) {
    if (event.createdAt < windowStart7Days) continue
    if (event.action === 'APPOINTMENT_MARKED_OVERDUE') last7Days.markedOverdue += 1
    if (event.action === 'APPOINTMENT_REMINDER_ESCALATED') last7Days.escalatedReminders += 1
    if (event.action === 'APPOINTMENT_AUTO_CLOSED_NO_SHOW') last7Days.autoClosedNoShow += 1
  }

  return {
    windowDays: metricsWindowDays,
    metrics: {
      appointmentsConsidered,
      noShows,
      cancellations,
      confirmedAppointments,
      noShowRatePct: toRatePercent(noShows, appointmentsConsidered),
      confirmationRatePct: toRatePercent(confirmedAppointments, appointmentsConsidered),
      cancellationRatePct: toRatePercent(cancellations, appointmentsConsidered),
      averageMinutesToConfirmation: toAverageMinutes(confirmationMinutes),
    },
    automationRules: autoRules,
    automationExecution: {
      overduePendingNow,
      last7Days,
    },
    recentAuditEvents: auditWindow.slice(0, 15).map((event) => ({
      id: event.id,
      createdAt: event.createdAt.toISOString(),
      action: event.action,
      actionLabel: PRIORITY_THREE_ACTION_LABELS[event.action] ?? event.action,
      source: event.source,
      actorType: event.actorType,
      appointmentId: event.appointment?.id ?? event.appointmentId,
      appointmentStartTime: event.appointment?.startTime.toISOString() ?? null,
      patientName: event.patient?.fullName ?? null,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
    })),
  }
}

function mapAppointment(appointment: {
  id: string
  patientId: string
  patient: { fullName: string }
  date: Date
  startTime: Date
  endTime: Date
  appointmentType: 'NORMAL' | 'EXTENDED'
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'COMPLETED'
  questionnaireAnswered: boolean
}): DashboardItem {
  return {
    id: appointment.id,
    patientId: appointment.patientId,
    patientName: appointment.patient.fullName,
    date: appointment.date.toISOString(),
    dateLocal: format(appointment.startTime, 'yyyy-MM-dd'),
    time: format(appointment.startTime, 'HH:mm'),
    startTime: appointment.startTime.toISOString(),
    endTime: appointment.endTime.toISOString(),
    consultType: appointment.appointmentType.toLowerCase(),
    status: appointment.status.toLowerCase(),
    hasQuestionnaire: appointment.questionnaireAnswered,
  }
}

function getAppointmentEstimatedPrice(input: {
  appointmentType: 'NORMAL' | 'EXTENDED'
  normalConsultationPrice: number
  extendedConsultationPrice: number
}) {
  return input.appointmentType === 'EXTENDED'
    ? input.extendedConsultationPrice
    : input.normalConsultationPrice
}

function buildAnalyticsSummary(input: {
  now: Date
  appointmentsWindow: Array<{
    startTime: Date
    status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'COMPLETED'
    appointmentType: 'NORMAL' | 'EXTENDED'
  }>
  normalConsultationPrice: number
  extendedConsultationPrice: number
}): DashboardAnalyticsSummary {
  const { now, appointmentsWindow, normalConsultationPrice, extendedConsultationPrice } = input
  const currentMonthStart = startOfMonth(now)
  const currentMonthEndExclusive = addMonths(currentMonthStart, 1)

  const monthStarts = Array.from({ length: 6 }, (_, index) =>
    startOfMonth(subMonths(now, 5 - index))
  )

  const monthlyMap = new Map<string, DashboardAnalyticsPoint>()
  for (const monthStart of monthStarts) {
    const monthKey = format(monthStart, 'yyyy-MM')
    monthlyMap.set(monthKey, {
      monthKey,
      label: format(monthStart, 'MM/yyyy'),
      totalAppointments: 0,
      completedAppointments: 0,
      estimatedRevenueCompleted: 0,
    })
  }

  const currentMonth = {
    monthKey: format(currentMonthStart, 'yyyy-MM'),
    label: format(currentMonthStart, 'MM/yyyy'),
    totalAppointments: 0,
    completedAppointments: 0,
    pendingAppointments: 0,
    confirmedAppointments: 0,
    cancelledAppointments: 0,
    estimatedRevenueCompleted: 0,
    estimatedRevenueScheduled: 0,
  }

  for (const appointment of appointmentsWindow) {
    const monthKey = format(appointment.startTime, 'yyyy-MM')
    const point = monthlyMap.get(monthKey)
    const estimatedPrice = getAppointmentEstimatedPrice({
      appointmentType: appointment.appointmentType,
      normalConsultationPrice,
      extendedConsultationPrice,
    })

    if (point) {
      point.totalAppointments += 1
      if (appointment.status === 'COMPLETED') {
        point.completedAppointments += 1
        point.estimatedRevenueCompleted += estimatedPrice
      }
    }

    if (appointment.startTime >= currentMonthStart && appointment.startTime < currentMonthEndExclusive) {
      currentMonth.totalAppointments += 1
      if (appointment.status === 'COMPLETED') {
        currentMonth.completedAppointments += 1
        currentMonth.estimatedRevenueCompleted += estimatedPrice
      } else if (appointment.status === 'PENDING') {
        currentMonth.pendingAppointments += 1
        currentMonth.estimatedRevenueScheduled += estimatedPrice
      } else if (appointment.status === 'CONFIRMED' || appointment.status === 'RESCHEDULED') {
        currentMonth.confirmedAppointments += 1
        currentMonth.estimatedRevenueScheduled += estimatedPrice
      } else if (appointment.status === 'CANCELLED') {
        currentMonth.cancelledAppointments += 1
      }
    }
  }

  return {
    currentMonth,
    lastSixMonths: monthStarts.map((monthStart) => {
      const key = format(monthStart, 'yyyy-MM')
      return (
        monthlyMap.get(key) ?? {
          monthKey: key,
          label: format(monthStart, 'MM/yyyy'),
          totalAppointments: 0,
          completedAppointments: 0,
          estimatedRevenueCompleted: 0,
        }
      )
    }),
    priceConfig: {
      normalConsultationPrice,
      extendedConsultationPrice,
    },
  }
}

function buildSetupChecklist(input: {
  profile: {
    name: string | null
    phone: string | null
    specialty: string | null
    professionalLicense: string | null
    clinicAddress: string | null
    logoImage: string | null
  } | null
  config: {
    consultationDurationMin: number
    normalConsultationPrice: Prisma.Decimal | null
    extendedConsultationPrice: Prisma.Decimal | null
    reminderLeadHours: string | null
    whatsappConnected: boolean
  } | null
  activeAvailabilityBlocks: number
}) {
  const { profile, config, activeAvailabilityBlocks } = input

  const items: SetupChecklistItem[] = [
    {
      id: 'profile_base',
      label: 'Perfil profesional base',
      done: Boolean(profile?.name?.trim() && profile?.phone?.trim() && profile?.specialty?.trim()),
      hint: 'Nombre, teléfono y especialidad listos para operar.',
      actionLabel: 'Completar perfil',
      actionHref: '/medico/configuracion?tab=perfil',
    },
    {
      id: 'profile_branding',
      label: 'Datos profesionales y branding',
      done: Boolean(profile?.professionalLicense?.trim() && profile?.clinicAddress?.trim() && profile?.logoImage?.trim()),
      hint: 'Incluye cédula, dirección y logo para receta.',
      actionLabel: 'Actualizar datos',
      actionHref: '/medico/configuracion?tab=perfil',
    },
    {
      id: 'pricing',
      label: 'Duración y precios de consulta',
      done: Boolean(
        config &&
          config.consultationDurationMin >= 15 &&
          config.consultationDurationMin <= 120 &&
          config.normalConsultationPrice !== null
      ),
      hint: 'Define duración y al menos el precio de consulta normal.',
      actionLabel: 'Configurar parámetros',
      actionHref: '/medico/configuracion?tab=parametros',
    },
    {
      id: 'availability',
      label: 'Agenda con disponibilidad activa',
      done: activeAvailabilityBlocks > 0,
      hint: 'Debe existir al menos un bloque de disponibilidad futura.',
      actionLabel: 'Configurar agenda',
      actionHref: '/medico/configuracion?tab=disponibilidad',
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp conectado y recordatorios',
      done: Boolean(config?.whatsappConnected && config?.reminderLeadHours?.trim()),
      hint: 'Conecta WhatsApp y define horas de recordatorio.',
      actionLabel: 'Abrir WhatsApp',
      actionHref: '/medico/configuracion?tab=whatsapp',
    },
  ]

  const completed = items.filter((item) => item.done).length
  const total = items.length
  const progressPct = Math.round((completed / total) * 100)

  return {
    completed,
    total,
    progressPct,
    items,
  }
}

export async function GET() {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const now = new Date()
    const dayKey = format(now, 'yyyy-MM-dd')
    const { start: todayStart, endExclusive: todayEndExclusive } = getDayRangeLocal(dayKey)
    const analyticsWindowStart = startOfMonth(subMonths(now, 5))
    const analyticsWindowEndExclusive = addMonths(startOfMonth(now), 1)
    const metricsWindowDays = 30
    const metricsWindowStart = subDays(now, metricsWindowDays)
    const autoRules = NotificationService.getAutomaticRulesConfig()

    const [
      todayAppointmentsRaw,
      currentRaw,
      overdueRaw,
      upcomingRaw,
      groupedStatuses,
      profile,
      config,
      activeAvailabilityBlocks,
      analyticsAppointments,
      overduePendingCount,
      priorityMetricsAppointments,
      priorityMetricsAudit,
    ] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          doctorId,
          startTime: { gte: todayStart, lt: todayEndExclusive },
        },
        include: {
          patient: { select: { fullName: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      prisma.appointment.findFirst({
        where: {
          doctorId,
          status: { in: ['PENDING', 'CONFIRMED', 'RESCHEDULED'] },
          startTime: { lte: now },
          endTime: { gt: now },
        },
        include: {
          patient: { select: { fullName: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      prisma.appointment.findMany({
        where: {
          doctorId,
          status: 'PENDING',
          endTime: { lt: now },
        },
        include: {
          patient: { select: { fullName: true } },
        },
        orderBy: { endTime: 'asc' },
        take: 20,
      }),
      prisma.appointment.findMany({
        where: {
          doctorId,
          status: { in: ['PENDING', 'CONFIRMED', 'RESCHEDULED'] },
          startTime: { gt: now },
        },
        include: {
          patient: { select: { fullName: true } },
        },
        orderBy: { startTime: 'asc' },
        take: 5,
      }),
      prisma.appointment.groupBy({
        by: ['status'],
        where: { doctorId },
        _count: { _all: true },
      }),
      prisma.user.findUnique({
        where: { id: doctorId },
        select: {
          name: true,
          phone: true,
          specialty: true,
          professionalLicense: true,
          clinicAddress: true,
          logoImage: true,
        },
      }),
      prisma.doctorConfig.findUnique({
        where: { doctorId },
        select: {
          consultationDurationMin: true,
          normalConsultationPrice: true,
          extendedConsultationPrice: true,
          reminderLeadHours: true,
          whatsappConnected: true,
        },
      }),
      prisma.availabilityBlock.count({
        where: {
          doctorId,
          active: true,
          isPublic: true,
          endTime: { gt: now },
        },
      }),
      prisma.appointment.findMany({
        where: {
          doctorId,
          startTime: {
            gte: analyticsWindowStart,
            lt: analyticsWindowEndExclusive,
          },
        },
        select: {
          startTime: true,
          status: true,
          appointmentType: true,
        },
      }),
      prisma.appointment.count({
        where: {
          doctorId,
          status: 'PENDING',
          endTime: { lt: now },
        },
      }),
      prisma.appointment.findMany({
        where: {
          doctorId,
          startTime: { gte: metricsWindowStart },
        },
        select: {
          id: true,
          createdAt: true,
          startTime: true,
          status: true,
        },
      }),
      prisma.appointmentAuditLog.findMany({
        where: {
          doctorId,
          createdAt: { gte: metricsWindowStart },
          action: {
            in: [
              'APPOINTMENT_STATUS_CHANGED',
              'APPOINTMENT_CANCELLED',
              'APPOINTMENT_RESCHEDULED',
              'APPOINTMENT_MARKED_OVERDUE',
              'APPOINTMENT_REMINDER_ESCALATED',
              'APPOINTMENT_AUTO_CLOSED_NO_SHOW',
              'PATIENT_ASSIGNED_TO_APPOINTMENT',
              'PATIENT_CREATED_FROM_APPOINTMENT',
              'APPOINTMENT_CREATED',
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          appointment: {
            select: {
              id: true,
              startTime: true,
            },
          },
          patient: {
            select: {
              fullName: true,
            },
          },
        },
      }),
    ])

    const statsByStatus = {
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      rescheduled: 0,
    }

    for (const row of groupedStatuses) {
      const key = row.status.toLowerCase() as keyof typeof statsByStatus
      statsByStatus[key] = row._count._all
    }

    const todayAppointments = todayAppointmentsRaw.map(mapAppointment)
    const currentAppointment = currentRaw ? mapAppointment(currentRaw) : null
    const overduePendingAppointments = overdueRaw.map(mapAppointment)
    const upcomingAppointments = upcomingRaw.map(mapAppointment)
    const setupChecklist = buildSetupChecklist({
      profile,
      config,
      activeAvailabilityBlocks,
    })
    const normalConsultationPrice = Number(config?.normalConsultationPrice ?? 0)
    const extendedConsultationPrice = Number(config?.extendedConsultationPrice ?? normalConsultationPrice)
    const analytics = buildAnalyticsSummary({
      now,
      appointmentsWindow: analyticsAppointments,
      normalConsultationPrice,
      extendedConsultationPrice,
    })
    const priorityThree = buildPriorityThreeSummary({
      now,
      metricsWindowDays,
      appointmentsWindow: priorityMetricsAppointments,
      auditWindow: priorityMetricsAudit,
      overduePendingNow: overduePendingCount,
      autoRules,
    })

    return NextResponse.json({
      generatedAt: now.toISOString(),
      stats: {
        totalToday: todayAppointments.length,
        pending: statsByStatus.pending,
        confirmed: statsByStatus.confirmed,
        completed: statsByStatus.completed,
        overduePending: overduePendingCount,
      },
      currentAppointment,
      overduePendingAppointments,
      todayAppointments,
      upcomingAppointments,
      analytics,
      priorityThree,
      setupChecklist,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
