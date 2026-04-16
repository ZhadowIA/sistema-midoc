import { getServerEnv } from './env'

const DEFAULT_PROVIDER_SEND_URL = 'http://localhost:3001/api/whatsapp/send'

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

export function getWhatsAppProviderBaseUrl() {
  const env = getServerEnv()
  const configuredUrl = env.WHATSAPP_API_URL?.trim() || DEFAULT_PROVIDER_SEND_URL
  const normalized = stripTrailingSlash(configuredUrl)

  if (normalized.endsWith('/send')) {
    return normalized.slice(0, -'/send'.length)
  }

  return normalized
}

export function getWhatsAppProviderSendUrl() {
  return `${getWhatsAppProviderBaseUrl()}/send`
}

export function buildWhatsAppProviderUrl(pathname: string) {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${getWhatsAppProviderBaseUrl()}${cleanPath}`
}
