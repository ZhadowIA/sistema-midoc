import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { buildFullName } from '@/lib/patientName'

const registerPatientSchema = z.object({
  firstName: z.string().min(2, 'El nombre es requerido'),
  lastNamePaternal: z.string().min(2, 'El apellido paterno es requerido'),
  lastNameMaternal: z.string().optional().nullable(),
  email: z.string().email('Correo inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  phone: z.string().min(10, 'El teléfono debe tener al menos 10 dígitos'),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Fecha de nacimiento inválida",
  }),
})

export async function POST(request: Request) {
  try {
    const parsed = registerPatientSchema.parse(await request.json())
    const firstName = parsed.firstName.trim()
    const lastNamePaternal = parsed.lastNamePaternal.trim()
    const lastNameMaternal = parsed.lastNameMaternal?.trim() || null
    const name = buildFullName({ firstName, lastNamePaternal, lastNameMaternal })
    const email = parsed.email.trim().toLowerCase()
    const password = parsed.password
    const phone = parsed.phone.trim()
    const dateOfBirth = new Date(parsed.dateOfBirth)

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (existingUser) {
      return NextResponse.json({ error: 'El correo ya está registrado' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          phone,
          role: 'PATIENT',
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      })

      await tx.patient.create({
        data: {
          userId: user.id,
          firstName,
          lastNamePaternal,
          lastNameMaternal,
          email,
          phone,
          dateOfBirth,
        },
      })

      return user
    })

    return NextResponse.json({ success: true, user: result })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: error.issues }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
