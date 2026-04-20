export function buildWhatsAppLink(phone: string, text: string): string | null {
  const digits = phone.replace(/\D+/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export function buildPatientMessage(args: {
  patientName: string
  signedAt: string
  assessmentSummary: string
}): string {
  const date = new Date(args.signedAt).toLocaleString()
  const lines = [
    `Hola ${args.patientName},`,
    `Tu consulta del ${date} ha quedado registrada.`,
  ]
  if (args.assessmentSummary) {
    lines.push('', 'Impresión clínica:', args.assessmentSummary)
  }
  lines.push('', 'Quedo atento a cualquier duda.')
  return lines.join('\n')
}
