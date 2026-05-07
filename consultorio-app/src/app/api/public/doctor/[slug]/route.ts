import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const doctor = await prisma.user.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        specialty: true,
        bio: true,
        profileImage: true,
        phone: true,
        professionalLicense: true,
        doctorConfig: {
          select: {
            consultationDurationMin: true,
            normalConsultationPrice: true,
            extendedConsultationPrice: true,
          },
        },
        doctorServices: {
          where: { active: true },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!doctor) {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: doctor.id,
      name: doctor.name,
      specialty: doctor.specialty,
      bio: doctor.bio || "",
      profileImage: doctor.profileImage,
      phone: doctor.phone,
      professionalLicense: doctor.professionalLicense,
      consultationDurationMin: doctor.doctorConfig?.consultationDurationMin || 30,
      normalConsultationPrice: doctor.doctorConfig?.normalConsultationPrice,
      extendedConsultationPrice: doctor.doctorConfig?.extendedConsultationPrice,
      services: doctor.doctorServices || [],
    });
  } catch (error) {
    console.error("Error fetching doctor:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
