import { Prisma, PrismaClient, MedicalSpecialty } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

type SeedPlan = 'AGENDA' | 'CLINICAL' | 'INTEGRAL'
type AiTier = 'AI_30' | 'AI_60' | 'AI_100' | null

function buildPlanFeatures(basePlan: SeedPlan, aiTier: AiTier = null) {
  const addOns = aiTier ? [aiTier] : []
  const features: Record<string, unknown> = {
    'subscription.basePlan': basePlan,
    'subscription.addOns': addOns,
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

  if (aiTier) {
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
  specialty: MedicalSpecialty
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
    specialty: MedicalSpecialty.FAMILY_MEDICINE,
    bio: 'Médico cirujano egresado con más de 10 años de experiencia.',
    avatarSeed: 'Admin',
    role: 'ADMIN',
  })

  const agendaDoctor = await ensureDoctor({
    email: 'agenda@consultorio.com',
    name: 'Dra. Agenda',
    slug: 'dra-agenda',
    specialty: MedicalSpecialty.FAMILY_MEDICINE,
    bio: 'Operación enfocada en agenda y flujo administrativo.',
    avatarSeed: 'Agenda',
  })

  const clinicalAiDoctor = await ensureDoctor({
    email: 'clinico.ia@consultorio.com',
    name: 'Dr. Clínico IA',
    slug: 'dr-clinico-ia',
    specialty: MedicalSpecialty.FAMILY_MEDICINE,
    bio: 'Expediente clínico standalone con apoyo de IA.',
    avatarSeed: 'ClinicoIA',
  })

  const integralAiDoctor = await ensureDoctor({
    email: 'integral.ia@consultorio.com',
    name: 'Dra. Integral IA',
    slug: 'dra-integral-ia',
    specialty: MedicalSpecialty.CARDIOLOGY,
    bio: 'Plan integral con agenda y capacidades de IA.',
    avatarSeed: 'IntegralIA',
  })

  await ensureDoctorConfig(admin.id, 40, 600)
  await ensureDoctorConfig(agendaDoctor.id, 30, 700)
  await ensureDoctorConfig(clinicalAiDoctor.id, 45, 900)
  await ensureDoctorConfig(integralAiDoctor.id, 40, 1100)

  await ensureSubscription(admin.id, 'Plan Integral MiDoc', buildPlanFeatures('INTEGRAL', null))
  await ensureSubscription(agendaDoctor.id, 'Plan Agenda MiDoc', buildPlanFeatures('AGENDA', null))
  await ensureSubscription(
    clinicalAiDoctor.id,
    'Plan Clínico + Add-on IA 100%',
    buildPlanFeatures('CLINICAL', 'AI_100'),
  )
  await ensureSubscription(
    integralAiDoctor.id,
    'Plan Integral + Add-on IA 100%',
    buildPlanFeatures('INTEGRAL', 'AI_100'),
  )

  // Create doctors for each specialty with IA_100
  const specialtyDoctors = [
    {
      specialty: MedicalSpecialty.FAMILY_MEDICINE,
      email: 'family_medicine@correo.com',
      name: 'Dr. Medicina Familiar',
      slug: 'dr-medicina-familiar',
    },
    {
      specialty: MedicalSpecialty.PEDIATRICS,
      email: 'pediatrics@correo.com',
      name: 'Dra. Pediatría',
      slug: 'dra-pediatria',
    },
    {
      specialty: MedicalSpecialty.GYNECOLOGY_OBSTETRICS,
      email: 'gynecology_obstetrics@correo.com',
      name: 'Dra. Ginecología y Obstetricia',
      slug: 'dra-ginecologia-obstetricia',
    },
    {
      specialty: MedicalSpecialty.DERMATOLOGY,
      email: 'dermatology@correo.com',
      name: 'Dr. Dermatología',
      slug: 'dr-dermatologia',
    },
    {
      specialty: MedicalSpecialty.CARDIOLOGY,
      email: 'cardiology@correo.com',
      name: 'Dr. Cardiología',
      slug: 'dr-cardiologia',
    },
    {
      specialty: MedicalSpecialty.MENTAL_HEALTH,
      email: 'mental_health@correo.com',
      name: 'Dra. Salud Mental',
      slug: 'dra-salud-mental',
    },
    {
      specialty: MedicalSpecialty.DENTISTRY,
      email: 'dentistry@correo.com',
      name: 'Dr. Odontología',
      slug: 'dr-odontologia',
    },
    {
      specialty: MedicalSpecialty.OPHTHALMOLOGY,
      email: 'ophthalmology@correo.com',
      name: 'Dr. Oftalmología',
      slug: 'dr-oftalmologia',
    },
  ]

  const specialtyDocs: typeof admin[] = []
  for (const spec of specialtyDoctors) {
    const doctor = await ensureDoctor({
      email: spec.email,
      name: spec.name,
      slug: spec.slug,
      specialty: spec.specialty,
      bio: `Especialista en ${spec.name.split(' ').slice(1).join(' ')} con acceso a IA completo.`,
      avatarSeed: spec.slug,
    })
    specialtyDocs.push(doctor)

    await ensureDoctorConfig(doctor.id, 40, 850)
    await ensureSubscription(
      doctor.id,
      'Plan Integral + Add-on IA 100%',
      buildPlanFeatures('INTEGRAL', 'AI_100'),
    )
    await ensureOnboardingCompleted(doctor.id)
    await ensureAvailabilityBlocks(doctor.id, 9, 17)
  }

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
  console.log('\nSpecialty doctors with IA_100 (password: admin123):')
  specialtyDoctors.forEach((spec) => {
    console.log(`- ${spec.email} (${spec.name})`)
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
