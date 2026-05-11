Deno.serve(async (req) => {
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { to, body } = await req.json()
    const META_TOKEN    = Deno.env.get('META_WA_TOKEN')!
    const META_PHONE_ID = Deno.env.get('META_WA_PHONE_ID')!
    if (!META_TOKEN || !META_PHONE_ID) throw new Error('META_WA_TOKEN o META_WA_PHONE_ID no configurados')

    const cleanTo = to.replace(/\D/g, '')
    const res = await fetch(`https://graph.facebook.com/v19.0/${META_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: cleanTo, type: 'text', text: { body } })
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message ?? 'Meta API error')

    const SUPA_URL = Deno.env.get('SUPABASE_URL')!
    const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const credRes  = await fetch(`${SUPA_URL}/rest/v1/kv_store?key=eq.gew_credits_global&select=value`, { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } })
    const credRows = await credRes.json()
    const credits  = parseInt(credRows?.[0]?.value ?? '9999')
    await fetch(`${SUPA_URL}/rest/v1/kv_store`, { method: 'POST', headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'gew_credits_global', value: String(credits - 1) }) })

    return new Response(JSON.stringify({ sid: data.messages?.[0]?.id, status: 'sent', creditsLeft: credits - 1 }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
