import { prisma } from "../../lib/prisma";

export type HealthStatus = {
  status: "ok";
  service: "consultorio-app";
  checkedAt: string;
  uptimeSeconds: number;
};

export type ReadinessStatus = {
  status: "ready" | "not-ready";
  service: "consultorio-app";
  checkedAt: string;
  checks: {
    database: "ok" | "error";
  };
};

export async function getHealthStatus(): Promise<HealthStatus> {
  return {
    status: "ok",
    service: "consultorio-app",
    checkedAt: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  };
}

export async function getReadinessStatus(): Promise<ReadinessStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: "ready",
      service: "consultorio-app",
      checkedAt: new Date().toISOString(),
      checks: {
        database: "ok"
      }
    };
  } catch {
    return {
      status: "not-ready",
      service: "consultorio-app",
      checkedAt: new Date().toISOString(),
      checks: {
        database: "error"
      }
    };
  }
}
