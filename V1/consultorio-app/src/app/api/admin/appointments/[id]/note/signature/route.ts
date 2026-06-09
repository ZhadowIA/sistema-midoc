import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { hashSnapshot } from '@/lib/clinicalSignature'

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, doctorId },
      select: { id: true },
    })
    if (!appointment) return jsonNoStore({ error: 'Cita no encontrada' }, { status: 404 })

    const note = await prisma.clinicalNote.findUnique({
      where: { appointmentId: params.id },
      select: {
        id: true,
        signatureHash: true,
        signedAt: true,
        signedByUserId: true,
        signedSnapshot: true,
        signedBy: { select: { id: true, name: true, email: true } },
      },
    })
    if (!note || !note.signatureHash || !note.signedSnapshot) {
      return jsonNoStore({ signed: false }, { status: 200 })
    }

    const recomputed = hashSnapshot(note.signedSnapshot)
    const valid = recomputed === note.signatureHash

    return jsonNoStore({
      signed: true,
      valid,
      signatureHash: note.signatureHash,
      recomputedHash: recomputed,
      signedAt: note.signedAt,
      signedBy: note.signedBy,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
