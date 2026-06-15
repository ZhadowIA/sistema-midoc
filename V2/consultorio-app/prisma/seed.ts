import { ClinicalProfile, LegalDocumentType, PrismaClient, UserRole, UserStatus } from "@prisma/client";
import { hashPassword } from "../src/lib/security/password";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await hashPassword("Admin@123456");

  await prisma.user.upsert({
    where: { email: "admin@consultorio.com" },
    update: {
      firstName: "Admin",
      lastName: "Consultorio",
      role: UserRole.DOCTOR,
      status: UserStatus.ACTIVE,
      passwordHash: hashedPassword,
      phone: undefined,
      doctorProfile: {
        upsert: {
          update: {
            professionalName: "Dr. Admin Consultorio",
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
      passwordHash: hashedPassword,
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
      },
      legalAcceptances: {
        create: [
          {
            documentType: LegalDocumentType.TERMS,
            version: "2026-05"
          },
          {
            documentType: LegalDocumentType.PRIVACY,
            version: "2026-05"
          }
        ]
      }
    }
  });

  console.log("✓ Usuario de prueba creado: admin@consultorio.com");
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
