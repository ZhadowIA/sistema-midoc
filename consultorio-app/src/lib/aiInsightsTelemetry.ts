import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { AIInsightAction, AIInsightKind } from "@/lib/aiInsightsTypes";

export type AIInsightFeedbackInput = {
  doctorId: string;
  appointmentId: string;
  aiInsightId?: string | null;
  kind: AIInsightKind;
  action: AIInsightAction;
  originalText: string;
  editedText?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function recordInsightFeedback(input: AIInsightFeedbackInput) {
  return prisma.aIInsightFeedback.create({
    data: {
      doctorId: input.doctorId,
      appointmentId: input.appointmentId,
      aiInsightId: input.aiInsightId ?? null,
      kind: input.kind,
      action: input.action,
      originalText: input.originalText,
      editedText: input.editedText ?? null,
      metadata: input.metadata,
    },
  });
}
