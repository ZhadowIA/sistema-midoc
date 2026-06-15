import { PrismaClient, UserRole, UserStatus, LegalDocumentType, ClinicalProfile } from "@prisma/client";
import { hashPassword } from "./src/lib/security/password";

const prisma = new PrismaClient();

async function main() {
  // Eliminar usuario existente
  const existingUser = await prisma.user.findUnique({
    where: { email: "admin@consultorio.com" }
  });

  if (existingUser) {
    console.log("Eliminando usuario existente...");
    await prisma.user.delete({
      where: { id: existingUser.id }
    });
  }

  // Crear nuevo usuario con contraseña
  const hashedPassword = await hashPassword("Admin@123456");

  const user = await prisma.user.create({
    data: {
      email: "admin@consultorio.com",
      passwordHash: hashedPassword,
      firstName: "Admin",
      lastName: "Consultorio",
      role: UserRole.DOCTOR,
      status: UserStatus.ACTIVE,
      doctorProfile: {
        create: {
          professionalName: "Dr. Admin Consultorio",
          publicSlug: `dr-admin-consultorio-${Date.now()}`,
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

  console.log("✓ Usuario admin@consultorio.com creado correctamente");
  console.log(`  Email: ${user.email}`);
  console.log(`  Contraseña: Admin@123456`);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
