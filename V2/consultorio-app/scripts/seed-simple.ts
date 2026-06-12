import { PrismaClient, ClinicalProfile, UserRole } from "@prisma/client";

import { hashPassword } from "../src/lib/security/password";

const prisma = new PrismaClient();

const galleryImages = [
  { url: "https://picsum.photos/seed/midoc-consultorio/600/450", caption: "Consultorio principal" },
  { url: "https://picsum.photos/seed/midoc-sala/600/450", caption: "Sala de espera" },
  { url: "https://picsum.photos/seed/midoc-equipo/600/450", caption: "Equipo médico" },
  { url: "https://picsum.photos/seed/midoc-recepcion/600/450", caption: "Recepción" }
];

// Crea las imagenes de galeria solo si el perfil aun no tiene ninguna.
async function ensureGallery(doctorProfileId: string) {
  const count = await prisma.doctorGalleryImage.count({ where: { doctorProfileId } });
  if (count > 0) {
    return 0;
  }
  await prisma.doctorGalleryImage.createMany({
    data: galleryImages.map((image, index) => ({
      doctorProfileId,
      url: image.url,
      caption: image.caption,
      displayOrder: index
    }))
  });
  return galleryImages.length;
}

async function main() {
  try {
    // Check if doctor already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: "doctor@test.com" }
    });

    if (existingUser) {
      console.log("Doctor already exists, updating...");
      // Just update the profile to be public
      const profile = await prisma.doctorProfile.update({
        where: { userId: existingUser.id },
        data: { isPublic: true }
      });
      const added = await ensureGallery(profile.id);
      console.log(added > 0 ? `Added ${added} gallery images` : "Gallery already present");
    } else {
      // Create a new test doctor user (scrypt, igual que el flujo de registro real)
      const hashedPassword = await hashPassword("password123");

      const user = await prisma.user.create({
        data: {
          email: "doctor@test.com",
          firstName: "Admin",
          lastName: "Consultorio",
          passwordHash: hashedPassword,
          role: UserRole.DOCTOR
        }
      });

      // Create doctor profile
      const profile = await prisma.doctorProfile.create({
        data: {
          userId: user.id,
          professionalName: "Dr. Admin Consultorio",
          publicSlug: "dr-admin-consultorio",
          specialty: ClinicalProfile.GENERAL_MEDICINE,
          description: "Médico general con 10 años de experiencia. Especialista en atención primaria y medicina preventiva.",
          phone: "+52 1234567890",
          addressLine1: "Calle Principal 123",
          city: "Chihuahua",
          state: "Chihuahua",
          country: "México",
          postalCode: "28000",
          consultationDuration: 30,
          timeZone: "America/Chihuahua",
          isPublic: true,
          profilePhoto: "https://images.unsplash.com/photo-1622496904895-a0f85f4cbe82?w=500&h=500&fit=crop",
          coverPhoto: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1200&h=300&fit=crop"
        }
      });

      // Create services
      await prisma.doctorService.create({
        data: {
          doctorProfileId: profile.id,
          name: "Consulta General",
          description: "Consulta médica general",
          priceCents: 50000, // $500 MXN
          currency: "MXN",
          durationMinutes: 30,
          displayOrder: 0,
          status: "ACTIVE"
        }
      });

      await prisma.doctorService.create({
        data: {
          doctorProfileId: profile.id,
          name: "Seguimiento",
          description: "Consulta de seguimiento",
          priceCents: 30000, // $300 MXN
          currency: "MXN",
          durationMinutes: 20,
          displayOrder: 1,
          status: "ACTIVE"
        }
      });

      // Create availability rules (Monday to Friday, 9am to 5pm)
      for (let day = 1; day <= 5; day++) {
        await prisma.doctorAvailability.create({
          data: {
            doctorProfileId: profile.id,
            dayOfWeek: day,
            startTime: "09:00",
            endTime: "17:00",
            isActive: true
          }
        });
      }

      // Create sample reviews
      const reviews = [
        {
          doctorProfileId: profile.id,
          patientName: "Juan García",
          patientEmail: "juan@example.com",
          rating: 5,
          title: "Excelente atención",
          text: "El doctor fue muy profesional y atento. Resolvió todas mis dudas y se tomó el tiempo necesario para explicarme mi condición.",
          isVerified: true
        },
        {
          doctorProfileId: profile.id,
          patientName: "María López",
          patientEmail: "maria@example.com",
          rating: 5,
          title: "Muy recomendado",
          text: "Excelente médico, muy puntual y profesional. La consulta fue muy completa.",
          isVerified: true
        },
        {
          doctorProfileId: profile.id,
          patientName: "Carlos Rodríguez",
          patientEmail: "carlos@example.com",
          rating: 4,
          title: "Buena atención",
          text: "Buen servicio, aunque la espera fue un poco larga. El doctor fue amable.",
          isVerified: true
        },
        {
          doctorProfileId: profile.id,
          patientName: "Ana Martínez",
          patientEmail: "ana@example.com",
          rating: 5,
          title: "Muy profesional",
          text: "El doctor me explicó todo muy bien. Tiene gran conocimiento y es muy empático.",
          isVerified: true
        }
      ];

      for (const review of reviews) {
        await prisma.doctorReview.create({
          data: review
        });
      }

      const added = await ensureGallery(profile.id);

      console.log("Seed completed successfully!");
      console.log(`Created doctor: ${profile.professionalName}`);
      console.log(`Profile slug: ${profile.publicSlug}`);
      console.log(`Created ${reviews.length} reviews`);
      console.log(`Created ${added} gallery images`);
    }
  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
