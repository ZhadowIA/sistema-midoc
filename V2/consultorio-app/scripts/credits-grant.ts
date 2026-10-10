// Abona creditos de IA (recarga, sin caducidad) a una cuenta de medico (paso 29),
// para desarrollo y piloto mientras no exista la compra de recargas (paso 17).
// Uso: npm run credits:grant -- doctor@test.com 50
import { AiCreditGrantKind, PrismaClient } from "@prisma/client";

import { getCreditBalance, grantCredits } from "../src/services/ai/credit-ledger";

const prisma = new PrismaClient();

async function main() {
  const [email, rawCredits] = process.argv.slice(2);
  const credits = Number(rawCredits);
  if (!email || !Number.isInteger(credits)) {
    throw new Error("Uso: npm run credits:grant -- <correo> <creditos>");
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    throw new Error(`No existe la cuenta ${email}.`);
  }
  await grantCredits({ doctorUserId: user.id, kind: AiCreditGrantKind.TOP_UP, credits, note: "Recarga de desarrollo", actorUserId: null });
  console.log(`Saldo de ${email}: ${(await getCreditBalance(user.id)).balance} creditos.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
