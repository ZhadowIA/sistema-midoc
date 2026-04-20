import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import {
  getDefaultLandingPath,
  hasModuleAccess,
  moduleFromPath,
  PRODUCT_MODULES,
  type ProductAccess,
} from '@/lib/productAccess'

function resolveAccessFromPayload(payload: Record<string, unknown>): ProductAccess {
  const enabledModules = Array.isArray(payload.enabledModules)
    ? payload.enabledModules.filter(
        (item): item is 'AGENDA' | 'CLINICAL_RECORDS' =>
          item === PRODUCT_MODULES.AGENDA || item === PRODUCT_MODULES.CLINICAL_RECORDS
      )
    : [PRODUCT_MODULES.AGENDA, PRODUCT_MODULES.CLINICAL_RECORDS]

  const plan =
    payload.productPlan === 'AGENDA' ||
    payload.productPlan === 'CLINICAL_RECORDS' ||
    payload.productPlan === 'COMBINED'
      ? payload.productPlan
      : 'COMBINED'

  return {
    plan,
    enabledModules: enabledModules.length > 0 ? enabledModules : [PRODUCT_MODULES.AGENDA],
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isMedicoArea = pathname.startsWith('/medico')
  const isPacienteArea = pathname.startsWith('/paciente')
  const isAgendaApi = pathname.startsWith('/api/agenda')
  const isClinicalApi = pathname.startsWith('/api/clinical')
  const isProductApi = isAgendaApi || isClinicalApi
  const isPublicMedicoAuthPath =
    pathname.startsWith('/medico/login') || pathname.startsWith('/medico/registro')

  if ((isMedicoArea && !isPublicMedicoAuthPath) || isProductApi) {
    const token = request.cookies.get('med_token')?.value
    if (!token) {
      if (isProductApi) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/medico/login', request.url))
    }
    try {
      const secretValue = process.env.NEXTAUTH_SECRET
      if (!secretValue) {
        if (isProductApi) {
          return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }
        return NextResponse.redirect(new URL('/medico/login', request.url))
      }
      const secret = new TextEncoder().encode(secretValue)
      const { payload } = await jwtVerify(token, secret)
      const role = payload.role

      if (role !== 'DOCTOR' && role !== 'ADMIN' && role !== 'CLINIC_ADMIN' && role !== 'SECRETARY') {
        if (isProductApi) {
          return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }
        return NextResponse.redirect(new URL('/medico/login', request.url))
      }
      if (role === 'ADMIN' || role === 'CLINIC_ADMIN') {
        return NextResponse.next()
      }

      if (isProductApi) {
        const access = resolveAccessFromPayload(payload as Record<string, unknown>)
        const requiredModule = isAgendaApi ? PRODUCT_MODULES.AGENDA : PRODUCT_MODULES.CLINICAL_RECORDS
        if (!hasModuleAccess(access, requiredModule)) {
          return NextResponse.json({ error: 'Módulo no incluido en tu plan' }, { status: 403 })
        }
        return NextResponse.next()
      }

      if (role === 'SECRETARY') {
        const access = resolveAccessFromPayload(payload as Record<string, unknown>)
        const requiredModule = moduleFromPath(pathname)
        if (requiredModule && !hasModuleAccess(access, requiredModule)) {
          return NextResponse.redirect(new URL(getDefaultLandingPath(access), request.url))
        }
        return NextResponse.next()
      }

      const access = resolveAccessFromPayload(payload as Record<string, unknown>)
      const requiredModule = moduleFromPath(pathname)
      if (requiredModule && !hasModuleAccess(access, requiredModule)) {
        return NextResponse.redirect(new URL(getDefaultLandingPath(access), request.url))
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
      if (isProductApi) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
      }
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
  matcher: ['/medico/:path*', '/paciente/:path*', '/api/agenda/:path*', '/api/clinical/:path*'],
}
