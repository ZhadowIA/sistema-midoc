import { runDateTimeUnitTests } from './unit/dateTime.test.ts'
import { runRateLimitUnitTests } from './unit/rateLimit.test.ts'
import { runClinicalFormatUnitTests } from './unit/clinicalFormat.test.ts'

async function main() {
  await runDateTimeUnitTests()
  await runRateLimitUnitTests()
  await runClinicalFormatUnitTests()
  console.log('\nUnit tests completed successfully.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\nUnit tests failed: ${message}`)
  process.exitCode = 1
})
