import { NextRequest, NextResponse } from 'next/server'
import { QuestionnaireService } from '@/services/QuestionnaireService'
import { transcribeAudio, generateQuestionnaireFollowUp } from '@/lib/aiNoteService'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'
import { z } from 'zod'

const interviewSchema = z.object({
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(2000)
  })).max(20).default([]),
  textAnswer: z.string().trim().max(2000).optional(),
})

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ token: string }> }
) {
  const params = await props.params
  try {
    const token = params.token
    const appointment = await QuestionnaireService.validateTokenContext(token)
    if (!appointment) return NextResponse.json({ error: 'Token inválido o cita no encontrada' }, { status: 404 })
    if (appointment.questionnaireAnswered) return NextResponse.json({ error: 'Cuestionario ya respondido' }, { status: 400 })

    const rateLimit = checkRateLimit(req, {
      key: `public:ai-interview:${token.slice(0, 12)}`,
      limit: 15,
      windowMs: 5 * 60_000,
    })
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit)

    const contentType = req.headers.get('content-type') || ''
    let transcript = ''
    let history: Array<{ role: 'user' | 'assistant'; content: string }> = []

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const audioBlob = formData.get('audio') as Blob | null
      const historyRaw = formData.get('history') as string | null
      
      if (historyRaw) {
        history = JSON.parse(historyRaw)
      }

      if (audioBlob) {
        if (audioBlob.size > MAX_AUDIO_BYTES) {
          return NextResponse.json({ error: 'Audio demasiado grande' }, { status: 413 })
        }
        const buffer = Buffer.from(await audioBlob.arrayBuffer())
        transcript = await transcribeAudio({
          audioBuffer: buffer,
          mimeType: audioBlob.type || 'audio/webm',
        })
      }
    } else {
      const body = await req.json()
      const parsed = interviewSchema.parse(body)
      transcript = parsed.textAnswer || ''
      history = parsed.history
    }

    if (!transcript.trim()) {
      return NextResponse.json({ error: 'No se recibió entrada del paciente' }, { status: 400 })
    }

    const aiResponse = await generateQuestionnaireFollowUp({
      transcript,
      history
    })

    return NextResponse.json({
      transcript,
      ...aiResponse
    })

  } catch (error: unknown) {
    console.error('AI Interview Error:', error)
    return NextResponse.json({ error: 'Error al procesar la entrevista con IA' }, { status: 500 })
  }
}
