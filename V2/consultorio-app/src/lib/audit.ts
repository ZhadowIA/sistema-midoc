import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

export async function writeAuditLog(input: {
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  source?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      source: input.source,
      metadata: input.metadata
    }
  });
}
