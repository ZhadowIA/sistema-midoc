import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Limpiar datos previos
  await prisma.doctor.deleteMany();

  // Crear médico de demostración
  const doctor = await prisma.doctor.create({
    data: {
      email: "demo@example.com",
      passwordHash: await hash("Demo2026!Secure", 10),
      firstName: "Dr.",
      lastName: "Demo",
      professionalName: "Dr. Demo Médico",
      specialty: "GENERAL_MEDICINE",
      publicSlug: "dr-demo",
      isPublic: true,
      termsVersion: "2026-05",
      privacyVersion: "2026-05"
    }
  });

  console.log("✓ Médico de demostración creado:");
  console.log(`  Email: ${doctor.email}`);
  console.log(`  Slug: ${doctor.publicSlug}`);
  console.log(`  URL: http://localhost:3000/perfil/${doctor.publicSlug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
