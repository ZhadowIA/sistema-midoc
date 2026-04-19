import { runDateTimeUnitTests } from './unit/dateTime.test.ts'
import { runRateLimitUnitTests } from './unit/rateLimit.test.ts'
import { runClinicalFormatUnitTests } from './unit/clinicalFormat.test.ts'
import { runSignoffSummaryUnitTests } from './unit/signoffSummary.test.ts'
import { runConsultationWorkspaceUnitTests } from './unit/consultationWorkspace.test.ts'
import { runPatientNameUnitTests } from './unit/patientName.test.ts'
import { runRecaptchaUnitTests } from './unit/recaptcha.test.ts'

async function main() {
  await runDateTimeUnitTests()
  await runRateLimitUnitTests()
  await runClinicalFormatUnitTests()
  await runSignoffSummaryUnitTests()
  await runConsultationWorkspaceUnitTests()
  await runPatientNameUnitTests()
  await runRecaptchaUnitTests()
  console.log('\nUnit tests completed successfully.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\nUnit tests failed: ${message}`)
  process.exitCode = 1
})
