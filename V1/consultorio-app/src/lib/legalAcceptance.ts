import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { getServerEnv } from '@/lib/env'
import { getRequestIp, getUserAgent } from '@/lib/requestContext'

export type LegalAcceptanceContext = 'REGISTER' | 'REACCEPT' | 'CHECKOUT'

export interface RecordLegalAcceptanceInput {
  userId: string
  request?: Request | null
  context?: LegalAcceptanceContext
  tx?: Prisma.TransactionClient
}

export async function recordLegalAcceptance(input: RecordLegalAcceptanceInput) {
  const env = getServerEnv()
  const now = new Date()
  const client = input.tx ?? prisma
  const ipAddress = input.request ? getRequestIp(input.request) : null
  const userAgent = input.request ? getUserAgent(input.request) : null

  return client.legalAcceptance.create({
    data: {
      userId: input.userId,
      termsVersion: env.TERMS_VERSION,
      privacyVersion: env.PRIVACY_VERSION,
      termsAcceptedAt: now,
      privacyAcceptedAt: now,
      ipAddress,
      userAgent,
      context: input.context ?? 'REGISTER',
    },
  })
}

export interface LegalStatus {
  currentTermsVersion: string
  currentPrivacyVersion: string
  acceptedTermsVersion: string | null
  acceptedPrivacyVersion: string | null
  acceptedAt: Date | null
  upToDate: boolean
}

export async function getLegalStatusForUser(userId: string): Promise<LegalStatus> {
  const env = getServerEnv()
  const latest = await prisma.legalAcceptance.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  const acceptedTermsVersion = latest?.termsVersion ?? null
  const acceptedPrivacyVersion = latest?.privacyVersion ?? null
  const upToDate =
    acceptedTermsVersion === env.TERMS_VERSION &&
    acceptedPrivacyVersion === env.PRIVACY_VERSION

  return {
    currentTermsVersion: env.TERMS_VERSION,
    currentPrivacyVersion: env.PRIVACY_VERSION,
    acceptedTermsVersion,
    acceptedPrivacyVersion,
    acceptedAt: latest?.createdAt ?? null,
    upToDate,
  }
}
