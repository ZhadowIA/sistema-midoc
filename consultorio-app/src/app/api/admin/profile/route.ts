import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedDoctorId } from '@/lib/auth'
import { getDoctorProductAccess } from '@/lib/productAccess'

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function GET() {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()

    const updated = await prisma.user.update({
      where: { id: doctorId },
      data: {
        name: asNullableString(body.name) ?? undefined,
        phone: asNullableString(body.phone) ?? undefined,
        specialty: asNullableString(body.specialty),
        bio: asNullableString(body.bio),
        profileImage: asNullableString(body.profileImage),
        slug: asNullableString(body.slug),
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
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
