import { runPublicContractsIntegrationTests } from './integration/publicApiContracts.test.ts'
import { runClinicalSchemasIntegrationTests } from './integration/clinicalSchemas.test.ts'
import { runClinicalDbIntegrationTests } from './integration/clinicalDb.test.ts'
import { runQuestionnairePrefillIntegrationTests } from './integration/questionnairePrefill.test.ts'
import { runConsultationSessionIntegrationTests } from './integration/consultationSession.test.ts'

async function main() {
  await runPublicContractsIntegrationTests()
  await runClinicalSchemasIntegrationTests()
  await runClinicalDbIntegrationTests()
  await runQuestionnairePrefillIntegrationTests()
  await runConsultationSessionIntegrationTests()
  console.log('\nIntegration tests completed successfully.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\nIntegration tests failed: ${message}`)
  process.exitCode = 1
})
