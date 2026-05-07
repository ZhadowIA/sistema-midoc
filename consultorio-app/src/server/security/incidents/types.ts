import { z } from 'zod'

export const createSecurityIncidentSchema = z.object({
  severity: z.enum(['P0', 'P1', 'P2', 'P3']),
  category: z.enum([
    'SECURITY_BREACH',
    'DATA_LEAK',
    'UNAUTHORIZED_ACCESS',
    'SERVICE_OUTAGE',
    'DATA_INTEGRITY',
    'VENDOR_INCIDENT',
    'OTHER',
  ]),
  title: z.string().min(3).max(200),
  summary: z.string().min(10).max(4000),
  detectedAt: z.string().datetime(),
  affectedScope: z.unknown().optional(),
  notificationRequired: z.boolean().optional(),
  assignedToUserId: z.string().optional(),
})

export const patchSecurityIncidentSchema = z.object({
  status: z.enum(['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'POST_MORTEM', 'CLOSED']).optional(),
  assignedToUserId: z.string().nullable().optional(),
  containedAt: z.string().datetime().nullable().optional(),
  resolvedAt: z.string().datetime().nullable().optional(),
  correctiveActions: z.string().max(8000).nullable().optional(),
  rootCause: z.string().max(4000).nullable().optional(),
  notificationRequired: z.boolean().optional(),
  notifiedAt: z.string().datetime().nullable().optional(),
  evidenceExportRef: z.string().max(500).nullable().optional(),
})

export type CreateSecurityIncidentInput = z.infer<typeof createSecurityIncidentSchema>
export type PatchSecurityIncidentInput = z.infer<typeof patchSecurityIncidentSchema>

