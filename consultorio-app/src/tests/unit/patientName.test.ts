import assert from 'node:assert/strict'
import { buildFullName, parseFullName, formatPatientName } from '../../lib/patientName.ts'
import { runSuite } from '../testHarness.ts'

export async function runPatientNameUnitTests() {
  await runSuite('Unit: patientName', [
    {
      name: 'buildFullName joins three parts with spaces',
      run: () => {
        const result = buildFullName({
          firstName: 'Juan',
          lastNamePaternal: 'Pérez',
          lastNameMaternal: 'Gómez',
        })
        assert.equal(result, 'Juan Pérez Gómez')
      },
    },
    {
      name: 'buildFullName omits null maternal lastname',
      run: () => {
        const result = buildFullName({
          firstName: 'María',
          lastNamePaternal: 'López',
          lastNameMaternal: null,
        })
        assert.equal(result, 'María López')
      },
    },
    {
      name: 'buildFullName handles undefined and empty parts without extra spaces',
      run: () => {
        const result = buildFullName({
          firstName: '  Ana  ',
          lastNamePaternal: '',
          lastNameMaternal: undefined,
        })
        assert.equal(result, 'Ana')
      },
    },
    {
      name: 'buildFullName returns empty string when all parts are empty',
      run: () => {
        assert.equal(buildFullName({}), '')
      },
    },
    {
      name: 'parseFullName splits three tokens correctly',
      run: () => {
        const r = parseFullName('Juan Pérez Gómez')
        assert.equal(r.firstName, 'Juan')
        assert.equal(r.lastNamePaternal, 'Pérez')
        assert.equal(r.lastNameMaternal, 'Gómez')
      },
    },
    {
      name: 'parseFullName with two tokens leaves maternal null',
      run: () => {
        const r = parseFullName('María López')
        assert.equal(r.firstName, 'María')
        assert.equal(r.lastNamePaternal, 'López')
        assert.equal(r.lastNameMaternal, null)
      },
    },
    {
      name: 'parseFullName with four tokens treats first two as compound first name',
      run: () => {
        const r = parseFullName('Juan Carlos Pérez Gómez')
        assert.equal(r.firstName, 'Juan Carlos')
        assert.equal(r.lastNamePaternal, 'Pérez')
        assert.equal(r.lastNameMaternal, 'Gómez')
      },
    },
    {
      name: 'parseFullName with five tokens keeps last two as apellidos',
      run: () => {
        const r = parseFullName('María del Carmen López Hernández')
        assert.equal(r.firstName, 'María del Carmen')
        assert.equal(r.lastNamePaternal, 'López')
        assert.equal(r.lastNameMaternal, 'Hernández')
      },
    },
    {
      name: 'parseFullName with one token leaves apellidos empty',
      run: () => {
        const r = parseFullName('Madonna')
        assert.equal(r.firstName, 'Madonna')
        assert.equal(r.lastNamePaternal, '')
        assert.equal(r.lastNameMaternal, null)
      },
    },
    {
      name: 'parseFullName handles empty string without crashing',
      run: () => {
        const r = parseFullName('   ')
        assert.equal(r.firstName, '')
        assert.equal(r.lastNamePaternal, '')
        assert.equal(r.lastNameMaternal, null)
      },
    },
    {
      name: 'parseFullName collapses multiple internal spaces',
      run: () => {
        const r = parseFullName('  Juan   Pérez    Gómez  ')
        assert.equal(r.firstName, 'Juan')
        assert.equal(r.lastNamePaternal, 'Pérez')
        assert.equal(r.lastNameMaternal, 'Gómez')
      },
    },
    {
      name: 'buildFullName(parseFullName(x)) is idempotent for canonical 3-token names',
      run: () => {
        const original = 'Juan Pérez Gómez'
        const parsed = parseFullName(original)
        assert.equal(buildFullName(parsed), original)
      },
    },
    {
      name: 'formatPatientName returns estructurado completo',
      run: () => {
        const r = formatPatientName({
          firstName: 'Juan',
          lastNamePaternal: 'Pérez',
          lastNameMaternal: 'Gómez',
        })
        assert.equal(r, 'Juan Pérez Gómez')
      },
    },
    {
      name: 'formatPatientName omite apellido materno ausente',
      run: () => {
        const r = formatPatientName({
          firstName: 'María',
          lastNamePaternal: 'López',
          lastNameMaternal: null,
        })
        assert.equal(r, 'María López')
      },
    },
    {
      name: 'formatPatientName usa fallback fullName legacy cuando faltan campos estructurados',
      run: () => {
        const r = formatPatientName({
          firstName: '',
          lastNamePaternal: '',
          lastNameMaternal: null,
          fullName: '  Paciente Legacy  ',
        })
        assert.equal(r, 'Paciente Legacy')
      },
    },
  ])
}
