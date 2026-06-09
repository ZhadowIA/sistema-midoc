import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const PROTECTED_PREFIXES = [
  '/api/admin/',
  '/api/agenda/admin/',
  '/api/clinical/admin/',
  '/api/medico/',
]

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function getSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET no configurado')
  return new TextEncoder().encode(secret)
}

export async function middleware(request: NextRequest) {
  if (!isProtected(request.nextUrl.pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get('med_token')?.value
  if (!token) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  try {
    await jwtVerify(token, getSecret())
    return NextResponse.next()
  } catch {
    const response = NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 })
    response.cookies.delete('med_token')
    return response
  }
}

export const config = {
  matcher: [
    '/api/admin/:path*',
    '/api/agenda/admin/:path*',
    '/api/clinical/admin/:path*',
    '/api/medico/:path*',
  ],
}
