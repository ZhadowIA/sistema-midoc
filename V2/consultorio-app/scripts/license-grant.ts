// Otorga una licencia de piloto a una cuenta de medico existente (paso 29), para
// desarrollo y piloto mientras no exista la compra en linea (paso 17).
// Uso: npm run license:grant -- doctor@test.com [equipos]
import { LicenseSource, PrismaClient } from "@prisma/client";

import { grantLicense } from "../src/services/license/license-service";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const maxDevices = process.argv[3] ? Number(process.argv[3]) : undefined;
  if (!email) {
    throw new Error("Uso: npm run license:grant -- <correo> [equipos]");
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    throw new Error(`No existe la cuenta ${email}.`);
  }
  const license = await grantLicense({
    actorUserId: null,
    doctorUserId: user.id,
    source: LicenseSource.PILOT,
    maxDevices
  });
  console.log(
    `Licencia ${license.id} otorgada a ${email}: ${license.maxDevices} equipos, actualizaciones hasta ${license.updatesUntil.toISOString().slice(0, 10)}.`
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
