import { NextRequest } from 'next/server'
import { jsonNoStore } from '@/lib/http'
import prisma from '@/lib/prisma'
import { allocateMonthlyCredits } from '@/lib/clinicalCredits'

const CRON_SECRET = process.env.NOTIFICATION_CRON_SECRET || ''

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const secret = authHeader?.replace('Bearer ', '')

  if (!secret || secret !== CRON_SECRET) {
    return jsonNoStore({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find all doctors with active AI add-on subscription
    const doctorsWithAI = await prisma.user.findMany({
      where: {
        role: 'DOCTOR',
        active: true,
        subscription: {
          status: 'ACTIVE',
        },
      },
      select: {
        id: true,
        subscription: {
          select: {
            features: true,
          },
        },
      },
    })

    let allocated = 0
    let failed = 0
    const results: Array<{ doctorId: string; tier: string; result: string }> = []

    for (const doctor of doctorsWithAI) {
      if (!doctor.subscription?.features) continue

      const features = doctor.subscription.features as Record<string, unknown>
      const addOns = features['subscription.addOns']

      if (!Array.isArray(addOns)) continue

      // Determine which AI tier the doctor has
      const hasAI30 = addOns.includes('AI_30')
      const hasAI60 = addOns.includes('AI_60')
      const hasAI100 = addOns.includes('AI_100')

      let tier: 'AI_30' | 'AI_60' | 'AI_100' | null = null
      if (hasAI100) tier = 'AI_100'
      else if (hasAI60) tier = 'AI_60'
      else if (hasAI30) tier = 'AI_30'

      if (!tier) continue

      try {
        await allocateMonthlyCredits(doctor.id, tier)
        allocated++
        results.push({ doctorId: doctor.id, tier, result: 'success' })
      } catch (error) {
        console.error(`Failed to allocate credits for doctor ${doctor.id}:`, error)
        failed++
        results.push({
          doctorId: doctor.id,
          tier,
          result: `error: ${error instanceof Error ? error.message : 'unknown'}`,
        })
      }
    }

    const doctorsWithAny = doctorsWithAI.filter((d) => {
      const features = d.subscription?.features as Record<string, unknown>
      const addOns = features?.['subscription.addOns']
      return Array.isArray(addOns) && (addOns.includes('AI_30') || addOns.includes('AI_60') || addOns.includes('AI_100'))
    })

    return jsonNoStore({
      success: true,
      allocated,
      failed,
      total: doctorsWithAny.length,
      message: `Allocated credits to ${allocated}/${doctorsWithAny.length} doctors with AI add-on`,
      results: results.slice(0, 10), // Return first 10 for debugging
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Credit allocation cron error:', error)
    return jsonNoStore(
      { error: message, success: false },
      { status: 500 }
    )
  }
}
