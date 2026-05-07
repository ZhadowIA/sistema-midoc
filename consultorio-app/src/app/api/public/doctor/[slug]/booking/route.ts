import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { name, email, phone, reason, date, startTime, endTime } = body;

    if (!name || !email || !phone || !date || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Find doctor
    const doctor = await prisma.user.findUnique({
      where: { slug },
      select: { id: true, phone: true, doctorConfig: { select: { consultationDurationMin: true } } },
    });

    if (!doctor) {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
    }

    // Find or create patient
    let patient = await prisma.patient.findFirst({
      where: { phone, ownerDoctorId: doctor.id },
    });

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          firstName: name.split(" ")[0],
          lastNamePaternal: name.split(" ").slice(1).join(" "),
          phone,
          email,
          ownerDoctorId: doctor.id,
        },
      });
    }

    // Create appointment
    const startDateTime = new Date(`${date}T${startTime}`);
    const endDateTime = new Date(`${date}T${endTime}`);
    const durationMin = doctor.doctorConfig?.consultationDurationMin || 30;

    const appointment = await prisma.appointment.create({
      data: {
        doctorId: doctor.id,
        patientId: patient.id,
        date: new Date(date),
        startTime: startDateTime,
        endTime: endDateTime,
        durationMin,
        appointmentType: "NORMAL",
        source: "PATIENT",
        status: "PENDING",
        notes: reason || null,
      },
    });

    // Send WhatsApp notification
    if (doctor.phone) {
      try {
        await fetch(
          process.env.WHATSAPP_API_URL || "",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-WhatsApp-Secret": process.env.WHATSAPP_WEBHOOK_SECRET || "",
            },
            body: JSON.stringify({
              to: patient.phone,
              message: `Hola ${name}, tu cita ha sido agendada para el ${date} a las ${startTime}. Responde para confirmar.`,
            }),
          }
        );
      } catch (error) {
        console.error("Error sending WhatsApp:", error);
      }
    }

    return NextResponse.json({
      appointmentId: appointment.id,
      status: "PENDING",
      message: "Cita agendada exitosamente. Revisa tu WhatsApp para confirmar.",
    });
  } catch (error) {
    console.error("Error creating appointment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
