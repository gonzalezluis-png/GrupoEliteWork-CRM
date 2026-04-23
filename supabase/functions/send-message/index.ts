import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { to, body, channel } = await req.json()
    // channel: 'sms' | 'whatsapp'

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const from       = Deno.env.get('TWILIO_PHONE_NUMBER')!

    const fromNum = channel === 'whatsapp' ? `whatsapp:${from}` : from
    const toNum   = channel === 'whatsapp' ? `whatsapp:${to}`   : to

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: fromNum, To: toNum, Body: body }),
      }
    )

    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Twilio error')

    return new Response(JSON.stringify({ sid: data.sid, status: data.status }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
