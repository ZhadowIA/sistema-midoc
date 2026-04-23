import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import {
  buildProductAccessFromFeatures,
  getDefaultLandingPath,
  getPlanModules,
  hasModuleAccess,
  moduleFromPath,
  PRODUCT_MODULES,
  PRODUCT_PLANS,
  type ProductAccess,
  type ProductPlan,
} from '@/lib/productAccess'

function resolveLegacyPlan(payload: Record<string, unknown>): ProductPlan {
  return payload.productPlan === 'AGENDA' ||
    payload.productPlan === 'CLINICAL_RECORDS' ||
    payload.productPlan === 'COMBINED'
    ? payload.productPlan
    : PRODUCT_PLANS.COMBINED
}

function resolveAccessFromPayload(payload: Record<string, unknown>): ProductAccess {
  if (payload.features && typeof payload.features === 'object' && !Array.isArray(payload.features)) {
    return buildProductAccessFromFeatures(payload.features, resolveLegacyPlan(payload))
  }

  const enabledModules = Array.isArray(payload.enabledModules)
    ? payload.enabledModules.filter(
        (item): item is 'AGENDA' | 'CLINICAL_RECORDS' =>
          item === PRODUCT_MODULES.AGENDA || item === PRODUCT_MODULES.CLINICAL_RECORDS
      )
    : getPlanModules(resolveLegacyPlan(payload))

  const plan = resolveLegacyPlan(payload)

  return {
    plan,
    enabledModules: enabledModules.length > 0 ? enabledModules : [PRODUCT_MODULES.AGENDA],
    features: {},
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isMedicoArea = pathname.startsWith('/medico')
  const isPacienteArea = pathname.startsWith('/paciente')
  const isAgendaApi = pathname.startsWith('/api/agenda')
  const isClinicalApi = pathname.startsWith('/api/clinical')
  const isPublicAgendaApi = pathname.startsWith('/api/agenda/public')
  const isProductApi = (isAgendaApi || isClinicalApi) && !isPublicAgendaApi
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

      const access = resolveAccessFromPayload(payload as Record<string, unknown>)

      if (isProductApi) {
        const requiredModule = isAgendaApi ? PRODUCT_MODULES.AGENDA : PRODUCT_MODULES.CLINICAL_RECORDS
        if (!hasModuleAccess(access, requiredModule)) {
          return NextResponse.json({ error: 'Módulo no incluido en tu plan' }, { status: 403 })
        }
        return NextResponse.next()
      }

      if (role === 'SECRETARY') {
        const requiredModule = moduleFromPath(pathname)
        if (requiredModule && !hasModuleAccess(access, requiredModule)) {
          return NextResponse.redirect(new URL(getDefaultLandingPath(access), request.url))
        }
        return NextResponse.next()
      }

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
