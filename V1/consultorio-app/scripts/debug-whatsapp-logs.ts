import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Últimos 10 mensajes de WhatsApp ---')
  const logs = await prisma.whatsAppMessageLog.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      appointment: {
        select: {
          id: true,
          status: true,
          startTime: true
        }
      }
    }
  })

  logs.forEach(log => {
    console.log(`[${log.createdAt.toISOString()}] ${log.direction} | Tel: ${log.phone} | Intent: ${log.intent} | Action: ${log.action}`)
    console.log(`   Msj: "${log.message}"`)
    if (log.appointment) {
      console.log(`   Cita: ${log.appointment.id} | Status: ${log.appointment.status} | Inicio: ${log.appointment.startTime}`)
    } else {
      console.log('   Cita: NO VINCULADA')
    }
    console.log('---')
  })
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())
