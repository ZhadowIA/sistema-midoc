import prisma from './prisma'

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789' // no 0/O/1/l/i to avoid ambiguity
const CODE_LENGTH = 7

function generateCode(): string {
  return Array.from(
    { length: CODE_LENGTH },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  ).join('')
}

export async function createShortLink(targetUrl: string, expiresAt?: Date): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    try {
      await prisma.shortLink.create({ data: { code, targetUrl, expiresAt } })
      return code
    } catch {
      // unique constraint violation — retry with a new code
    }
  }
  throw new Error('No se pudo generar un código único para el enlace corto')
}

export async function resolveShortLink(code: string): Promise<string | null> {
  const link = await prisma.shortLink.findUnique({ where: { code } })
  if (!link) return null
  if (link.expiresAt && link.expiresAt < new Date()) return null
  return link.targetUrl
}

export function buildShortUrl(baseUrl: string, code: string): string {
  return `${baseUrl}/r/${code}`
}
