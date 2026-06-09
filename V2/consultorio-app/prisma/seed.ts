import { ClinicalProfile, PrismaClient, UserRole, UserStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: "admin@consultorio.com" },
    update: {
      firstName: "Admin",
      lastName: "Consultorio",
      role: UserRole.DOCTOR,
      status: UserStatus.ACTIVE,
      doctorProfile: {
        upsert: {
          update: {
            professionalName: "Dr. Admin Consultorio",
            publicSlug: "dr-admin-consultorio",
            specialty: ClinicalProfile.GENERAL_MEDICINE,
            isPublic: false
          },
          create: {
            professionalName: "Dr. Admin Consultorio",
            publicSlug: "dr-admin-consultorio",
            specialty: ClinicalProfile.GENERAL_MEDICINE,
            isPublic: false
          }
        }
      }
    },
    create: {
      email: "admin@consultorio.com",
      firstName: "Admin",
      lastName: "Consultorio",
      role: UserRole.DOCTOR,
      status: UserStatus.ACTIVE,
      doctorProfile: {
        create: {
          professionalName: "Dr. Admin Consultorio",
          publicSlug: "dr-admin-consultorio",
          specialty: ClinicalProfile.GENERAL_MEDICINE,
          isPublic: false
        }
      }
    }
  });
}

main()
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
