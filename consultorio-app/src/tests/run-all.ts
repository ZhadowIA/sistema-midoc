import { runDateTimeUnitTests } from './unit/dateTime.test.ts'
import { runRateLimitUnitTests } from './unit/rateLimit.test.ts'
import { runBookingFlowUnitTests } from './unit/bookingFlow.test.ts'
import { runPublicContractsIntegrationTests } from './integration/publicApiContracts.test.ts'

async function main() {
  await runDateTimeUnitTests()
  await runRateLimitUnitTests()
  await runBookingFlowUnitTests()
  await runPublicContractsIntegrationTests()
  console.log('\nAll tests completed successfully.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\nTests failed: ${message}`)
  process.exitCode = 1
})
