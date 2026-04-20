import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { getClinicSeatSummary } from "@/lib/clinicSeats";

const inviteDoctorSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  specialty: z.string().trim().optional(),
});

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user || user.role !== "CLINIC_ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const actor = await prisma.user.findUnique({
      where: { id: user.id },
      select: { clinicId: true },
    });
    if (!actor?.clinicId) {
      return NextResponse.json({ error: "CLINIC_ADMIN sin clínica asignada." }, { status: 403 });
    }

    const doctors = await prisma.user.findMany({
      where: {
        clinicId: actor.clinicId,
        role: { in: ["DOCTOR", "CLINIC_ADMIN"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const seats = await getClinicSeatSummary(actor.clinicId);

    return NextResponse.json({ doctors, seats });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user || user.role !== "CLINIC_ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const actor = await prisma.user.findUnique({
      where: { id: user.id },
      select: { clinicId: true },
    });
    if (!actor?.clinicId) {
      return NextResponse.json({ error: "CLINIC_ADMIN sin clínica asignada." }, { status: 403 });
    }

    const parsed = inviteDoctorSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Payload inválido", details: parsed.error.issues }, { status: 400 });
    }

    const input = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "El correo ya está registrado" }, { status: 409 });
    }

    const seatsBefore = await getClinicSeatSummary(actor.clinicId);
    if (seatsBefore.used >= seatsBefore.included) {
      return NextResponse.json(
        {
          error: "Límite de seats alcanzado para la clínica.",
          code: "SEAT_LIMIT_REACHED",
          seats: seatsBefore,
        },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const doctor = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name.trim(),
          email: input.email.toLowerCase().trim(),
          passwordHash,
          role: "DOCTOR",
          specialty: input.specialty?.trim() || "Médico Especialista",
          clinicId: actor.clinicId,
          active: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          clinicId: true,
        },
      });

      await tx.doctorConfig.create({
        data: {
          doctorId: created.id,
          consultationDurationMin: 30,
          extendedConsultationEnabled: false,
          normalConsultationPrice: 500,
        },
      });

      await tx.doctorOnboarding.create({
        data: {
          doctorId: created.id,
          completed: false,
        },
      });

      return created;
    });

    const seatsAfter = await getClinicSeatSummary(actor.clinicId);

    return NextResponse.json(
      {
        success: true,
        doctor,
        seats: seatsAfter,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
