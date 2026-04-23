import { Prisma, PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

type SeedPlan = 'AGENDA' | 'CLINICAL' | 'INTEGRAL'

function buildPlanFeatures(basePlan: SeedPlan, withAi: boolean) {
  const features: Record<string, unknown> = {
    'subscription.basePlan': basePlan,
    'subscription.addOns': withAi ? ['AI'] : [],
    'subscription.catalogVersion': '2026-04-21',
  }

  if (basePlan === 'AGENDA' || basePlan === 'INTEGRAL') {
    features['agenda.enabled'] = true
    features['agenda.reminders.whatsapp'] = true
    features['agenda.waitlist'] = true
  }

  if (basePlan === 'CLINICAL' || basePlan === 'INTEGRAL') {
    features['clinical.enabled'] = true
    features['clinical.history'] = true
    features['clinical.notes'] = true
    features['clinical.prescriptions'] = true
    features['clinical.signoff'] = true
    features['clinical.encounters.standalone'] = true
  }

  if (withAi) {
    features['ai.enabled'] = true
    features['ai.dictation'] = true
    features['ai.insights'] = true
  }

  return features
}

async function ensureDoctor(args: {
  email: string
  name: string
  slug: string
  specialty: string
  bio: string
  avatarSeed: string
  role?: 'ADMIN' | 'DOCTOR'
}) {
  return prisma.user.upsert({
    where: { email: args.email },
    update: {
      name: args.name,
      role: args.role ?? 'DOCTOR',
      slug: args.slug,
      specialty: args.specialty,
      bio: args.bio,
      profileImage: `https://api.dicebear.com/7.x/notionists/svg?seed=${args.avatarSeed}&backgroundColor=f1f5f9`,
    },
    create: {
      email: args.email,
      name: args.name,
      passwordHash: await bcrypt.hash('admin123', 10),
      role: args.role ?? 'DOCTOR',
      slug: args.slug,
      specialty: args.specialty,
      bio: args.bio,
      profileImage: `https://api.dicebear.com/7.x/notionists/svg?seed=${args.avatarSeed}&backgroundColor=f1f5f9`,
    },
  })
}

async function ensureDoctorConfig(doctorId: string, duration: number, price: number) {
  await prisma.doctorConfig.upsert({
    where: { doctorId },
    update: {
      consultationDurationMin: duration,
      extendedConsultationEnabled: true,
      normalConsultationPrice: price,
      extendedConsultationPrice: Math.round(price * 1.5),
    },
    create: {
      doctorId,
      consultationDurationMin: duration,
      extendedConsultationEnabled: true,
      normalConsultationPrice: price,
      extendedConsultationPrice: Math.round(price * 1.5),
    },
  })
}

async function ensureSubscription(
  doctorId: string,
  planName: string,
  features: Record<string, unknown>,
) {
  await prisma.doctorSubscription.upsert({
    where: { doctorId },
    update: {
      status: 'ACTIVE',
      provider: 'MOCK',
      planName,
      currency: 'MXN',
      features: features as Prisma.InputJsonValue,
    },
    create: {
      doctorId,
      status: 'ACTIVE',
      provider: 'MOCK',
      planName,
      currency: 'MXN',
      features: features as Prisma.InputJsonValue,
    },
  })
}

async function ensureOnboardingCompleted(doctorId: string) {
  await prisma.doctorOnboarding.upsert({
    where: { doctorId },
    update: { completed: true, completedAt: new Date() },
    create: { doctorId, completed: true, completedAt: new Date() },
  })
}

async function ensureAvailabilityBlocks(doctorId: string, startHour: number, endHour: number) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < 30; i += 1) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    if (d.getDay() === 0 || d.getDay() === 6) continue

    const existing = await prisma.availabilityBlock.findFirst({
      where: { doctorId, date: d },
    })
    if (existing) continue

    const startTime = new Date(d)
    startTime.setHours(startHour, 0, 0, 0)
    const endTime = new Date(d)
    endTime.setHours(endHour, 0, 0, 0)

    await prisma.availabilityBlock.create({
      data: {
        doctorId,
        date: d,
        startTime,
        endTime,
        isPublic: true,
        active: true,
      },
    })
  }
}

async function main() {
  const admin = await ensureDoctor({
    email: 'admin@consultorio.com',
    name: 'Dr. Admin',
    slug: 'dr-admin',
    specialty: 'Medicina General',
    bio: 'Médico cirujano egresado con más de 10 años de experiencia.',
    avatarSeed: 'Admin',
    role: 'ADMIN',
  })

  const agendaDoctor = await ensureDoctor({
    email: 'agenda@consultorio.com',
    name: 'Dra. Agenda',
    slug: 'dra-agenda',
    specialty: 'Medicina Familiar',
    bio: 'Operación enfocada en agenda y flujo administrativo.',
    avatarSeed: 'Agenda',
  })

  const clinicalAiDoctor = await ensureDoctor({
    email: 'clinico.ia@consultorio.com',
    name: 'Dr. Clínico IA',
    slug: 'dr-clinico-ia',
    specialty: 'Medicina Interna',
    bio: 'Expediente clínico standalone con apoyo de IA.',
    avatarSeed: 'ClinicoIA',
  })

  const integralAiDoctor = await ensureDoctor({
    email: 'integral.ia@consultorio.com',
    name: 'Dra. Integral IA',
    slug: 'dra-integral-ia',
    specialty: 'Cardiología',
    bio: 'Plan integral con agenda y capacidades de IA.',
    avatarSeed: 'IntegralIA',
  })

  await ensureDoctorConfig(admin.id, 40, 600)
  await ensureDoctorConfig(agendaDoctor.id, 30, 700)
  await ensureDoctorConfig(clinicalAiDoctor.id, 45, 900)
  await ensureDoctorConfig(integralAiDoctor.id, 40, 1100)

  await ensureSubscription(admin.id, 'Plan Integral MiDoc', buildPlanFeatures('INTEGRAL', false))
  await ensureSubscription(agendaDoctor.id, 'Plan Agenda MiDoc', buildPlanFeatures('AGENDA', false))
  await ensureSubscription(
    clinicalAiDoctor.id,
    'Plan Clínico + Add-on IA',
    buildPlanFeatures('CLINICAL', true),
  )
  await ensureSubscription(
    integralAiDoctor.id,
    'Plan Integral + Add-on IA',
    buildPlanFeatures('INTEGRAL', true),
  )

  await ensureOnboardingCompleted(admin.id)
  await ensureOnboardingCompleted(agendaDoctor.id)
  await ensureOnboardingCompleted(clinicalAiDoctor.id)
  await ensureOnboardingCompleted(integralAiDoctor.id)

  await ensureAvailabilityBlocks(admin.id, 9, 17)
  await ensureAvailabilityBlocks(agendaDoctor.id, 8, 15)
  await ensureAvailabilityBlocks(integralAiDoctor.id, 10, 18)

  console.log('Seed completed successfully.')
  console.log('Doctors ready:')
  console.log('- admin@consultorio.com (Plan Integral)')
  console.log('- agenda@consultorio.com (Plan Agenda)')
  console.log('- clinico.ia@consultorio.com (Plan Clínico + IA)')
  console.log('- integral.ia@consultorio.com (Plan Integral + IA)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
