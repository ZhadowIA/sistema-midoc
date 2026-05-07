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

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const CSRF_PROTECTED_API_PREFIXES = [
  '/api/admin',
  '/api/agenda/admin',
  '/api/auth',
  '/api/clinical/admin',
  '/api/medico',
]

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const allowedOrigins = resolveAllowedOrigins(request)

  if (origin) return allowedOrigins.has(origin)
  if (referer) {
    try {
      return allowedOrigins.has(new URL(referer).origin)
    } catch {
      return false
    }
  }

  return true
}

function resolveAllowedOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>([request.nextUrl.origin])
  const appBaseUrl = process.env.APP_BASE_URL
  if (appBaseUrl) {
    try {
      origins.add(new URL(appBaseUrl).origin)
    } catch {
      // Ignore invalid env here. Env validation handles this elsewhere.
    }
  }

  const host = request.headers.get('host')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  const candidateHosts = [host, forwardedHost].filter(Boolean) as string[]

  for (const candidateHost of candidateHosts) {
    origins.add(`${request.nextUrl.protocol}//${candidateHost}`)
    origins.add(`${forwardedProto}://${candidateHost}`)
  }

  return origins
}

function shouldApplyCsrfGuard(request: NextRequest): boolean {
  if (!MUTATING_METHODS.has(request.method)) return false
  if (!request.cookies.has('med_token')) return false

  const pathname = request.nextUrl.pathname
  return CSRF_PROTECTED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function applySecurityHeaders(response: NextResponse, request: NextRequest): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(self), geolocation=(), payment=(self), usb=(), browsing-topics=()'
  )
  response.headers.set(
    'Content-Security-Policy',
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"
  )

  if (process.env.NODE_ENV === 'production' && request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  }

  return response
}

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
  const patientLoginUrl = new URL('/paciente/login', request.url)
  const returnToPath = `${request.nextUrl.pathname}${request.nextUrl.search}`
  patientLoginUrl.searchParams.set('returnTo', returnToPath)

  const pathname = request.nextUrl.pathname
  const isMedicoArea = pathname.startsWith('/medico')
  const isPacienteArea = pathname.startsWith('/paciente')
  const isAgendaApi = pathname.startsWith('/api/agenda')
  const isClinicalApi = pathname.startsWith('/api/clinical')
  const isPublicAgendaApi = pathname.startsWith('/api/agenda/public')
  const isProductApi = (isAgendaApi || isClinicalApi) && !isPublicAgendaApi
  const isPublicMedicoAuthPath =
    pathname.startsWith('/medico/login') || pathname.startsWith('/medico/registro')
  const isPublicPacienteAuthPath =
    pathname.startsWith('/paciente/login') || pathname.startsWith('/paciente/registro')

  if (shouldApplyCsrfGuard(request) && !isSameOrigin(request)) {
    return applySecurityHeaders(
      NextResponse.json({ error: 'Solicitud rechazada por validación de origen' }, { status: 403 }),
      request
    )
  }

  if ((isMedicoArea && !isPublicMedicoAuthPath) || isProductApi) {
    const token = request.cookies.get('med_token')?.value
    if (!token) {
      if (isProductApi) {
        return applySecurityHeaders(NextResponse.json({ error: 'No autorizado' }, { status: 401 }), request)
      }
      return applySecurityHeaders(NextResponse.redirect(new URL('/medico/login', request.url)), request)
    }
    try {
      const secretValue = process.env.NEXTAUTH_SECRET
      if (!secretValue) {
        if (isProductApi) {
          return applySecurityHeaders(NextResponse.json({ error: 'No autorizado' }, { status: 401 }), request)
        }
        return applySecurityHeaders(NextResponse.redirect(new URL('/medico/login', request.url)), request)
      }
      const secret = new TextEncoder().encode(secretValue)
      const { payload } = await jwtVerify(token, secret)
      const role = payload.role
      const twoFactorSetupRequired = payload.twoFactorSetupRequired === true

      if (role !== 'DOCTOR' && role !== 'ADMIN' && role !== 'CLINIC_ADMIN' && role !== 'SECRETARY') {
        if (isProductApi) {
          return applySecurityHeaders(NextResponse.json({ error: 'No autorizado' }, { status: 401 }), request)
        }
        return applySecurityHeaders(NextResponse.redirect(new URL('/medico/login', request.url)), request)
      }
      if ((role === 'ADMIN' || role === 'CLINIC_ADMIN') && twoFactorSetupRequired) {
        const isSecurityPath = pathname.startsWith('/medico/seguridad')
        const allowedApiWhileEnforcing =
          pathname.startsWith('/api/admin/security/2fa') ||
          pathname.startsWith('/api/admin/profile') ||
          pathname.startsWith('/api/admin/config') ||
          pathname.startsWith('/api/auth/logout') ||
          pathname.startsWith('/api/auth/session/refresh')

        if (isProductApi && !allowedApiWhileEnforcing) {
          return applySecurityHeaders(
            NextResponse.json(
              { error: 'Debes activar autenticación de dos factores antes de continuar.' },
              { status: 403 }
            ),
            request
          )
        }

        if (!isProductApi && !isSecurityPath) {
          return applySecurityHeaders(NextResponse.redirect(new URL('/medico/seguridad', request.url)), request)
        }
      }

      if (role === 'ADMIN' || role === 'CLINIC_ADMIN') {
        return applySecurityHeaders(NextResponse.next(), request)
      }

      const access = resolveAccessFromPayload(payload as Record<string, unknown>)

      if (isProductApi) {
        const requiredModule = isAgendaApi ? PRODUCT_MODULES.AGENDA : PRODUCT_MODULES.CLINICAL_RECORDS
        if (!hasModuleAccess(access, requiredModule)) {
          return applySecurityHeaders(NextResponse.json({ error: 'Módulo no incluido en tu plan' }, { status: 403 }), request)
        }
        return applySecurityHeaders(NextResponse.next(), request)
      }

      if (role === 'SECRETARY') {
        const requiredModule = moduleFromPath(pathname)
        if (requiredModule && !hasModuleAccess(access, requiredModule)) {
          return applySecurityHeaders(NextResponse.redirect(new URL(getDefaultLandingPath(access), request.url)), request)
        }
        return applySecurityHeaders(NextResponse.next(), request)
      }

      const requiredModule = moduleFromPath(pathname)
      if (requiredModule && !hasModuleAccess(access, requiredModule)) {
        return applySecurityHeaders(NextResponse.redirect(new URL(getDefaultLandingPath(access), request.url)), request)
      }

      const hasActiveSubscription = payload.hasActiveSubscription
      const onboardingCompleted = payload.onboardingCompleted
      const isSubscriptionPath = pathname.startsWith('/medico/suscripcion')
      const isOnboardingPath = pathname.startsWith('/medico/onboarding')

      if (hasActiveSubscription === false && !isSubscriptionPath) {
        return applySecurityHeaders(NextResponse.redirect(new URL('/medico/suscripcion', request.url)), request)
      }

      if (hasActiveSubscription !== false && onboardingCompleted === false && !isOnboardingPath) {
        return applySecurityHeaders(NextResponse.redirect(new URL('/medico/onboarding', request.url)), request)
      }

      return applySecurityHeaders(NextResponse.next(), request)
    } catch {
      if (isProductApi) {
        return applySecurityHeaders(NextResponse.json({ error: 'No autorizado' }, { status: 401 }), request)
      }
      return applySecurityHeaders(NextResponse.redirect(new URL('/medico/login', request.url)), request)
    }
  }

  if (isPacienteArea && !isPublicPacienteAuthPath) {
    const token = request.cookies.get('med_token')?.value
    if (!token) {
      return applySecurityHeaders(NextResponse.redirect(patientLoginUrl), request)
    }

    try {
      const secretValue = process.env.NEXTAUTH_SECRET
      if (!secretValue) {
        return applySecurityHeaders(NextResponse.redirect(patientLoginUrl), request)
      }
      const secret = new TextEncoder().encode(secretValue)
      const { payload } = await jwtVerify(token, secret)
      const role = payload.role

      if (role !== 'PATIENT') {
        return applySecurityHeaders(NextResponse.redirect(patientLoginUrl), request)
      }

      return applySecurityHeaders(NextResponse.next(), request)
    } catch {
      return applySecurityHeaders(NextResponse.redirect(patientLoginUrl), request)
    }
  }

  return applySecurityHeaders(NextResponse.next(), request)
}

export const config = {
  matcher: [
    '/medico/:path*',
    '/paciente/:path*',
    '/api/admin/:path*',
    '/api/agenda/:path*',
    '/api/auth/:path*',
    '/api/clinical/:path*',
    '/api/medico/:path*',
  ],
}
