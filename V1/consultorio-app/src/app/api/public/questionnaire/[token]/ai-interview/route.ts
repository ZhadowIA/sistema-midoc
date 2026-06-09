import { NextRequest, NextResponse } from 'next/server'
import { QuestionnaireService } from '@/services/QuestionnaireService'
import { transcribeAudio, generateQuestionnaireFollowUp } from '@/lib/aiNoteService'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'
import { z } from 'zod'
import { getDoctorProductAccess } from '@/lib/productAccess'
import { SUBSCRIPTION_FEATURES } from '@/lib/subscriptionFeatures'
import { recordAiUsage, resolvePromptVersion } from '@/lib/aiTelemetry'
import { consumeAICredits, validateAICredits } from '@/lib/aiCreditsMiddleware'

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
    const access = await getDoctorProductAccess(appointment.doctorId, 'DOCTOR')
    const aiEnabled = access.features[SUBSCRIPTION_FEATURES.AI_ENABLED] === true
    const hasAiText = aiEnabled && access.features[SUBSCRIPTION_FEATURES.AI_QUESTIONNAIRE_TEXT] === true
    const hasAiAudio = aiEnabled && access.features[SUBSCRIPTION_FEATURES.AI_QUESTIONNAIRE_AUDIO] === true
    const contentTypeEarly = req.headers.get('content-type') || ''
    const isAudioRequest = contentTypeEarly.includes('multipart/form-data')
    if (isAudioRequest ? !hasAiAudio : !hasAiText) {
      return NextResponse.json({ error: 'Entrevista IA no disponible para este consultorio.' }, { status: 403 })
    }
    const creditCheck = await validateAICredits(appointment.doctorId, 'questionnaireFollowUp')
    if (!creditCheck.hasCredits) {
      return NextResponse.json({ error: creditCheck.error }, { status: 402 })
    }

    const rateLimit = await checkRateLimit(req, {
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
        let parsed: unknown
        try {
          parsed = JSON.parse(historyRaw)
        } catch {
          return NextResponse.json({ error: 'Historial inválido' }, { status: 400 })
        }
        const validated = interviewSchema.safeParse({ history: parsed })
        if (!validated.success) {
          return NextResponse.json({ error: 'Historial inválido', details: validated.error.issues }, { status: 400 })
        }
        history = validated.data.history
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

    const t0 = Date.now()
    const aiResponse = await generateQuestionnaireFollowUp({ transcript, history })
    const durationMs = Date.now() - t0

    // Estimación de tokens: historial + respuesta del paciente + respuesta IA
    const historyChars = history.reduce((s, h) => s + h.content.length, 0)
    const estimatedInputTokens = Math.ceil((historyChars + transcript.length) / 4)
    const estimatedOutputTokens = Math.ceil(JSON.stringify(aiResponse).length / 4)

    recordAiUsage({
      doctorId: appointment.doctorId,
      appointmentId: appointment.id,
      sourceModule: 'AI_QUESTIONNAIRE_INTERVIEW',
      provider: 'openai',
      model: 'gpt-4o',
      promptVersion: resolvePromptVersion('AI_QUESTIONNAIRE_INTERVIEW'),
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      durationMs,
      status: 'COMPLETED',
      metadata: { historyTurns: history.length, isFinished: aiResponse.isFinished },
    }).catch(err => console.error('[aiTelemetry] questionnaire:', err))

    consumeAICredits(
      appointment.doctorId,
      'questionnaireFollowUp',
      `Appointment ${appointment.id}: questionnaire AI interview`,
    ).catch(() => undefined)

    return NextResponse.json({ transcript, ...aiResponse })

  } catch (error: unknown) {
    console.error('AI Interview Error:', error)
    return NextResponse.json({ error: 'Error al procesar la entrevista con IA' }, { status: 500 })
  }
}
