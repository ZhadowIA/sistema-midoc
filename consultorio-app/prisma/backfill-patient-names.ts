/**
 * Backfill de Patient.fullName hacia firstName / lastNamePaternal / lastNameMaternal.
 *
 * Se corre una sola vez tras la migración 20260419120000_fase0_structured_patient_and_multitenant.
 * Idempotente: sólo actualiza registros donde firstName IS NULL.
 *
 * Uso:  tsx prisma/backfill-patient-names.ts
 */
import { PrismaClient } from '@prisma/client'
import { parseFullName } from '../src/lib/patientName.ts'

const prisma = new PrismaClient()

async function main() {
  const pending = await prisma.patient.findMany({
    where: { firstName: null },
    select: { id: true, fullName: true },
  })

  console.log(`Pacientes a procesar: ${pending.length}`)

  let updated = 0
  const ambiguous: Array<{ id: string; fullName: string }> = []

  for (const patient of pending) {
    const parsed = parseFullName(patient.fullName ?? '')

    if (!parsed.firstName) {
      ambiguous.push({ id: patient.id, fullName: patient.fullName })
      continue
    }

    await prisma.patient.update({
      where: { id: patient.id },
      data: {
        firstName: parsed.firstName,
        lastNamePaternal: parsed.lastNamePaternal || parsed.firstName,
        lastNameMaternal: parsed.lastNameMaternal,
      },
    })
    updated += 1
  }

  console.log(`Actualizados: ${updated}`)
  if (ambiguous.length > 0) {
    console.log(`Ambiguos (fullName vacío, requieren revisión manual):`)
    for (const row of ambiguous) {
      console.log(`  - ${row.id}  "${row.fullName}"`)
    }
  }
}

main()
  .catch((error) => {
    console.error('Backfill falló:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
