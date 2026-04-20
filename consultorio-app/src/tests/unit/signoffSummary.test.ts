import assert from 'node:assert/strict'
import {
  buildWhatsAppLink,
  buildPatientMessage,
} from '../../components/clinical/signoffSummaryUtils.ts'
import { runSuite } from '../testHarness.ts'

export async function runSignoffSummaryUnitTests() {
  await runSuite('Unit: signoffSummary', [
    {
      name: 'buildWhatsAppLink devuelve URL wa.me con dígitos del teléfono',
      run: () => {
        const link = buildWhatsAppLink('+52 (55) 1234-5678', 'Hola mundo')
        assert.ok(link?.startsWith('https://wa.me/5255'))
        assert.ok(link?.includes('Hola%20mundo'))
      },
    },
    {
      name: 'buildWhatsAppLink devuelve null cuando no hay dígitos',
      run: () => {
        assert.equal(buildWhatsAppLink('', 'x'), null)
        assert.equal(buildWhatsAppLink('---', 'x'), null)
      },
    },
    {
      name: 'buildPatientMessage incluye nombre, fecha y assessment',
      run: () => {
        const msg = buildPatientMessage({
          patientName: 'Ana',
          signedAt: '2026-04-18T12:00:00Z',
          assessmentSummary: 'Cefalea tensional',
        })
        assert.ok(msg.includes('Ana'))
        assert.ok(msg.includes('Cefalea tensional'))
        assert.ok(msg.includes('Impresión clínica'))
      },
    },
    {
      name: 'buildPatientMessage omite bloque de impresión cuando está vacío',
      run: () => {
        const msg = buildPatientMessage({
          patientName: 'Ana',
          signedAt: '2026-04-18T12:00:00Z',
          assessmentSummary: '',
        })
        assert.ok(!msg.includes('Impresión clínica'))
      },
    },
  ])
}
