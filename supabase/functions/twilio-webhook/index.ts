import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const text = await req.text()
    const params = new URLSearchParams(text)

    const from    = params.get('From') || ''       // e.g. whatsapp:+15551234567
    const to      = params.get('To')   || ''       // our Twilio number
    const body    = params.get('Body') || ''
    const channel = from.startsWith('whatsapp:') ? 'whatsapp' : 'sms'
    // Strip whatsapp: prefix for matching
    const fromNum = from.replace('whatsapp:', '').replace('sms:', '').trim()

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Find lead by phone number across all boards
    const { data: kvRows } = await supa
      .from('kv_store')
      .select('key, value')
      .like('key', 'gew_leads_%')

    let matched = false

    for (const row of (kvRows || [])) {
      try {
        const leads = JSON.parse(row.value || '[]')
        let changed = false

        for (const lead of leads) {
          // Normalize stored phone for comparison
          const stored = (lead.telefono || '').replace(/\D/g, '')
          const incoming = fromNum.replace(/\D/g, '')
          if (!stored || !incoming) continue
          // Match last 10 digits
          if (!stored.endsWith(incoming.slice(-10)) && !incoming.endsWith(stored.slice(-10))) continue

          // Append inbound message
          const msgs = JSON.parse(lead._messages || '[]')
          msgs.push({
            from: from,
            to: to,
            body,
            channel,
            direction: 'inbound',
            date: new Date().toISOString(),
            author: lead.nombre || fromNum,
            sid: params.get('MessageSid') || '',
          })
          lead._messages = JSON.stringify(msgs)
          changed = true
          matched = true
        }

        if (changed) {
          await supa.from('kv_store').upsert({ key: row.key, value: JSON.stringify(leads) })
        }
      } catch (_) { /* skip malformed rows */ }
    }

    // Twilio expects TwiML response (empty = no reply)
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { ...CORS, 'Content-Type': 'text/xml' } }
    )
  } catch (e) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  }
})
