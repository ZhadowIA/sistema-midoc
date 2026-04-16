import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isMedicoArea = pathname.startsWith('/medico')
  const isPacienteArea = pathname.startsWith('/paciente')
  const isPublicMedicoAuthPath =
    pathname.startsWith('/medico/login') || pathname.startsWith('/medico/registro')

  if (isMedicoArea && !isPublicMedicoAuthPath) {
    const token = request.cookies.get('med_token')?.value
    if (!token) {
      return NextResponse.redirect(new URL('/medico/login', request.url))
    }
    try {
      const secretValue = process.env.NEXTAUTH_SECRET
      if (!secretValue) {
        return NextResponse.redirect(new URL('/medico/login', request.url))
      }
      const secret = new TextEncoder().encode(secretValue)
      const { payload } = await jwtVerify(token, secret)
      const role = payload.role

      if (role !== 'DOCTOR' && role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/medico/login', request.url))
      }
      if (role === 'ADMIN') {
        return NextResponse.next()
      }

      const hasActiveSubscription = payload.hasActiveSubscription
      const onboardingCompleted = payload.onboardingCompleted
      const isSubscriptionPath = pathname.startsWith('/medico/suscripcion')
      const isOnboardingPath = pathname.startsWith('/medico/onboarding')

      if (hasActiveSubscription === false && !isSubscriptionPath) {
        return NextResponse.redirect(new URL('/medico/suscripcion', request.url))
      }

      if (hasActiveSubscription !== false && onboardingCompleted === false && !isOnboardingPath) {
        return NextResponse.redirect(new URL('/medico/onboarding', request.url))
      }

      return NextResponse.next()
    } catch {
      return NextResponse.redirect(new URL('/medico/login', request.url))
    }
  }

  if (isPacienteArea) {
    const token = request.cookies.get('med_token')?.value
    if (!token) {
      return NextResponse.redirect(new URL('/agendar', request.url))
    }

    try {
      const secretValue = process.env.NEXTAUTH_SECRET
      if (!secretValue) {
        return NextResponse.redirect(new URL('/agendar', request.url))
      }
      const secret = new TextEncoder().encode(secretValue)
      const { payload } = await jwtVerify(token, secret)
      const role = payload.role

      if (role !== 'PATIENT') {
        return NextResponse.redirect(new URL('/agendar', request.url))
      }

      return NextResponse.next()
    } catch {
      return NextResponse.redirect(new URL('/agendar', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/medico/:path*', '/paciente/:path*'],
}
