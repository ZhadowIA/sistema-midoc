import assert from 'node:assert/strict'
import {
  resolveConsultationSession,
  resolveWorkspaceShortcut,
  shouldSkipSessionQueries,
} from '../../lib/consultationWorkspace.ts'
import { runSuite } from '../testHarness.ts'

export async function runConsultationWorkspaceUnitTests() {
  await runSuite('Unit: consultationWorkspace', [
    {
      name: 'resolveWorkspaceShortcut maps Ctrl+S to save',
      run: () => {
        const action = resolveWorkspaceShortcut({
          key: 's',
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          canSign: false,
        })
        assert.equal(action, 'save')
      },
    },
    {
      name: 'resolveWorkspaceShortcut maps Ctrl+Enter only when canSign',
      run: () => {
        const blocked = resolveWorkspaceShortcut({
          key: 'Enter',
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          canSign: false,
        })
        assert.equal(blocked, null)
        const allowed = resolveWorkspaceShortcut({
          key: 'Enter',
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          canSign: true,
        })
        assert.equal(allowed, 'sign')
      },
    },
    {
      name: 'resolveWorkspaceShortcut maps Alt arrows to section navigation',
      run: () => {
        assert.equal(
          resolveWorkspaceShortcut({
            key: 'ArrowDown',
            ctrlKey: false,
            metaKey: false,
            altKey: true,
            shiftKey: false,
            canSign: true,
          }),
          'next-section',
        )
        assert.equal(
          resolveWorkspaceShortcut({
            key: 'ArrowUp',
            ctrlKey: false,
            metaKey: false,
            altKey: true,
            shiftKey: false,
            canSign: true,
          }),
          'prev-section',
        )
      },
    },
    {
      name: 'resolveConsultationSession in readonly forces MANUAL/PENDING',
      run: () => {
        const session = resolveConsultationSession({
          isReadOnly: true,
          existing: {
            consultationMode: 'HYBRID',
            aiConsent: 'GRANTED',
            aiConsentDecidedAt: new Date('2026-04-18T10:00:00.000Z'),
          },
          preferredConsultationMode: 'AI_DICTATION',
        })
        assert.equal(session.consultationMode, 'MANUAL')
        assert.equal(session.aiConsent, 'PENDING')
        assert.equal(session.aiConsentDecidedAt, null)
      },
    },
    {
      name: 'resolveConsultationSession falls back to doctor preferred mode',
      run: () => {
        const session = resolveConsultationSession({
          isReadOnly: false,
          existing: null,
          preferredConsultationMode: 'HYBRID',
        })
        assert.equal(session.consultationMode, 'HYBRID')
        assert.equal(session.aiConsent, 'PENDING')
      },
    },
    {
      name: 'shouldSkipSessionQueries returns true on completed or signed notes',
      run: () => {
        assert.equal(
          shouldSkipSessionQueries({
            appointmentStatus: 'COMPLETED',
            noteSignedAt: null,
          }),
          true,
        )
        assert.equal(
          shouldSkipSessionQueries({
            appointmentStatus: 'CONFIRMED',
            noteSignedAt: new Date('2026-04-18T10:00:00.000Z'),
          }),
          true,
        )
        assert.equal(
          shouldSkipSessionQueries({
            appointmentStatus: 'CONFIRMED',
            noteSignedAt: null,
          }),
          false,
        )
      },
    },
  ])
}
