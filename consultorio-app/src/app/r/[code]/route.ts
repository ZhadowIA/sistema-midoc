import { NextResponse } from 'next/server'
import { resolveShortLink } from '@/lib/shortLink'
import prisma from '@/lib/prisma'

export async function GET(_: Request, props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params
  const targetUrl = await resolveShortLink(code)
  if (!targetUrl) {
    return new NextResponse('Enlace no encontrado o expirado', { status: 404 })
  }

  prisma.shortLink.update({
    where: { code },
    data: { clickCount: { increment: 1 }, lastClickedAt: new Date() },
  }).catch(() => {/* non-blocking */})

  return NextResponse.redirect(targetUrl, { status: 302 })
}
