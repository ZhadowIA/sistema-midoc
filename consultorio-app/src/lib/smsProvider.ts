import twilio from 'twilio'

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    throw new Error('Twilio no configurado (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)')
  }

  return twilio(accountSid, authToken)
}

function getFromNumber() {
  const from = process.env.TWILIO_FROM_NUMBER
  if (!from) throw new Error('TWILIO_FROM_NUMBER no configurado')
  return from
}

export async function sendSms(to: string, body: string): Promise<{ sid: string }> {
  const client = getTwilioClient()
  const message = await client.messages.create({ body, from: getFromNumber(), to })
  return { sid: message.sid }
}
