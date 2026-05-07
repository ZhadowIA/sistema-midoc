import prisma from '@/lib/prisma'
import type { CreateSecurityIncidentInput } from '@/server/security/incidents/types'

export async function createSecurityIncident(input: {
  userId: string
  data: CreateSecurityIncidentInput
}) {
  return prisma.securityIncident.create({
    data: {
      reportedByUserId: input.userId,
      assignedToUserId: input.data.assignedToUserId ?? null,
      severity: input.data.severity,
      category: input.data.category,
      title: input.data.title,
      summary: input.data.summary,
      detectedAt: new Date(input.data.detectedAt),
      affectedScope: (input.data.affectedScope ?? null) as never,
      notificationRequired: input.data.notificationRequired ?? false,
    },
  })
}

