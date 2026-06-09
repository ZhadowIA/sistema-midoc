import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import prisma from '@/lib/prisma'
import { getServerEnv } from '@/lib/env'

const env = getServerEnv()
const secret = new TextEncoder().encode(env.NEXTAUTH_SECRET)

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get('med_token')?.value

  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret)
      const jti = payload.jti
      const sub = payload.sub
      const exp = payload.exp
      if (typeof jti === 'string' && typeof sub === 'string' && typeof exp === 'number') {
        await prisma.tokenBlacklist.create({
          data: { jti, userId: sub, expiresAt: new Date(exp * 1000) },
        })
      }
    } catch {
      // Token inválido o ya expirado — no es necesario blacklistearlo
    }
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set('med_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })

  return response
}
