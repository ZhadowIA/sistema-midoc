import type {
  CommercialAddOn,
  CommercialBasePlan,
  CommercialPlanSelection,
} from '@/lib/subscriptionCatalog'
import {
  COMMERCIAL_ADD_ONS,
  COMMERCIAL_BASE_PLANS,
} from '@/lib/subscriptionCatalog'

type StripeCatalogEnv = Partial<Record<StripePriceEnvKey, string | undefined>>

export type StripeLineItem = {
  price: string
  quantity: 1
}

export const STRIPE_PRICE_ENV_KEYS = {
  basePlans: {
    AGENDA: 'STRIPE_PRICE_AGENDA_MONTHLY',
    CLINICAL: 'STRIPE_PRICE_CLINICAL_MONTHLY',
    INTEGRAL: 'STRIPE_PRICE_INTEGRAL_MONTHLY',
  },
  addOns: {
    AI_30: 'STRIPE_PRICE_AI_30_MONTHLY',
    AI_60: 'STRIPE_PRICE_AI_60_MONTHLY',
    AI_100: 'STRIPE_PRICE_AI_100_MONTHLY',
  },
} as const

export type StripePriceEnvKey =
  | (typeof STRIPE_PRICE_ENV_KEYS.basePlans)[keyof typeof STRIPE_PRICE_ENV_KEYS.basePlans]
  | (typeof STRIPE_PRICE_ENV_KEYS.addOns)[keyof typeof STRIPE_PRICE_ENV_KEYS.addOns]

export type StripePriceConfig = {
  basePlans: Record<CommercialBasePlan, string>
  addOns: Record<CommercialAddOn, string>
}

function readRequiredPrice(env: StripeCatalogEnv, key: StripePriceEnvKey): string {
  const value = env[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} no configurado`)
  }
  return value.trim()
}

export function getStripePriceConfig(env: StripeCatalogEnv): StripePriceConfig {
  return {
    basePlans: {
      [COMMERCIAL_BASE_PLANS.AGENDA]: readRequiredPrice(env, STRIPE_PRICE_ENV_KEYS.basePlans.AGENDA),
      [COMMERCIAL_BASE_PLANS.CLINICAL]: readRequiredPrice(env, STRIPE_PRICE_ENV_KEYS.basePlans.CLINICAL),
      [COMMERCIAL_BASE_PLANS.INTEGRAL]: readRequiredPrice(env, STRIPE_PRICE_ENV_KEYS.basePlans.INTEGRAL),
    },
    addOns: {
      [COMMERCIAL_ADD_ONS.AI_30]: readRequiredPrice(env, STRIPE_PRICE_ENV_KEYS.addOns.AI_30),
      [COMMERCIAL_ADD_ONS.AI_60]: readRequiredPrice(env, STRIPE_PRICE_ENV_KEYS.addOns.AI_60),
      [COMMERCIAL_ADD_ONS.AI_100]: readRequiredPrice(env, STRIPE_PRICE_ENV_KEYS.addOns.AI_100),
    },
  }
}

function uniqueAddOns(addOns: CommercialAddOn[] | undefined): CommercialAddOn[] {
  return Array.from(new Set(addOns ?? []))
}

export function buildStripeSubscriptionLineItems(
  selection: CommercialPlanSelection,
  env: StripeCatalogEnv,
): StripeLineItem[] {
  const config = getStripePriceConfig(env)
  const lineItems: StripeLineItem[] = [
    { price: config.basePlans[selection.basePlan], quantity: 1 },
  ]

  for (const addOn of uniqueAddOns(selection.addOns)) {
    lineItems.push({ price: config.addOns[addOn], quantity: 1 })
  }

  return lineItems
}
