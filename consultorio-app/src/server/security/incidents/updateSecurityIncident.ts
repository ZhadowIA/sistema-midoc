import prisma from '@/lib/prisma'
import type { PatchSecurityIncidentInput } from '@/server/security/incidents/types'

export async function updateSecurityIncident(input: {
  id: string
  data: PatchSecurityIncidentInput
}) {
  return prisma.securityIncident.update({
    where: { id: input.id },
    data: {
      ...(input.data.status !== undefined ? { status: input.data.status } : {}),
      ...(input.data.assignedToUserId !== undefined ? { assignedToUserId: input.data.assignedToUserId } : {}),
      ...(input.data.containedAt !== undefined
        ? { containedAt: input.data.containedAt ? new Date(input.data.containedAt) : null }
        : {}),
      ...(input.data.resolvedAt !== undefined
        ? { resolvedAt: input.data.resolvedAt ? new Date(input.data.resolvedAt) : null }
        : {}),
      ...(input.data.correctiveActions !== undefined ? { correctiveActions: input.data.correctiveActions } : {}),
      ...(input.data.rootCause !== undefined ? { rootCause: input.data.rootCause } : {}),
      ...(input.data.notificationRequired !== undefined
        ? { notificationRequired: input.data.notificationRequired }
        : {}),
      ...(input.data.notifiedAt !== undefined
        ? { notifiedAt: input.data.notifiedAt ? new Date(input.data.notifiedAt) : null }
        : {}),
      ...(input.data.evidenceExportRef !== undefined ? { evidenceExportRef: input.data.evidenceExportRef } : {}),
    },
  })
}

