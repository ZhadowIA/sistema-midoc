import { runDateTimeUnitTests } from './unit/dateTime.test.ts'
import { runRateLimitUnitTests } from './unit/rateLimit.test.ts'
import { runAuthLockoutUnitTests } from './unit/authLockout.test.ts'
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
import { runPermissionsUnitTests } from './unit/permissions.test.ts'
import { runAiTelemetryUnitTests } from './unit/aiTelemetry.test.ts'
import { runClinicalGapsUnitTests } from './unit/clinicalGaps.test.ts'
import { runAiGovernanceUnitTests } from './unit/aiGovernance.test.ts'
import { runLongitudinalSummaryUnitTests } from './unit/longitudinalSummary.test.ts'
import { runAiUsageLimitsUnitTests } from './unit/aiUsageLimits.test.ts'
import { runDeepgramCredentialsUnitTests } from './unit/deepgramCredentials.test.ts'
import { runDentalPayloadUnitTests } from './unit/dentalPayload.test.ts'
import { runStripeCatalogUnitTests } from './unit/stripeCatalog.test.ts'
import { runInternalAdminCommercialUnitTests } from './unit/internalAdminCommercial.test.ts'
import { runCommercialAccessUnitTests } from './unit/commercialAccess.test.ts'
import { runTwoFactorUnitTests } from './unit/twoFactor.test.ts'

async function main() {
  await runDateTimeUnitTests()
  await runRateLimitUnitTests()
  await runAuthLockoutUnitTests()
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
  await runPermissionsUnitTests()
  await runAiTelemetryUnitTests()
  await runAiUsageLimitsUnitTests()
  await runDeepgramCredentialsUnitTests()
  await runDentalPayloadUnitTests()
  await runStripeCatalogUnitTests()
  await runInternalAdminCommercialUnitTests()
  await runCommercialAccessUnitTests()
  await runTwoFactorUnitTests()
  await runClinicalGapsUnitTests()
  await runAiGovernanceUnitTests()
  await runLongitudinalSummaryUnitTests()
  console.log('\nUnit tests completed successfully.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\nUnit tests failed: ${message}`)
  process.exitCode = 1
})
