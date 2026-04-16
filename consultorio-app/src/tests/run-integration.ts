import { runPublicContractsIntegrationTests } from './integration/publicApiContracts.test.ts'

async function main() {
  await runPublicContractsIntegrationTests()
  console.log('\nIntegration tests completed successfully.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\nIntegration tests failed: ${message}`)
  process.exitCode = 1
})
