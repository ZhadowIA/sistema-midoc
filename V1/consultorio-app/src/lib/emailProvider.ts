import { Resend } from 'resend'

export type EmailAction = {
  label: string
  url: string
  variant: 'primary' | 'danger'
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY no configurado')
  return new Resend(apiKey)
}

function getFromAddress() {
  return process.env.EMAIL_FROM_ADDRESS || 'notificaciones@midoc.mx'
}

export async function sendEmail(params: {
  to: string
  subject: string
  text: string
  actions?: EmailAction[]
}): Promise<{ id: string }> {
  const resend = getResendClient()
  const html = buildHtml(params.subject, params.text, params.actions)

  const { data, error } = await resend.emails.send({
    from: getFromAddress(),
    to: params.to,
    subject: params.subject,
    html,
    text: params.text,
  })

  if (error) throw new Error(error.message)
  if (!data?.id) throw new Error('Resend no retornó ID del mensaje')

  return { id: data.id }
}

function buildHtml(subject: string, text: string, actions?: EmailAction[]): string {
  const lines = text
    .split('\n')
    .map((line) => `<p style="margin:0 0 8px 0">${escapeHtml(line)}</p>`)
    .join('')

  const actionButtons = actions?.length
    ? `<div style="margin-top:24px;display:flex;flex-direction:column;gap:12px">
        ${actions.map((a) => {
          const bg = a.variant === 'danger' ? '#dc2626' : '#0f766e'
          const hover = a.variant === 'danger' ? '#b91c1c' : '#0d6460'
          return `<a href="${escapeHtml(a.url)}"
            style="display:block;text-align:center;padding:14px 24px;background:${bg};color:#fff;font-weight:700;font-size:15px;border-radius:10px;text-decoration:none"
            onmouseover="this.style.background='${hover}'"
            onmouseout="this.style.background='${bg}'"
          >${escapeHtml(a.label)}</a>`
        }).join('')}
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:100%">
        <tr><td style="background:#0f766e;padding:20px 32px">
          <span style="color:#fff;font-size:20px;font-weight:700">MiDoc</span>
        </td></tr>
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 16px 0;font-size:18px;color:#111827">${escapeHtml(subject)}</h2>
          <div style="font-size:15px;color:#374151;line-height:1.6">${lines}</div>
          ${actionButtons}
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb">
          <p style="margin:0;font-size:12px;color:#9ca3af">Este es un mensaje automático de MiDoc. Por favor no respondas a este correo.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
