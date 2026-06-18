import { UserStatus, type PrismaClient } from "@prisma/client";

export async function approveDoctorAccountForTesting(prisma: PrismaClient, userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date()
    }
  });
}

