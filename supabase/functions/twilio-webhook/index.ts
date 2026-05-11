import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // ── GET: Meta webhook verification ──────────────────────────────────────────
  if (req.method === 'GET') {
    const url    = new URL(req.url)
    const mode   = url.searchParams.get('hub.mode')
    const token  = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    const VERIFY_TOKEN = Deno.env.get('META_VERIFY_TOKEN') || 'grupoelite2026'
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  // ── POST: incoming WhatsApp message from Meta ────────────────────────────────
  try {
    const payload = await req.json()

    // Verify Meta signature
    const appSecret = Deno.env.get('META_APP_SECRET') || ''
    if (appSecret) {
      const sig = req.headers.get('x-hub-signature-256') || ''
      const raw = JSON.stringify(payload)
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(appSecret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      )
      const mac  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
      const hex  = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2,'0')).join('')
      if (sig !== `sha256=${hex}`) {
        console.warn('[Meta WA] Firma inválida')
        return new Response('OK', { status: 200 }) // always 200 to Meta
      }
    }

    const entry    = payload.entry?.[0]
    const change   = entry?.changes?.[0]?.value
    const message  = change?.messages?.[0]
    if (!message || message.type !== 'text') return new Response('OK', { status: 200 })

    const from = message.from   // e.g. "17863060642"
    const body = message.text?.body || ''
    if (!from || !body) return new Response('OK', { status: 200 })

    console.log(`[Meta WA] ← ${from}: ${body}`)

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Find lead by phone and append inbound message
    const { data: kvRows } = await supa
      .from('kv_store')
      .select('key, value')
      .like('key', 'gew_leads_%')

    for (const row of (kvRows || [])) {
      try {
        const leads  = JSON.parse(row.value || '[]')
        let changed  = false
        for (const lead of leads) {
          const stored   = (lead.telefono || '').replace(/\D/g, '')
          const incoming = from.replace(/\D/g, '')
          if (!stored || !incoming) continue
          if (!stored.endsWith(incoming.slice(-10)) && !incoming.endsWith(stored.slice(-10))) continue
          const msgs = JSON.parse(lead._messages || '[]')
          msgs.push({
            from:      `whatsapp:+${from}`,
            to:        '',
            body,
            channel:   'whatsapp',
            direction: 'inbound',
            date:      new Date().toISOString(),
            author:    lead.nombre || from,
            sid:       message.id || '',
          })
          lead._messages = JSON.stringify(msgs)
          changed = true
        }
        if (changed) {
          await supa.from('kv_store').upsert({ key: row.key, value: JSON.stringify(leads) })
        }
      } catch (_) { /* skip malformed rows */ }
    }

    return new Response('OK', { status: 200 })
  } catch (e) {
    console.error('[Meta WA webhook]', e.message)
    return new Response('OK', { status: 200 })
  }
})
