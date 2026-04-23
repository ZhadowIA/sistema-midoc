import { runDateTimeUnitTests } from './unit/dateTime.test.ts'
import { runRateLimitUnitTests } from './unit/rateLimit.test.ts'
import { runClinicalFormatUnitTests } from './unit/clinicalFormat.test.ts'
import { runSignoffSummaryUnitTests } from './unit/signoffSummary.test.ts'
import { runConsultationWorkspaceUnitTests } from './unit/consultationWorkspace.test.ts'
import { runPatientNameUnitTests } from './unit/patientName.test.ts'
import { runRecaptchaUnitTests } from './unit/recaptcha.test.ts'
import { runAiNoteGenerationServiceUnitTests } from './unit/aiNoteGenerationService.test.ts'
import { runAiInsightsUnitTests } from './unit/aiInsights.test.ts'
import { runPharmacovigilanceDedupeUnitTests } from './unit/pharmacovigilanceDedupe.test.ts'
import { runFeatureFlagsUnitTests } from './unit/featureFlags.test.ts'
import { runDepositPolicyUnitTests } from './unit/depositPolicy.test.ts'
import { runClinicalEncounterContractsUnitTests } from './unit/clinicalEncounterContracts.test.ts'
import { runProductAccessFeaturesUnitTests } from './unit/productAccessFeatures.test.ts'
import { runSubscriptionCatalogUnitTests } from './unit/subscriptionCatalog.test.ts'
import { runBookingFlowUnitTests } from './unit/bookingFlow.test.ts'
import { runCapabilitiesUnitTests } from './unit/capabilities.test.ts'

async function main() {
  await runDateTimeUnitTests()
  await runRateLimitUnitTests()
  await runClinicalFormatUnitTests()
  await runSignoffSummaryUnitTests()
  await runConsultationWorkspaceUnitTests()
  await runPatientNameUnitTests()
  await runRecaptchaUnitTests()
  await runAiNoteGenerationServiceUnitTests()
  await runAiInsightsUnitTests()
  await runPharmacovigilanceDedupeUnitTests()
  await runFeatureFlagsUnitTests()
  await runDepositPolicyUnitTests()
  await runClinicalEncounterContractsUnitTests()
  await runProductAccessFeaturesUnitTests()
  await runSubscriptionCatalogUnitTests()
  await runBookingFlowUnitTests()
  await runCapabilitiesUnitTests()
  console.log('\nUnit tests completed successfully.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\nUnit tests failed: ${message}`)
  process.exitCode = 1
})
