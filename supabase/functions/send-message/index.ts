import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { to, body, channel } = await req.json()

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const META_TOKEN    = Deno.env.get('META_WA_TOKEN')!
    const META_PHONE_ID = Deno.env.get('META_WA_PHONE_ID')!

    if (!META_TOKEN || !META_PHONE_ID) {
      throw new Error('META_WA_TOKEN o META_WA_PHONE_ID no configurados')
    }

    // Normalize phone: digits only, no leading +
    const cleanTo = to.replace(/\D/g, '')

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${META_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${META_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanTo,
          type: 'text',
          text: { body },
        }),
      }
    )

    const data = await res.json()
    if (data.error) throw new Error(data.error.message || 'Meta API error')

    // Credits check (cosmetic — subtract 1 from global pool)
    const credKey = 'gew_credits_global'
    const { data: credRow } = await supa.from('kv_store').select('value').eq('key', credKey).maybeSingle()
    const currentCredits = parseInt(credRow?.value || '9999')
    await supa.from('kv_store').upsert({ key: credKey, value: String(currentCredits - 1) })

    return new Response(JSON.stringify({ sid: data.messages?.[0]?.id, status: 'sent', creditsLeft: currentCredits - 1 }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
