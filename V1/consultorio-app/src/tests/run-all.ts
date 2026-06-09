import { spawn } from 'node:child_process'

function runNodeScript(label: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    console.log(`\n${label}`)
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      shell: false,
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${label} failed with exit code ${code ?? 'unknown'}`))
    })
  })
}

async function main() {
  await runNodeScript('Unit test suite', ['--import', 'tsx', 'src/tests/run-unit.ts'])
  await runNodeScript('Integration test suite', ['--env-file-if-exists=.env', '--import', 'tsx', 'src/tests/run-integration.ts'])
  console.log('\nAll test suites completed successfully.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\nTests failed: ${message}`)
  process.exitCode = 1
})
