import assert from 'node:assert/strict'
import {
  resolveDepositCancellationOutcome,
  resolveDepositRequirement,
} from '../../lib/depositPolicy.ts'
import { runSuite } from '../testHarness.ts'

export async function runDepositPolicyUnitTests() {
  await runSuite('Unit: depositPolicy', [
    {
      name: 'resolveDepositRequirement returns pending deposit capped to appointment price',
      run: () => {
        const result = resolveDepositRequirement(
          {
            depositEnabled: true,
            depositAmount: 800,
            normalConsultationPrice: 500,
            depositExpiresInMinutes: 45,
            cancellationWindowHours: 24,
            cancellationRefundMode: 'PARTIAL',
            cancellationPartialRefundPct: 60,
          },
          'NORMAL',
          {
            now: new Date('2026-04-21T10:00:00.000Z'),
            appointmentStart: new Date('2026-04-22T16:00:00.000Z'),
          }
        )

        assert.equal(result.paymentStatus, 'PAYMENT_PENDING')
        assert.equal(result.depositRequiredAmount, 500)
        assert.equal(result.depositDueAt?.toISOString(), '2026-04-21T10:45:00.000Z')
        assert.deepEqual(result.cancellationPolicySnapshot, {
          windowHours: 24,
          refundMode: 'PARTIAL',
          partialRefundPct: 60,
        })
      },
    },
    {
      name: 'resolveDepositRequirement disables deposit when config is off',
      run: () => {
        const result = resolveDepositRequirement(
          {
            depositEnabled: false,
            depositAmount: 300,
          },
          'EXTENDED',
          {
            appointmentStart: new Date('2026-04-22T16:00:00.000Z'),
          }
        )

        assert.equal(result.paymentStatus, 'NOT_REQUIRED')
        assert.equal(result.depositRequiredAmount, null)
        assert.equal(result.depositDueAt, null)
        assert.equal(result.cancellationPolicySnapshot, null)
      },
    },
    {
      name: 'resolveDepositCancellationOutcome returns full refund inside window',
      run: () => {
        const result = resolveDepositCancellationOutcome({
          appointmentStart: new Date('2026-04-22T18:00:00.000Z'),
          cancelledAt: new Date('2026-04-21T10:00:00.000Z'),
          depositPaidAmount: 250,
          policySnapshot: {
            windowHours: 24,
            refundMode: 'FORFEIT',
            partialRefundPct: 25,
          },
        })

        assert.equal(result.withinWindow, true)
        assert.equal(result.refundableAmount, 250)
        assert.equal(result.creditAmount, 0)
        assert.equal(result.forfeitedAmount, 0)
      },
    },
    {
      name: 'resolveDepositCancellationOutcome applies partial refund outside window',
      run: () => {
        const result = resolveDepositCancellationOutcome({
          appointmentStart: new Date('2026-04-21T18:00:00.000Z'),
          cancelledAt: new Date('2026-04-21T10:00:00.000Z'),
          depositPaidAmount: 400,
          policySnapshot: {
            windowHours: 24,
            refundMode: 'PARTIAL',
            partialRefundPct: 25,
          },
        })

        assert.equal(result.withinWindow, false)
        assert.equal(result.refundableAmount, 100)
        assert.equal(result.creditAmount, 0)
        assert.equal(result.forfeitedAmount, 300)
      },
    },
  ])
}
