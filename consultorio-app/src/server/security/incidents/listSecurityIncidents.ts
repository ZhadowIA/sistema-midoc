import prisma from '@/lib/prisma'

export async function listSecurityIncidents(input: {
  userId: string
  status?: 'OPEN'
  severity?: 'P0'
}) {
  const items = await prisma.securityIncident.findMany({
    where: {
      OR: [{ reportedByUserId: input.userId }, { assignedToUserId: input.userId }],
      ...(input.status ? { status: input.status } : {}),
      ...(input.severity ? { severity: input.severity } : {}),
    },
    orderBy: { detectedAt: 'desc' },
    take: 200,
  })

  return { items, count: items.length }
}

