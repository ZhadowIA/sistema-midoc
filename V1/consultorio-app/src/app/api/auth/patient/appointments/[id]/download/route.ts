import { NextResponse } from 'next/server'
import { format } from 'date-fns'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { formatPatientName } from '@/lib/patientName'

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim() || 'No registrado'
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function buildBrandedPdf(fileTitle: string, lines: string[]) {
  const header = `%PDF-1.4\n`
  const objects: string[] = []
  const addObject = (content: string) => {
    objects.push(content)
    return objects.length
  }

  const drawCommands: string[] = []
  drawCommands.push('BT')
  drawCommands.push('/F1 11 Tf')
  drawCommands.push('1 0 0 1 50 792 Tm')
  drawCommands.push(`(${escapePdfText('MiDoc - Resumen de consulta')}) Tj`)
  drawCommands.push('ET')
  drawCommands.push('0.75 w')
  drawCommands.push('50 786 m 545 786 l S')
  drawCommands.push('BT')
  drawCommands.push('/F1 10 Tf')
  drawCommands.push('1 0 0 1 50 770 Tm')
  drawCommands.push(`(${escapePdfText(fileTitle)}) Tj`)
  drawCommands.push('ET')

  let y = 748
  for (const line of lines) {
    if (y < 60) break
    drawCommands.push('BT')
    drawCommands.push('/F1 9 Tf')
    drawCommands.push(`1 0 0 1 50 ${y} Tm`)
    drawCommands.push(`(${escapePdfText(line)}) Tj`)
    drawCommands.push('ET')
    y -= 14
  }

  const stream = drawCommands.join('\n')
  const streamObj = addObject(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`)
  const fontObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const pageObj = addObject(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${streamObj} 0 R >>`
  )
  addObject(`<< /Type /Pages /Kids [${pageObj} 0 R] /Count 1 >>`)
  addObject('<< /Type /Catalog /Pages 2 0 R >>')

  let output = header
  const xref: number[] = [0]
  for (let i = 0; i < objects.length; i++) {
    xref.push(Buffer.byteLength(output, 'utf8'))
    output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }

  const xrefPos = Buffer.byteLength(output, 'utf8')
  output += `xref\n0 ${objects.length + 1}\n`
  output += '0000000000 65535 f \n'
  for (let i = 1; i < xref.length; i++) {
    output += `${String(xref[i]).padStart(10, '0')} 00000 n \n`
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`
  return Buffer.from(output, 'utf8')
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser || authUser.role !== 'PATIENT') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: params.id,
        patient: { userId: authUser.id },
      },
      select: {
        id: true,
        startTime: true,
        status: true,
        appointmentType: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastNamePaternal: true,
            lastNameMaternal: true,
          },
        },
        doctor: {
          select: { name: true, specialty: true },
        },
        clinicalNote: {
          select: {
            subjective: true,
            objective: true,
            assessment: true,
            plan: true,
            prescriptions: {
              select: {
                medication: true,
                dosage: true,
                frequency: true,
                duration: true,
                instructions: true,
              },
            },
          },
        },
      },
    })

    if (!appointment) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    const note = appointment.clinicalNote
    if (!note) {
      return NextResponse.json({ error: 'La cita no tiene nota clínica para descargar.' }, { status: 409 })
    }

    const outputFormat = new URL(request.url).searchParams.get('format') === 'txt' ? 'txt' : 'pdf'
    const prescriptionsBlock =
      note.prescriptions.length === 0
        ? 'Sin medicamentos registrados.'
        : note.prescriptions
            .map((p, idx) => {
              return [
                `${idx + 1}. ${normalizeText(p.medication)}`,
                `   Dosis: ${normalizeText(p.dosage)}`,
                `   Frecuencia: ${normalizeText(p.frequency)}`,
                `   Duración: ${normalizeText(p.duration)}`,
                `   Indicaciones: ${normalizeText(p.instructions)}`,
              ].join('\n')
            })
            .join('\n')

    const payloadLines = [
      'RESUMEN DE CONSULTA - MIDOC',
      '=====================================',
      `Folio cita: ${appointment.id}`,
      `Fecha: ${format(appointment.startTime, 'dd/MM/yyyy HH:mm')}`,
      `Estado: ${appointment.status}`,
      `Tipo de consulta: ${appointment.appointmentType}`,
      `Paciente: ${formatPatientName(appointment.patient)}`,
      `Médico: ${appointment.doctor.name}`,
      `Especialidad: ${normalizeText(appointment.doctor.specialty)}`,
      '',
      'SUBJETIVO',
      note.subjective || 'No registrado',
      '',
      'OBJETIVO',
      note.objective || 'No registrado',
      '',
      'ASSESSMENT',
      note.assessment || 'No registrado',
      '',
      'PLAN',
      note.plan || 'No registrado',
      '',
      'RECETA',
      prescriptionsBlock,
      '',
      'Documento generado desde el portal del paciente.',
    ]

    const fileBaseName = `consulta-${format(appointment.startTime, 'yyyyMMdd-HHmm')}`
    if (outputFormat === 'txt') {
      return new Response(payloadLines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileBaseName}.txt"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const pdfBuffer = buildBrandedPdf(
      `Paciente: ${formatPatientName(appointment.patient)} | Fecha: ${format(appointment.startTime, 'dd/MM/yyyy HH:mm')}`,
      payloadLines,
    )

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileBaseName}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

