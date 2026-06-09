import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user || user.role !== "DOCTOR") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const secretaries = await prisma.user.findMany({
      where: {
        bossId: user.id,
        role: "SECRETARY",
      },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(secretaries);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user || user.role !== "DOCTOR") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
    }

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "El correo ya está registrado" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const secretary = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: hashedPassword,
        role: "SECRETARY",
        bossId: user.id,
        active: true,
      },
    });

    return NextResponse.json({
      id: secretary.id,
      name: secretary.name,
      email: secretary.email,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
