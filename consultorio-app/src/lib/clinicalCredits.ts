import prisma from '@/lib/prisma'

export const CLINICAL_CREDIT_COSTS = {
  transcription: 2,
  dictation: 1,
  insights: 1,
  pharmacovigilance: 2,
  patientInstructions: 1,
  questionnaireFollowUp: 1,
} as const

// Monthly credit allocations by AI add-on tier
export const MONTHLY_CREDIT_ALLOCATIONS = {
  AI_30: 1008,  // 126 consultas × 8 créditos
  AI_60: 2016,  // 252 consultas × 8 créditos
  AI_100: 3360, // 420 consultas × 8 créditos
} as const

// Legacy: default to AI_100 for backwards compatibility
export const MONTHLY_CREDIT_ALLOCATION = MONTHLY_CREDIT_ALLOCATIONS.AI_100

export type CreditType = keyof typeof CLINICAL_CREDIT_COSTS

export interface CreditCheckResult {
  hasEnoughCredits: boolean
  requiredCredits: number
  currentBalance: number
  availableBalance: number
}

export async function getCreditBalance(userId: string): Promise<{
  balance: number
  reserved: number
  available: number
}> {
  const credit = await prisma.clinicalCredit.findUnique({
    where: { userId },
  })

  if (!credit) {
    return { balance: 0, reserved: 0, available: 0 }
  }

  return {
    balance: credit.balance,
    reserved: credit.reserved,
    available: credit.balance - credit.reserved,
  }
}

export async function checkCredits(
  userId: string,
  requiredCredits: CreditType | number
): Promise<CreditCheckResult> {
  const costInCredits =
    typeof requiredCredits === 'number'
      ? requiredCredits
      : CLINICAL_CREDIT_COSTS[requiredCredits]

  const balanceInfo = await getCreditBalance(userId)

  return {
    hasEnoughCredits: balanceInfo.available >= costInCredits,
    requiredCredits: costInCredits,
    currentBalance: balanceInfo.balance,
    availableBalance: balanceInfo.available,
  }
}

export async function consumeCredits(
  userId: string,
  creditType: CreditType,
  description?: string
): Promise<boolean> {
  const costInCredits = CLINICAL_CREDIT_COSTS[creditType]
  const check = await checkCredits(userId, costInCredits)

  if (!check.hasEnoughCredits) {
    return false
  }

  const credit = await prisma.clinicalCredit.findUnique({
    where: { userId },
  })

  if (!credit) {
    return false
  }

  await prisma.$transaction([
    prisma.clinicalCredit.update({
      where: { userId },
      data: { balance: { decrement: costInCredits } },
    }),
    prisma.clinicalCreditTransaction.create({
      data: {
        creditId: credit.id,
        type: 'USAGE',
        amount: -costInCredits,
        description: description || `Usage: ${creditType}`,
      },
    }),
  ])

  return true
}

export async function allocateMonthlyCredits(
  userId: string,
  tier: keyof typeof MONTHLY_CREDIT_ALLOCATIONS = 'AI_100'
): Promise<void> {
  let credit = await prisma.clinicalCredit.findUnique({
    where: { userId },
  })

  if (!credit) {
    credit = await prisma.clinicalCredit.create({
      data: { userId, balance: 0 },
    })
  }

  const allocationAmount = MONTHLY_CREDIT_ALLOCATIONS[tier]
  const maxBalance = allocationAmount * 2
  const newBalance = Math.min(credit.balance + allocationAmount, maxBalance)
  const actualAllocationAmount = newBalance - credit.balance

  await prisma.$transaction([
    prisma.clinicalCredit.update({
      where: { userId },
      data: { balance: newBalance },
    }),
    prisma.clinicalCreditTransaction.create({
      data: {
        creditId: credit.id,
        type: 'MONTHLY_ALLOCATION',
        amount: actualAllocationAmount,
        description: `Monthly allocation (${tier})`,
        metadata: { month: new Date().toISOString().slice(0, 7), tier },
      },
    }),
  ])
}

export async function getTransactionHistory(
  userId: string,
  limit: number = 50
): Promise<
  {
    id: string
    type: string
    amount: number
    description: string | null
    createdAt: Date
  }[]
> {
  const credit = await prisma.clinicalCredit.findUnique({
    where: { userId },
  })

  if (!credit) {
    return []
  }

  const transactions = await prisma.clinicalCreditTransaction.findMany({
    where: { creditId: credit.id },
    select: {
      id: true,
      type: true,
      amount: true,
      description: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return transactions
}
