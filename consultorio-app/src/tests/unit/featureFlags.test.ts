import assert from 'node:assert/strict'
import prisma from '../../lib/prisma.ts'
import {
  __resetFeatureFlagsCacheForTests,
  canUseAgenda,
  canUseAi,
  canUseClinical,
  hasFeature,
} from '../../lib/featureFlags.ts'
import { runSuite } from '../testHarness.ts'

export async function runFeatureFlagsUnitTests() {
  await runSuite('Unit: featureFlags', [
    {
      name: 'reads enabled feature from subscription features JSON',
      run: async () => {
        const original = prisma.doctorSubscription.findUnique
        try {
          ;(prisma.doctorSubscription.findUnique as unknown as (args: unknown) => Promise<unknown>) = async () => ({
            features: {
              'clinic.reports.aggregate': true,
            },
          })
          __resetFeatureFlagsCacheForTests()

          const enabled = await hasFeature('doctor-1', 'clinic.reports.aggregate')
          assert.equal(enabled, true)
        } finally {
          ;(prisma.doctorSubscription.findUnique as unknown) = original
          __resetFeatureFlagsCacheForTests()
        }
      },
    },
    {
      name: 'returns false when feature key is absent',
      run: async () => {
        const original = prisma.doctorSubscription.findUnique
        try {
          ;(prisma.doctorSubscription.findUnique as unknown as (args: unknown) => Promise<unknown>) = async () => ({
            features: {
              'clinic.seats.enforced': true,
            },
          })
          __resetFeatureFlagsCacheForTests()

          const enabled = await hasFeature('doctor-2', 'ai.insights')
          assert.equal(enabled, false)
        } finally {
          ;(prisma.doctorSubscription.findUnique as unknown) = original
          __resetFeatureFlagsCacheForTests()
        }
      },
    },
    {
      name: 'loads features on each call to avoid stale subscription cache',
      run: async () => {
        const original = prisma.doctorSubscription.findUnique
        let callCount = 0
        try {
          ;(prisma.doctorSubscription.findUnique as unknown as (args: unknown) => Promise<unknown>) = async () => {
            callCount += 1
            return {
              features: {
                'clinical.history': true,
              },
            }
          }
          __resetFeatureFlagsCacheForTests()

          const first = await hasFeature('doctor-3', 'clinical.history')
          const second = await hasFeature('doctor-3', 'clinical.history')
          assert.equal(first, true)
          assert.equal(second, true)
          assert.equal(callCount, 2)
        } finally {
          ;(prisma.doctorSubscription.findUnique as unknown) = original
          __resetFeatureFlagsCacheForTests()
        }
      },
    },
    {
      name: 'canUseAgenda reads canonical agenda capability',
      run: async () => {
        const original = prisma.doctorSubscription.findUnique
        try {
          ;(prisma.doctorSubscription.findUnique as unknown as (args: unknown) => Promise<unknown>) = async () => ({
            features: {
              'agenda.enabled': true,
            },
          })
          __resetFeatureFlagsCacheForTests()

          const enabled = await canUseAgenda('doctor-4')
          assert.equal(enabled, true)
        } finally {
          ;(prisma.doctorSubscription.findUnique as unknown) = original
          __resetFeatureFlagsCacheForTests()
        }
      },
    },
    {
      name: 'canUseClinical accepts clinical.enabled or clinical.history',
      run: async () => {
        const original = prisma.doctorSubscription.findUnique
        try {
          ;(prisma.doctorSubscription.findUnique as unknown as (args: unknown) => Promise<unknown>) = async () => ({
            features: {
              'clinical.enabled': true,
            },
          })
          __resetFeatureFlagsCacheForTests()

          const enabled = await canUseClinical('doctor-5')
          assert.equal(enabled, true)
        } finally {
          ;(prisma.doctorSubscription.findUnique as unknown) = original
          __resetFeatureFlagsCacheForTests()
        }
      },
    },
    {
      name: 'canUseAi requires ai.enabled plus at least one AI capability',
      run: async () => {
        const original = prisma.doctorSubscription.findUnique
        try {
          ;(prisma.doctorSubscription.findUnique as unknown as (args: unknown) => Promise<unknown>) = async () => ({
            features: {
              'ai.enabled': true,
              'ai.insights': true,
            },
          })
          __resetFeatureFlagsCacheForTests()

          const enabled = await canUseAi('doctor-6')
          assert.equal(enabled, true)
        } finally {
          ;(prisma.doctorSubscription.findUnique as unknown) = original
          __resetFeatureFlagsCacheForTests()
        }
      },
    },
  ])
}
