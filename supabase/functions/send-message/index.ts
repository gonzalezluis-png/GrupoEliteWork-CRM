import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { to, body, channel, boardId, contentSid, contentVariables } = await req.json()

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Credits check temporarily disabled — unlimited mode
    const credKey = 'gew_credits_global'
    const { data: credRow } = await supa.from('kv_store').select('value').eq('key', credKey).maybeSingle()
    const currentCredits = parseInt(credRow?.value || '9999')

    // Send via Twilio
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const smsNumber  = Deno.env.get('TWILIO_PHONE_NUMBER')!
    const waNumber   = Deno.env.get('TWILIO_WHATSAPP_NUMBER') || smsNumber
    const fromNum    = channel === 'whatsapp' ? `whatsapp:${waNumber}` : smsNumber
    const toNum      = channel === 'whatsapp' ? `whatsapp:${to}`       : to

    // Build Twilio params — template or plain text
    const twilioParams: Record<string, string> = { From: fromNum, To: toNum }
    if (contentSid) {
      twilioParams['ContentSid'] = contentSid
      if (contentVariables) {
        twilioParams['ContentVariables'] = typeof contentVariables === 'string'
          ? contentVariables
          : JSON.stringify(contentVariables)
      }
    } else {
      twilioParams['Body'] = body
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(twilioParams),
      }
    )

    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Twilio error')

    // Deduct 1 credit from global pool
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
