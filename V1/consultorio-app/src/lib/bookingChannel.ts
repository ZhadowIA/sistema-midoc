export type BookingChannel =
  | 'INSTAGRAM'
  | 'WHATSAPP'
  | 'GOOGLE_BUSINESS'
  | 'WEBSITE'
  | 'CAMPAIGN'
  | 'MANUAL'
  | 'UNKNOWN'

export interface UtmContext {
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  referrerChannel: BookingChannel
  sessionId: string
}

const CHANNEL_COOKIE = 'bk_utm'
const SESSION_COOKIE = 'bk_sid'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 días

function resolveChannel(source: string | null, medium: string | null): BookingChannel {
  if (!source) return 'UNKNOWN'
  const s = source.toLowerCase()
  const m = (medium || '').toLowerCase()
  if (s === 'instagram' || s.includes('ig')) return 'INSTAGRAM'
  if (s === 'whatsapp' || s === 'wa') return 'WHATSAPP'
  if (s === 'google' && m === 'organic') return 'GOOGLE_BUSINESS'
  if (m === 'cpc' || m === 'paid' || m === 'paidsocial') return 'CAMPAIGN'
  if (s === 'website' || s === 'direct') return 'WEBSITE'
  if (source) return 'CAMPAIGN'
  return 'UNKNOWN'
}

function generateSessionId(): string {
  return crypto.randomUUID()
}

function parseCookies(): Record<string, string> {
  if (typeof document === 'undefined') return {}
  return Object.fromEntries(
    document.cookie.split(';').map(c => {
      const [k, ...v] = c.trim().split('=')
      return [k, decodeURIComponent(v.join('='))]
    })
  )
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAge};SameSite=Lax`
}

export function getOrCreateUtmContext(): UtmContext {
  const params = new URLSearchParams(window.location.search)
  const utmSource = params.get('utm_source')
  const utmMedium = params.get('utm_medium')
  const utmCampaign = params.get('utm_campaign')
  const utmContent = params.get('utm_content')

  const cookies = parseCookies()

  // Obtener o generar sessionId
  let sessionId = cookies[SESSION_COOKIE]
  if (!sessionId) {
    sessionId = generateSessionId()
    setCookie(SESSION_COOKIE, sessionId, COOKIE_MAX_AGE)
  }

  // Si hay UTMs frescos en la URL, sobreescribir cookie
  if (utmSource || utmCampaign) {
    const payload = JSON.stringify({ utmSource, utmMedium, utmCampaign, utmContent })
    setCookie(CHANNEL_COOKIE, payload, COOKIE_MAX_AGE)
    return {
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      referrerChannel: resolveChannel(utmSource, utmMedium),
      sessionId,
    }
  }

  // Recuperar de cookie
  if (cookies[CHANNEL_COOKIE]) {
    try {
      const stored = JSON.parse(cookies[CHANNEL_COOKIE])
      return {
        utmSource: stored.utmSource ?? null,
        utmMedium: stored.utmMedium ?? null,
        utmCampaign: stored.utmCampaign ?? null,
        utmContent: stored.utmContent ?? null,
        referrerChannel: resolveChannel(stored.utmSource, stored.utmMedium),
        sessionId,
      }
    } catch {
      // cookie corrupta — ignorar
    }
  }

  return {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    referrerChannel: 'UNKNOWN',
    sessionId,
  }
}
