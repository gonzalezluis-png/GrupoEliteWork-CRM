import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Map Zoom result codes to human-readable Spanish labels
const RESULT_LABEL: Record<string, string> = {
  'Call Connected':  'Conectó',
  'No Answer':       'No contestó',
  'Voicemail':       'Buzón de voz',
  'Busy':            'Ocupado',
  'Rejected':        'Rechazó',
  'Canceled':        'Cancelado',
  'Failed':          'Falló',
}

serve(async (req) => {
  const body = await req.text()

  try {
    const payload = JSON.parse(body)

    // ── Zoom endpoint URL validation challenge ──
    if (payload.event === 'endpoint.url_validation') {
      const secret = Deno.env.get('ZOOM_WEBHOOK_SECRET') ?? ''
      const key    = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      )
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload.payload.plainToken))
      const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
      return new Response(
        JSON.stringify({ plainToken: payload.payload.plainToken, encryptedToken: hex }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Call completed events ──
    if (
      payload.event === 'phone.caller_call_log_completed' ||
      payload.event === 'phone.callee_call_log_completed'
    ) {
      const obj        = payload.payload?.object ?? {}
      const zoomUserId = obj.user_id ?? ''
      const toPhone    = (obj.callee?.phone_number ?? obj.to ?? '').replace(/\D/g, '')
      const fromPhone  = (obj.caller?.phone_number ?? obj.from ?? '').replace(/\D/g, '')
      const duration   = obj.duration ?? 0        // seconds
      const rawResult  = obj.result ?? ''
      const result     = RESULT_LABEL[rawResult] ?? rawResult
      const startTime  = obj.start_time ?? new Date().toISOString()
      const direction  = payload.event.includes('caller') ? 'outbound' : 'inbound'

      // Find user whose active call matches this Zoom user ID
      const { data: activeRows } = await supa
        .from('kv_store')
        .select('key, value')
        .like('key', 'gew_zoom_active_%')

      let leadId: string | null  = null
      let boardId: string | null = null
      let callerUserId: string | null = null

      for (const row of (activeRows ?? [])) {
        try {
          const active = JSON.parse(row.value)
          // Match by Zoom user ID or phone number
          const matchPhone = toPhone && (
            active.toPhone?.replace(/\D/g,'').endsWith(toPhone.slice(-10)) ||
            toPhone.endsWith((active.toPhone ?? '').replace(/\D/g,'').slice(-10))
          )
          if (matchPhone || row.key.includes(zoomUserId)) {
            leadId       = active.leadId  ?? null
            boardId      = active.boardId ?? null
            callerUserId = row.key.replace('gew_zoom_active_', '')
            // Clean up active call marker
            await supa.from('kv_store').delete().eq('key', row.key)
            break
          }
        } catch (_) { /* skip */ }
      }

      // Build call log entry
      const callEntry = {
        id:          Date.now().toString(36) + Math.random().toString(36).slice(2),
        date:        startTime,
        duration,
        result,
        direction,
        toPhone,
        fromPhone,
        autoLogged:  true,
      }

      // Update lead if we know which one it is
      if (leadId && boardId) {
        const key = `gew_leads_${boardId}`
        const { data: leadsRow } = await supa
          .from('kv_store').select('value').eq('key', key).maybeSingle()
        if (leadsRow) {
          const leads = JSON.parse(leadsRow.value || '[]')
          const idx   = leads.findIndex((l: any) => l.id === leadId)
          if (idx !== -1) {
            const calls = JSON.parse(leads[idx]._calls || '[]')
            calls.unshift(callEntry)
            leads[idx]._calls = JSON.stringify(calls)
            await supa.from('kv_store').upsert({ key, value: JSON.stringify(leads) })
          }
        }
      } else {
        // Fallback: scan all boards by phone number
        const matchDigits = toPhone.slice(-10) || fromPhone.slice(-10)
        if (matchDigits) {
          const { data: kvRows } = await supa
            .from('kv_store').select('key, value').like('key', 'gew_leads_%')

          for (const row of (kvRows ?? [])) {
            try {
              const leads = JSON.parse(row.value || '[]')
              let changed = false
              for (const lead of leads) {
                const stored = (lead.telefono ?? '').replace(/\D/g, '')
                if (!stored || !stored.endsWith(matchDigits)) continue
                const calls = JSON.parse(lead._calls || '[]')
                calls.unshift(callEntry)
                lead._calls = JSON.stringify(calls)
                changed = true
              }
              if (changed) await supa.from('kv_store').upsert({ key: row.key, value: JSON.stringify(leads) })
            } catch (_) { /* skip malformed */ }
          }
        }
      }
    }

    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error('zoom-webhook error:', e)
    return new Response('error', { status: 400 })
  }
})
