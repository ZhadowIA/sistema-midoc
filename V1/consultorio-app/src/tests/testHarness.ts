type TestCase = {
  name: string
  run: () => void | Promise<void>
}

export async function runSuite(suiteName: string, cases: TestCase[]) {
  console.log(`\n${suiteName}`)
  let failures = 0

  for (const testCase of cases) {
    try {
      await testCase.run()
      console.log(`  [PASS] ${testCase.name}`)
    } catch (error: unknown) {
      failures += 1
      const message = error instanceof Error ? error.stack || error.message : String(error)
      console.error(`  [FAIL] ${testCase.name}`)
      console.error(`    ${message}`)
    }
  }

  if (failures > 0) {
    throw new Error(`${suiteName}: ${failures} prueba(s) fallaron.`)
  }
}

