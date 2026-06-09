import type { PrismaClient } from '@prisma/client'

export class AgendaActorNotFoundError extends Error {
  constructor() {
    super('No autorizado')
    this.name = 'AgendaActorNotFoundError'
  }
}

type ResolveAgendaDoctorScopeInput = {
  actorUserId: string
  defaultDoctorId: string
  requestedDoctorId: string | null
}

export type AgendaDoctorScope = {
  actorDoctorId: string
  currentDoctorId: string
  canViewClinicAgenda: boolean
  canEditCrossDoctor: boolean
  doctors: Array<{ id: string; name: string }>
}

export async function resolveAgendaDoctorScope(
  prisma: PrismaClient,
  input: ResolveAgendaDoctorScopeInput,
): Promise<AgendaDoctorScope> {
  const actorUser = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { id: true, role: true, clinicId: true },
  })

  if (!actorUser) {
    throw new AgendaActorNotFoundError()
  }

  let doctorId = input.defaultDoctorId
  let clinicDoctors: Array<{ id: string; name: string }> = []
  const canViewClinicAgenda = actorUser.role === 'CLINIC_ADMIN' && Boolean(actorUser.clinicId)

  if (canViewClinicAgenda && actorUser.clinicId) {
    clinicDoctors = await prisma.user.findMany({
      where: {
        clinicId: actorUser.clinicId,
        active: true,
        role: { in: ['DOCTOR', 'CLINIC_ADMIN'] },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    if (input.requestedDoctorId && clinicDoctors.some((doctor) => doctor.id === input.requestedDoctorId)) {
      doctorId = input.requestedDoctorId
    }
  }

  return {
    actorDoctorId: actorUser.id,
    currentDoctorId: doctorId,
    canViewClinicAgenda,
    canEditCrossDoctor: canViewClinicAgenda,
    doctors: clinicDoctors,
  }
}
