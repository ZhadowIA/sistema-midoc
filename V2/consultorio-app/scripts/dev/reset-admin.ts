/**
 * Herramienta de desarrollo: recrea la cuenta de medico local `admin@consultorio.com`.
 *
 *   RESET_ADMIN_PASSWORD='...' npx tsx --env-file=.env.local scripts/dev/reset-admin.ts
 *
 * Solo corre contra una base local y fuera de produccion (ver assert-dev-database.ts).
 * Borra la cuenta existente con ese correo, asi que nunca debe apuntar a datos reales.
 */
import { PrismaClient, UserRole, UserStatus, LegalDocumentType, ClinicalProfile } from "@prisma/client";

import { hashPassword } from "../../src/lib/security/password";
import { assertDevDatabase, requirePasswordFromEnv } from "./assert-dev-database";

const SCRIPT = "reset-admin";
const ADMIN_EMAIL = "admin@consultorio.com";

assertDevDatabase(SCRIPT);
const password = requirePasswordFromEnv("RESET_ADMIN_PASSWORD", SCRIPT);

const prisma = new PrismaClient();

async function main() {
  const existingUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (existingUser) {
    console.log("Eliminando cuenta local existente...");
    await prisma.user.delete({ where: { id: existingUser.id } });
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash,
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
          { documentType: LegalDocumentType.TERMS, version: "2026-05" },
          { documentType: LegalDocumentType.PRIVACY, version: "2026-05" }
        ]
      }
    }
  });

  // La contrasena no se imprime: la conoce quien la puso en RESET_ADMIN_PASSWORD.
  console.log(`Cuenta local ${user.email} recreada.`);
}

main()
  .catch((error) => {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
