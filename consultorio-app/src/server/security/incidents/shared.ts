import prisma from '@/lib/prisma'

export async function getSecurityIncidentById(id: string) {
  return prisma.securityIncident.findUnique({ where: { id } })
}

export function isSecurityIncidentParticipant(input: {
  userId: string
  reportedByUserId: string
  assignedToUserId: string | null
}) {
  return input.reportedByUserId === input.userId || input.assignedToUserId === input.userId
}

