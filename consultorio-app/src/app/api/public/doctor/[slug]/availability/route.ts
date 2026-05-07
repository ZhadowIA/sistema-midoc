import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "Missing from or to parameters" },
        { status: 400 }
      );
    }

    const doctor = await prisma.user.findUnique({
      where: { slug },
      select: {
        id: true,
        doctorConfig: { select: { consultationDurationMin: true } },
      },
    });

    if (!doctor) {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
    }

    const durationMin = doctor.doctorConfig?.consultationDurationMin || 30;
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59);

    const availabilityBlocks = await prisma.availabilityBlock.findMany({
      where: {
        doctorId: doctor.id,
        date: { gte: fromDate, lte: toDate },
        isPublic: true,
        active: true,
      },
    });

    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId: doctor.id,
        startTime: { gte: fromDate, lte: toDate },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      select: { startTime: true, endTime: true },
    });

    const scheduleByDay = availabilityBlocks.reduce(
      (acc, block) => {
        const dateStr = block.date.toISOString().split("T")[0];
        if (!acc[dateStr]) acc[dateStr] = [];

        const slots = generateSlots(block.startTime, block.endTime, durationMin);
        const availableSlots = slots.filter((slot) => {
          return !appointments.some(
            (apt) =>
              apt.startTime >= new Date(slot.start) &&
              apt.startTime < new Date(slot.end)
          );
        });

        acc[dateStr].push(
          ...availableSlots.map((slot) => ({
            startTime: slot.startTime,
            endTime: slot.endTime,
            isAvailable: true,
          }))
        );

        return acc;
      },
      {} as Record<string, any[]>
    );

    const response = Array.from(
      {
        length: Math.ceil(
          (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)
        ),
      },
      (_, i) => {
        const date = new Date(fromDate);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];
        return {
          date: dateStr,
          slots: scheduleByDay[dateStr] || [],
        };
      }
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching availability:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function generateSlots(
  startTime: Date,
  endTime: Date,
  durationMin: number
): Array<{
  start: string;
  end: string;
  startTime: string;
  endTime: string;
}> {
  const slots = [];
  let current = new Date(startTime);

  while (current < endTime) {
    const slotEnd = new Date(current.getTime() + durationMin * 60 * 1000);
    if (slotEnd <= endTime) {
      slots.push({
        start: current.toISOString(),
        end: slotEnd.toISOString(),
        startTime: current.toTimeString().slice(0, 5),
        endTime: slotEnd.toTimeString().slice(0, 5),
      });
    }
    current = slotEnd;
  }

  return slots;
}
