import assert from 'node:assert/strict'
import { runSuite } from '../testHarness.ts'
import {
  buildStripeSubscriptionLineItems,
  getStripePriceConfig,
} from '../../lib/stripeCatalog.ts'

const stripeEnv = {
  STRIPE_PRICE_AGENDA_MONTHLY: 'price_1TR62dDkqx985PPYCITWA3h1',
  STRIPE_PRICE_CLINICAL_MONTHLY: 'price_1TR62eDkqx985PPYTYDPavF6',
  STRIPE_PRICE_INTEGRAL_MONTHLY: 'price_1TR62gDkqx985PPYxtXhj5Ks',
  STRIPE_PRICE_AI_30_MONTHLY: 'price_1TR62hDkqx985PPYeqlt4A30',
  STRIPE_PRICE_AI_60_MONTHLY: 'price_1TR62iDkqx985PPYUZ4YV5IQ',
  STRIPE_PRICE_AI_100_MONTHLY: 'price_1TR62kDkqx985PPYzNSjg3AM',
}

export async function runStripeCatalogUnitTests() {
  await runSuite('Unit: stripeCatalog', [
    {
      name: 'maps canonical MiDoc plans to Stripe test price IDs',
      run: async () => {
        const config = getStripePriceConfig(stripeEnv)

        assert.equal(config.basePlans.AGENDA, 'price_1TR62dDkqx985PPYCITWA3h1')
        assert.equal(config.basePlans.CLINICAL, 'price_1TR62eDkqx985PPYTYDPavF6')
        assert.equal(config.basePlans.INTEGRAL, 'price_1TR62gDkqx985PPYxtXhj5Ks')
        assert.equal(config.addOns.AI_30, 'price_1TR62hDkqx985PPYeqlt4A30')
        assert.equal(config.addOns.AI_60, 'price_1TR62iDkqx985PPYUZ4YV5IQ')
        assert.equal(config.addOns.AI_100, 'price_1TR62kDkqx985PPYzNSjg3AM')
      },
    },
    {
      name: 'builds one base plan line item plus selected add-ons',
      run: async () => {
        const lineItems = buildStripeSubscriptionLineItems(
          { basePlan: 'INTEGRAL', addOns: ['AI_60'] },
          stripeEnv,
        )

        assert.deepEqual(lineItems, [
          { price: 'price_1TR62gDkqx985PPYxtXhj5Ks', quantity: 1 },
          { price: 'price_1TR62iDkqx985PPYUZ4YV5IQ', quantity: 1 },
        ])
      },
    },
    {
      name: 'deduplicates add-ons before building line items',
      run: async () => {
        const lineItems = buildStripeSubscriptionLineItems(
          { basePlan: 'CLINICAL', addOns: ['AI_30', 'AI_30'] },
          stripeEnv,
        )

        assert.deepEqual(lineItems, [
          { price: 'price_1TR62eDkqx985PPYTYDPavF6', quantity: 1 },
          { price: 'price_1TR62hDkqx985PPYeqlt4A30', quantity: 1 },
        ])
      },
    },
    {
      name: 'throws a clear error when a selected price is missing',
      run: async () => {
        assert.throws(
          () => buildStripeSubscriptionLineItems(
            { basePlan: 'AGENDA', addOns: ['AI_100'] },
            { ...stripeEnv, STRIPE_PRICE_AI_100_MONTHLY: '' },
          ),
          /STRIPE_PRICE_AI_100_MONTHLY no configurado/,
        )
      },
    },
  ])
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  runStripeCatalogUnitTests().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  })
}
