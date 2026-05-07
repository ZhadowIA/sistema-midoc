import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { MedicalSpecialty } from '@prisma/client'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { getDoctorProductAccess } from '@/lib/productAccess'

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const slugSchema = /^([a-z0-9]+(?:-[a-z0-9]+)*)$/

export async function GET() {
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: false })
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const doctor = await prisma.user.findUnique({
      where: { id: doctorId }
    })

    if (!doctor) return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
    const productAccess = await getDoctorProductAccess(doctorId, doctor.role)

    let branding: { professionalLicense: string | null; clinicAddress: string | null; logoImage: string | null } = {
      professionalLicense: null,
      clinicAddress: null,
      logoImage: null,
    }

    try {
      const rows = await prisma.$queryRaw<Array<{
        professionalLicense: string | null
        clinicAddress: string | null
        logoImage: string | null
      }>>`
        SELECT "professionalLicense", "clinicAddress", "logoImage"
        FROM "User"
        WHERE "id" = ${doctorId}
        LIMIT 1
      `
      if (rows[0]) {
        branding = rows[0]
      }
    } catch {
      // If columns don't exist yet in current process/db state, continue with null branding fields.
    }

    return NextResponse.json({
      ...doctor,
      professionalLicense: branding.professionalLicense,
      clinicAddress: branding.clinicAddress,
      logoImage: branding.logoImage,
      productPlan: productAccess.plan,
      enabledModules: productAccess.enabledModules,
      features: productAccess.features,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: false })
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const body = await request.json()
    const slug = asNullableString(body.slug)?.toLowerCase() ?? null
    if (slug !== null) {
      if (slug.length < 3 || slug.length > 80) {
        return NextResponse.json({ error: 'Slug inválido. Debe tener entre 3 y 80 caracteres.' }, { status: 400 })
      }
      if (!slugSchema.test(slug)) {
        return NextResponse.json(
          { error: 'Slug inválido. Usa letras minúsculas, números y guiones (sin guiones dobles).' },
          { status: 400 }
        )
      }
    }
    if (body.profileImage !== undefined) {
      const profileImage = asNullableString(body.profileImage)
      if (profileImage !== null) {
        try {
          new URL(profileImage)
        } catch {
          return NextResponse.json({ error: 'URL de foto de perfil inválida.' }, { status: 400 })
        }
      }
    }
    if (body.logoImage !== undefined) {
      const logoImage = asNullableString(body.logoImage)
      if (logoImage !== null) {
        try {
          new URL(logoImage)
        } catch {
          return NextResponse.json({ error: 'URL de logo inválida.' }, { status: 400 })
        }
      }
    }
    if (body.bio !== undefined) {
      const bio = asNullableString(body.bio)
      if (bio && bio.length > 1000) {
        return NextResponse.json({ error: 'La biografía no puede exceder 1000 caracteres.' }, { status: 400 })
      }
    }
    if (body.professionalLicense !== undefined) {
      const professionalLicense = asNullableString(body.professionalLicense)
      if (professionalLicense && professionalLicense.length > 120) {
        return NextResponse.json({ error: 'La cédula profesional no puede exceder 120 caracteres.' }, { status: 400 })
      }
    }
    if (body.clinicAddress !== undefined) {
      const clinicAddress = asNullableString(body.clinicAddress)
      if (clinicAddress && clinicAddress.length > 240) {
        return NextResponse.json({ error: 'La dirección no puede exceder 240 caracteres.' }, { status: 400 })
      }
    }
    if (body.name !== undefined) {
      const name = asNullableString(body.name)
      if (name && name.length > 120) {
        return NextResponse.json({ error: 'El nombre no puede exceder 120 caracteres.' }, { status: 400 })
      }
    }
    if (body.phone !== undefined) {
      const phone = asNullableString(body.phone)
      if (phone && phone.length > 30) {
        return NextResponse.json({ error: 'El teléfono no puede exceder 30 caracteres.' }, { status: 400 })
      }
    }

    const specialty = asNullableString(body.specialty)
    if (
      specialty !== null &&
      specialty !== 'FAMILY_MEDICINE' &&
      specialty !== 'PEDIATRICS' &&
      specialty !== 'GYNECOLOGY_OBSTETRICS' &&
      specialty !== 'DERMATOLOGY' &&
      specialty !== 'CARDIOLOGY' &&
      specialty !== 'MENTAL_HEALTH' &&
      specialty !== 'DENTISTRY' &&
      specialty !== 'OPHTHALMOLOGY'
    ) {
      return NextResponse.json({ error: 'Especialidad inválida.' }, { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id: doctorId },
      data: {
        name: asNullableString(body.name) ?? undefined,
        phone: asNullableString(body.phone) ?? undefined,
        specialty: specialty as MedicalSpecialty | null,
        bio: asNullableString(body.bio),
        profileImage: asNullableString(body.profileImage),
        slug,
      }
    })

    try {
      await prisma.$executeRaw`
        UPDATE "User"
        SET
          "professionalLicense" = ${asNullableString(body.professionalLicense)},
          "clinicAddress" = ${asNullableString(body.clinicAddress)},
          "logoImage" = ${asNullableString(body.logoImage)}
        WHERE "id" = ${doctorId}
      `
    } catch {
      // Keep compatibility when DB schema is not yet updated.
    }

    let branding: { professionalLicense: string | null; clinicAddress: string | null; logoImage: string | null } = {
      professionalLicense: null,
      clinicAddress: null,
      logoImage: null,
    }

    try {
      const rows = await prisma.$queryRaw<Array<{
        professionalLicense: string | null
        clinicAddress: string | null
        logoImage: string | null
      }>>`
        SELECT "professionalLicense", "clinicAddress", "logoImage"
        FROM "User"
        WHERE "id" = ${doctorId}
        LIMIT 1
      `
      if (rows[0]) {
        branding = rows[0]
      }
    } catch {
      // Ignore and fallback to null values.
    }

    return NextResponse.json({
      ...updated,
      professionalLicense: branding.professionalLicense,
      clinicAddress: branding.clinicAddress,
      logoImage: branding.logoImage,
    })
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return NextResponse.json({ error: 'Ese slug ya está en uso. Elige otro.' }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
