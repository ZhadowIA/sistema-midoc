import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10)

  // 1. Create default doctor
  const doctor = await prisma.user.upsert({
    where: { email: 'admin@consultorio.com' },
    update: {},
    create: {
      email: 'admin@consultorio.com',
      name: 'Dr. Admin',
      passwordHash,
      role: 'ADMIN', // ADMIN covers DOCTOR capabilities usually
      slug: 'dr-admin',
      specialty: 'Medicina General',
      bio: 'Médico cirujano egresado con más de 10 años de experiencia.',
      profileImage: 'https://api.dicebear.com/7.x/notionists/svg?seed=Admin&backgroundColor=f1f5f9'
    },
  })

  const doctor2 = await prisma.user.upsert({
    where: { email: 'juan.perez@consultorio.com' },
    update: {},
    create: {
      email: 'juan.perez@consultorio.com',
      name: 'Dr. Juan Pérez',
      passwordHash,
      role: 'DOCTOR',
      slug: 'dr-juan-perez',
      specialty: 'Pediatría',
      bio: 'Especialista en cuidado infantil con enfoque integral.',
      profileImage: 'https://api.dicebear.com/7.x/notionists/svg?seed=Juan&backgroundColor=f1f5f9'
    },
  })

  // 2. Create initial configuration
  const doctorConfig = await prisma.doctorConfig.upsert({
    where: { doctorId: doctor.id },
    update: {},
    create: {
      doctorId: doctor.id,
      consultationDurationMin: 40,
      extendedConsultationEnabled: true,
      normalConsultationPrice: 600.00,
      extendedConsultationPrice: 1000.00,
    },
  })

  await prisma.doctorConfig.upsert({
    where: { doctorId: doctor2.id },
    update: {},
    create: {
      doctorId: doctor2.id,
      consultationDurationMin: 30,
      extendedConsultationEnabled: false,
      normalConsultationPrice: 800.00,
    },
  })

  // 3. Create Availability Blocks for the next 30 days
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  for (let i = 0; i < 30; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    // Only schedule weekdays (skip Sunday=0 and Saturday=6)
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      const startTime = new Date(d)
      startTime.setHours(9, 0, 0, 0) // 9:00 AM
      const endTime = new Date(d)
      endTime.setHours(17, 0, 0, 0) // 5:00 PM

      // Use basic logic to link by start time and doctor
      const existing = await prisma.availabilityBlock.findFirst({
        where: { doctorId: doctor.id, date: d }
      })

      if (!existing) {
        await prisma.availabilityBlock.create({
          data: {
            doctorId: doctor.id,
            date: d,
            startTime,
            endTime,
            isPublic: true,
            active: true
          }
        })
      }

      // Add availability for Doctor 2 (Afternoons)
      const existing2 = await prisma.availabilityBlock.findFirst({
        where: { doctorId: doctor2.id, date: d }
      })

      if (!existing2) {
        const doc2Start = new Date(d)
        doc2Start.setHours(14, 0, 0, 0) // 2:00 PM
        const doc2End = new Date(d)
        doc2End.setHours(19, 0, 0, 0) // 7:00 PM
        
        await prisma.availabilityBlock.create({
          data: {
            doctorId: doctor2.id,
            date: d,
            startTime: doc2Start,
            endTime: doc2End,
            isPublic: true,
            active: true
          }
        })
      }
    }
  }

  console.log('Seed completed successfully.')
  console.log('Doctor created: ', doctor.email)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
