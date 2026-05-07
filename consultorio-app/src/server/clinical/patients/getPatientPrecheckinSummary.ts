import prisma from '@/lib/prisma'

export async function getPatientPrecheckinSummary(patientId: string) {
  const [precheckin, documents] = await Promise.all([
    prisma.patientPreCheckin.findFirst({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: {
        appointment: {
          select: { id: true, startTime: true, status: true },
        },
      },
    }),
    prisma.patientDocument.findMany({
      where: { patientId, status: 'ACTIVE' },
      orderBy: { uploadedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        category: true,
        fileName: true,
        fileUrl: true,
        uploadedAt: true,
      },
    }),
  ])

  return { precheckin, documents }
}

