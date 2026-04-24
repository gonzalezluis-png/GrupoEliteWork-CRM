import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getValidToken(supa: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supa
    .from('kv_store')
    .select('value')
    .eq('key', `gew_zoom_token_${userId}`)
    .maybeSingle()

  if (!data) throw new Error('Usuario no conectado a Zoom. Ve a Configuración → Mi cuenta → Conectar Zoom.')

  let token = JSON.parse(data.value)

  // Refresh if expiring within 2 minutes
  if (Date.now() > token.expires_at - 120_000) {
    const clientId     = Deno.env.get('ZOOM_CLIENT_ID')!
    const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')!

    const res = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: token.refresh_token,
      }),
    })

    if (!res.ok) throw new Error('No se pudo renovar el token de Zoom. Reconecta tu cuenta.')
    const fresh = await res.json()

    token = {
      ...token,
      access_token:  fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at:    Date.now() + fresh.expires_in * 1000,
    }

    await supa.from('kv_store').upsert({ key: `gew_zoom_token_${userId}`, value: JSON.stringify(token) })
  }

  return token
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  return `+${digits}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { userId, phoneNumber, leadId, leadName, boardId } = await req.json()
    if (!userId || !phoneNumber) throw new Error('userId y phoneNumber son requeridos')

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const token   = await getValidToken(supa, userId)
    const toPhone = normalizePhone(phoneNumber)

    // Initiate outbound call via Zoom Phone API
    const callRes = await fetch(
      `https://api.zoom.us/v2/phone/users/${token.zoom_user_id}/call`,
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${token.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to: toPhone }),
      }
    )

    const callData = await callRes.json()
    if (!callRes.ok) throw new Error(callData.message || 'Error al iniciar la llamada en Zoom')

    // Store active call marker (for webhook correlation)
    await supa.from('kv_store').upsert({
      key:   `gew_zoom_active_${userId}`,
      value: JSON.stringify({
        call_id:    callData.call_id ?? null,
        leadId,
        leadName,
        boardId,
        toPhone,
        startedAt:  new Date().toISOString(),
      }),
    })

    return new Response(
      JSON.stringify({ ok: true, call_id: callData.call_id ?? null, to: toPhone }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
