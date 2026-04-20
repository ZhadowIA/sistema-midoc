import type { ConsultationMode } from '@/components/clinical/ConsultationModeSelector'

type ConsentState = 'PENDING' | 'GRANTED' | 'DENIED'

export type ShortcutAction = 'save' | 'sign' | 'next-section' | 'prev-section' | null

export function resolveWorkspaceShortcut(args: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  canSign: boolean
}): ShortcutAction {
  const mod = args.ctrlKey || args.metaKey
  if (mod && !args.shiftKey && !args.altKey && args.key.toLowerCase() === 's') {
    return 'save'
  }
  if (mod && !args.shiftKey && !args.altKey && args.key === 'Enter') {
    return args.canSign ? 'sign' : null
  }
  if (args.altKey && !args.ctrlKey && !args.metaKey && !args.shiftKey) {
    if (args.key === 'ArrowDown') return 'next-section'
    if (args.key === 'ArrowUp') return 'prev-section'
  }
  return null
}

export function resolveConsultationSession(args: {
  isReadOnly: boolean
  existing: {
    consultationMode: ConsultationMode | null
    aiConsent: ConsentState | null
    aiConsentDecidedAt: Date | null
  } | null
  preferredConsultationMode: ConsultationMode | null
}): {
  consultationMode: ConsultationMode
  aiConsent: ConsentState
  aiConsentDecidedAt: Date | null
} {
  if (args.isReadOnly) {
    return {
      consultationMode: 'MANUAL',
      aiConsent: 'PENDING',
      aiConsentDecidedAt: null,
    }
  }
  return {
    consultationMode:
      args.existing?.consultationMode ?? args.preferredConsultationMode ?? 'MANUAL',
    aiConsent: args.existing?.aiConsent ?? 'PENDING',
    aiConsentDecidedAt: args.existing?.aiConsentDecidedAt ?? null,
  }
}

export function shouldSkipSessionQueries(args: {
  appointmentStatus: string | null | undefined
  noteSignedAt: Date | string | null | undefined
}): boolean {
  return args.appointmentStatus === 'COMPLETED' || Boolean(args.noteSignedAt)
}
