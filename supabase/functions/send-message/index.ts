import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { to, body, channel, boardId } = await req.json()

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check credits
    const credKey = `gew_credits_${boardId}`
    const { data: credRow } = await supa.from('kv_store').select('value').eq('key', credKey).maybeSingle()
    const currentCredits = parseInt(credRow?.value || '0')
    if (currentCredits < 1) {
      return new Response(JSON.stringify({ error: 'Sin créditos. Recarga para enviar mensajes.' }), {
        status: 402,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Send via Twilio
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const from       = Deno.env.get('TWILIO_PHONE_NUMBER')!
    const fromNum    = channel === 'whatsapp' ? `whatsapp:${from}` : from
    const toNum      = channel === 'whatsapp' ? `whatsapp:${to}`   : to

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

    // Deduct 1 credit
    await supa.from('kv_store').upsert({ key: credKey, value: String(currentCredits - 1) })

    return new Response(JSON.stringify({ sid: data.sid, status: data.status, creditsLeft: currentCredits - 1 }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
