import { NextResponse } from "next/server";
import { z } from "zod";

import { requireDoctorUser } from "../../../../../lib/auth/session-user";
import { saveEncounterWorkspace } from "../../../../../services/clinical/encounter-service";

const encounterSaveSchema = z.object({
  clinicalRecord: z.object({
    summary: z.record(z.string(), z.unknown()).optional(),
    alerts: z.record(z.string(), z.unknown()).optional()
  }),
  note: z.object({
    subjective: z.string(),
    objective: z.string(),
    assessment: z.string(),
    plan: z.string()
  }),
  prescription: z
    .object({
      diagnosis: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(
        z.object({
          medicationName: z.string().min(1),
          dosage: z.string().optional(),
          route: z.string().optional(),
          frequency: z.string().optional(),
          duration: z.string().optional(),
          quantity: z.string().optional(),
          instructions: z.string().optional()
        })
      )
    })
    .optional(),
  instructions: z
    .array(
      z.object({
        title: z.string().min(1),
        body: z.string().min(1)
      })
    )
    .optional()
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ encounterId: string }> }
) {
  try {
    const user = await requireDoctorUser(request);
    const { encounterId } = await context.params;
    const payload = encounterSaveSchema.parse(await request.json());

    await saveEncounterWorkspace({
      doctorUserId: user.id,
      encounterId,
      clinicalRecord: payload.clinicalRecord,
      note: payload.note,
      prescription: payload.prescription,
      instructions: payload.instructions
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to save encounter."
      },
      { status }
    );
  }
}
