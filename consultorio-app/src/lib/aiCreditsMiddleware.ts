import { checkCredits, consumeCredits, type CreditType } from './clinicalCredits'

export class InsufficientCreditsError extends Error {
  constructor(
    public required: number,
    public available: number
  ) {
    super(
      `Créditos insuficientes. Requiere ${required}, tiene ${available} disponibles.`
    )
    this.name = 'InsufficientCreditsError'
  }
}

export async function validateAICredits(
  userId: string | null | undefined,
  creditType: CreditType
): Promise<{
  hasCredits: boolean
  error?: string
}> {
  if (!userId) {
    return {
      hasCredits: false,
      error: 'Usuario no autenticado',
    }
  }

  const check = await checkCredits(userId, creditType)

  if (!check.hasEnoughCredits) {
    return {
      hasCredits: false,
      error: `Créditos insuficientes. Requiere ${check.requiredCredits}, tiene ${check.availableBalance} disponibles.`,
    }
  }

  return { hasCredits: true }
}

export async function consumeAICredits(
  userId: string | null | undefined,
  creditType: CreditType,
  description?: string
): Promise<{
  success: boolean
  error?: string
}> {
  if (!userId) {
    return {
      success: false,
      error: 'Usuario no autenticado',
    }
  }

  const consumed = await consumeCredits(userId, creditType, description)

  if (!consumed) {
    return {
      success: false,
      error: 'Créditos insuficientes',
    }
  }

  return { success: true }
}
