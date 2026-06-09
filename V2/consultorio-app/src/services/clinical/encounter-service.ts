import {
  AppointmentStatus,
  EncounterSource,
  EncounterStatus,
  InstructionStatus,
  NoteStatus,
  NoteType,
  PrescriptionStatus,
  Prisma
} from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";

class EncounterServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

type JsonObject = Record<string, unknown>;

function asJsonValue(input: JsonObject | undefined) {
  return (input ?? {}) as Prisma.InputJsonValue;
}

function asJsonSection(text: string | undefined) {
  return ({ text: text?.trim() ?? "" }) as Prisma.InputJsonValue;
}

async function getDoctorAppointmentOrThrow(doctorUserId: string, appointmentId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctorUserId
    },
    include: {
      patient: true,
      service: true,
      encounter: true,
      precheckins: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  if (!appointment) {
    throw new EncounterServiceError("Appointment not found.", 404);
  }

  return appointment;
}

async function getEncounterOrThrow(doctorUserId: string, encounterId: string) {
  const encounter = await prisma.encounter.findFirst({
    where: {
      id: encounterId,
      doctorId: doctorUserId
    }
  });

  if (!encounter) {
    throw new EncounterServiceError("Encounter not found.", 404);
  }

  return encounter;
}

async function createNoteVersion(input: {
  clinicalNoteId: string;
  versionNumber: number;
  status: NoteStatus;
  content: JsonObject;
  createdByUserId: string;
  changeReason?: string;
}) {
  return prisma.clinicalNoteVersion.create({
    data: {
      clinicalNoteId: input.clinicalNoteId,
      versionNumber: input.versionNumber,
      status: input.status,
      content: input.content as Prisma.InputJsonValue,
      createdByUserId: input.createdByUserId,
      changeReason: input.changeReason?.trim()
    }
  });
}

export async function openEncounterFromAppointment(input: {
  doctorUserId: string;
  appointmentId: string;
}) {
  const appointment = await getDoctorAppointmentOrThrow(input.doctorUserId, input.appointmentId);

  if (appointment.encounter) {
    const workspace = await getEncounterWorkspaceByAppointment({
      doctorUserId: input.doctorUserId,
      appointmentId: input.appointmentId
    });

    if (!workspace) {
      throw new EncounterServiceError("Encounter workspace could not be loaded.", 500);
    }

    return workspace;
  }

  const clinicalRecord = await prisma.clinicalRecord.upsert({
    where: {
      doctorId_patientId: {
        doctorId: input.doctorUserId,
        patientId: appointment.patientId
      }
    },
    update: {},
    create: {
      doctorId: input.doctorUserId,
      patientId: appointment.patientId,
      summary: {},
      alerts: {}
    }
  });

  const encounter = await prisma.encounter.create({
    data: {
      doctorId: input.doctorUserId,
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      clinicalRecordId: clinicalRecord.id,
      status: EncounterStatus.OPEN,
      source: EncounterSource.APPOINTMENT,
      chiefComplaint: appointment.reason
    }
  });

  const note = await prisma.clinicalNote.create({
    data: {
      encounterId: encounter.id,
      noteType: NoteType.SOAP,
      status: NoteStatus.DRAFT,
      currentVersion: 1,
      subjective: {},
      objective: {},
      assessment: {},
      plan: {}
    }
  });

  await createNoteVersion({
    clinicalNoteId: note.id,
    versionNumber: 1,
    status: NoteStatus.DRAFT,
    createdByUserId: input.doctorUserId,
    content: {
      subjective: {},
      objective: {},
      assessment: {},
      plan: {}
    },
    changeReason: "Initial note scaffold created from appointment."
  });

  await prisma.precheckinSubmission.updateMany({
    where: {
      appointmentId: appointment.id,
      patientId: appointment.patientId
    },
    data: {
      encounterId: encounter.id
    }
  });

  await writeAuditLog({
    actorUserId: input.doctorUserId,
    entityType: "Encounter",
    entityId: encounter.id,
    action: "clinical-encounter.opened",
    source: "encounter-service",
    metadata: {
      appointmentId: appointment.id
    }
  });

  return {
    encounter,
    appointment,
    clinicalRecord,
    clinicalNote: note,
    precheckin: appointment.precheckins[0] ?? null,
    prescription: null,
    instructions: []
  };
}

export async function getEncounterWorkspaceByAppointment(input: {
  doctorUserId: string;
  appointmentId: string;
}) {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: input.appointmentId,
      doctorId: input.doctorUserId
    },
    include: {
      patient: true,
      service: true,
      encounter: {
        include: {
          clinicalRecord: true,
          clinicalNote: {
            include: {
              versions: {
                orderBy: {
                  versionNumber: "desc"
                }
              }
            }
          },
          prescriptions: {
            include: {
              items: true
            },
            orderBy: {
              createdAt: "desc"
            }
          },
          patientInstructions: {
            orderBy: {
              createdAt: "asc"
            }
          },
          precheckinSubmissions: {
            orderBy: {
              createdAt: "desc"
            }
          }
        }
      },
      precheckins: {
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!appointment) {
    throw new EncounterServiceError("Appointment not found.", 404);
  }

  if (!appointment.encounter) {
    return null;
  }

  return {
    appointment,
    encounter: appointment.encounter,
    patient: appointment.patient,
    service: appointment.service,
    clinicalRecord: appointment.encounter.clinicalRecord,
    clinicalNote: appointment.encounter.clinicalNote,
    prescription: appointment.encounter.prescriptions[0] ?? null,
    instructions: appointment.encounter.patientInstructions,
    precheckin:
      appointment.encounter.precheckinSubmissions[0] ?? appointment.precheckins[0] ?? null
  };
}

export async function saveEncounterWorkspace(input: {
  doctorUserId: string;
  encounterId: string;
  clinicalRecord: {
    summary?: JsonObject;
    alerts?: JsonObject;
  };
  note: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  prescription?: {
    diagnosis?: string;
    notes?: string;
    items: Array<{
      medicationName: string;
      dosage?: string;
      route?: string;
      frequency?: string;
      duration?: string;
      quantity?: string;
      instructions?: string;
    }>;
  };
  instructions?: Array<{
    title: string;
    body: string;
  }>;
}) {
  const encounter = await getEncounterOrThrow(input.doctorUserId, input.encounterId);

  const workspace = await prisma.encounter.findUniqueOrThrow({
    where: {
      id: encounter.id
    },
    include: {
      clinicalRecord: true,
      clinicalNote: true,
      prescriptions: {
        include: {
          items: true
        },
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!workspace.clinicalNote) {
    throw new EncounterServiceError("Clinical note not found for encounter.", 404);
  }

  await prisma.clinicalRecord.update({
    where: {
      id: workspace.clinicalRecord.id
    },
    data: {
      summary: input.clinicalRecord.summary ? asJsonValue(input.clinicalRecord.summary) : undefined,
      alerts: input.clinicalRecord.alerts ? asJsonValue(input.clinicalRecord.alerts) : undefined
    }
  });

  const nextVersion = workspace.clinicalNote.currentVersion + 1;
  const noteContent = {
    subjective: { text: input.note.subjective.trim() },
    objective: { text: input.note.objective.trim() },
    assessment: { text: input.note.assessment.trim() },
    plan: { text: input.note.plan.trim() }
  };

  await prisma.clinicalNote.update({
    where: {
      id: workspace.clinicalNote.id
    },
    data: {
      status: NoteStatus.DRAFT,
      subjective: asJsonSection(input.note.subjective),
      objective: asJsonSection(input.note.objective),
      assessment: asJsonSection(input.note.assessment),
      plan: asJsonSection(input.note.plan),
      currentVersion: nextVersion
    }
  });

  await createNoteVersion({
    clinicalNoteId: workspace.clinicalNote.id,
    versionNumber: nextVersion,
    status: NoteStatus.DRAFT,
    createdByUserId: input.doctorUserId,
    content: noteContent,
    changeReason: "Clinical workspace saved."
  });

  if (input.prescription) {
    const existingPrescription = workspace.prescriptions[0];

    const prescription =
      existingPrescription
        ? await prisma.prescription.update({
            where: {
              id: existingPrescription.id
            },
            data: {
              diagnosis: input.prescription.diagnosis?.trim(),
              notes: input.prescription.notes?.trim(),
              status: PrescriptionStatus.DRAFT
            }
          })
        : await prisma.prescription.create({
            data: {
              encounterId: encounter.id,
              doctorId: input.doctorUserId,
              patientId: encounter.patientId,
              diagnosis: input.prescription.diagnosis?.trim(),
              notes: input.prescription.notes?.trim(),
              status: PrescriptionStatus.DRAFT
            }
          });

    await prisma.prescriptionItem.deleteMany({
      where: {
        prescriptionId: prescription.id
      }
    });

    if (input.prescription.items.length > 0) {
      await prisma.prescriptionItem.createMany({
        data: input.prescription.items.map((item) => ({
          prescriptionId: prescription.id,
          medicationName: item.medicationName.trim(),
          dosage: item.dosage?.trim(),
          route: item.route?.trim(),
          frequency: item.frequency?.trim(),
          duration: item.duration?.trim(),
          quantity: item.quantity?.trim(),
          instructions: item.instructions?.trim()
        }))
      });
    }
  }

  if (input.instructions) {
    await prisma.patientInstruction.deleteMany({
      where: {
        encounterId: encounter.id
      }
    });

    if (input.instructions.length > 0) {
      await prisma.patientInstruction.createMany({
        data: input.instructions.map((instruction) => ({
          encounterId: encounter.id,
          title: instruction.title.trim(),
          body: instruction.body.trim(),
          status: InstructionStatus.DRAFT
        }))
      });
    }
  }

  await writeAuditLog({
    actorUserId: input.doctorUserId,
    entityType: "Encounter",
    entityId: encounter.id,
    action: "clinical-encounter.saved",
    source: "encounter-service"
  });
}

export async function closeEncounter(input: {
  doctorUserId: string;
  encounterId: string;
  closingSummary?: string;
}) {
  const encounter = await getEncounterOrThrow(input.doctorUserId, input.encounterId);

  const workspace = await prisma.encounter.findUniqueOrThrow({
    where: {
      id: encounter.id
    },
    include: {
      clinicalRecord: true,
      clinicalNote: true,
      prescriptions: true
    }
  });

  if (!workspace.clinicalNote) {
    throw new EncounterServiceError("Clinical note not found for encounter.", 404);
  }

  const signedAt = new Date();
  const finalVersion = workspace.clinicalNote.currentVersion + 1;
  const finalContent = {
    subjective: workspace.clinicalNote.subjective ?? {},
    objective: workspace.clinicalNote.objective ?? {},
    assessment: workspace.clinicalNote.assessment ?? {},
    plan: workspace.clinicalNote.plan ?? {},
    closingSummary: input.closingSummary?.trim() ?? ""
  };

  await prisma.$transaction([
    prisma.clinicalRecord.update({
      where: {
        id: workspace.clinicalRecord.id
      },
      data: {
        lastEncounterAt: signedAt
      }
    }),
    prisma.encounter.update({
      where: {
        id: encounter.id
      },
      data: {
        status: EncounterStatus.CLOSED,
        closedAt: signedAt
      }
    }),
    prisma.clinicalNote.update({
      where: {
        id: workspace.clinicalNote.id
      },
      data: {
        status: NoteStatus.SIGNED,
        signedByDoctorId: input.doctorUserId,
        signedAt,
        closedAt: signedAt,
        currentVersion: finalVersion
      }
    }),
    ...(workspace.appointmentId
      ? [
          prisma.appointment.update({
            where: {
              id: workspace.appointmentId
            },
            data: {
              status: AppointmentStatus.COMPLETED
            }
          })
        ]
      : []),
    ...workspace.prescriptions.map((prescription) =>
      prisma.prescription.update({
        where: {
          id: prescription.id
        },
        data: {
          status: PrescriptionStatus.ISSUED,
          issuedAt: signedAt
        }
      })
    )
  ]);

  await createNoteVersion({
    clinicalNoteId: workspace.clinicalNote.id,
    versionNumber: finalVersion,
    status: NoteStatus.SIGNED,
    createdByUserId: input.doctorUserId,
    content: finalContent,
    changeReason: "Clinical note signed and encounter closed."
  });

  await writeAuditLog({
    actorUserId: input.doctorUserId,
    entityType: "Encounter",
    entityId: encounter.id,
    action: "clinical-encounter.closed",
    source: "encounter-service",
    metadata: {
      signedAt
    }
  });
}
