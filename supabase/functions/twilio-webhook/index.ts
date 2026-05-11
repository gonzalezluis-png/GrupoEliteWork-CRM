Deno.serve(async (req) => {
  const url       = new URL(req.url)
  const challenge = url.searchParams.get('hub.challenge') ?? ''
  const token     = url.searchParams.get('hub.verify_token') ?? ''
  const VERIFY    = Deno.env.get('META_VERIFY_TOKEN') ?? 'grupoelite2026'

  // ── GET: Meta webhook verification ──────────────────────────────────────
  if (req.method === 'GET' && token === VERIFY) {
    return new Response(challenge, { status: 200 })
  }

  // ── POST: incoming WhatsApp message ─────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const payload = await req.json()
      const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
      if (message?.type === 'text') {
        const from = message.from ?? ''
        const body = message.text?.body ?? ''
        if (from && body) {
          const SUPA_URL = Deno.env.get('SUPABASE_URL')!
          const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
          const res = await fetch(SUPA_URL + '/rest/v1/kv_store?key=like.gew_leads_%&select=key,value', {
            headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY }
          })
          const kvRows = await res.json()
          for (const row of (kvRows ?? [])) {
            try {
              const leads = JSON.parse(row.value ?? '[]')
              let changed = false
              for (const lead of leads) {
                const stored   = (lead.telefono ?? '').replace(/\D/g, '')
                const incoming = from.replace(/\D/g, '')
                if (!stored || !incoming) continue
                if (!stored.endsWith(incoming.slice(-10)) && !incoming.endsWith(stored.slice(-10))) continue
                const msgs = JSON.parse(lead._messages ?? '[]')
                msgs.push({ from: 'whatsapp:+'+from, to: '', body, channel: 'whatsapp', direction: 'inbound', date: new Date().toISOString(), author: lead.nombre ?? from, sid: message.id ?? '' })
                lead._messages = JSON.stringify(msgs)
                changed = true
              }
              if (changed) {
                await fetch(SUPA_URL + '/rest/v1/kv_store', {
                  method: 'POST',
                  headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
                  body: JSON.stringify({ key: row.key, value: JSON.stringify(leads) })
                })
              }
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
    return new Response('OK', { status: 200 })
  }

  return new Response('OK', { status: 200 })
})
