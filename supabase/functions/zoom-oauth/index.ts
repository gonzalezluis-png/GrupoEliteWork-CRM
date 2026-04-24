import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REDIRECT_URI = 'https://lead.grupoelitework.com'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { code, userId, action } = await req.json()

    const clientId     = Deno.env.get('ZOOM_CLIENT_ID')!
    const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')!
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Disconnect ──
    if (action === 'disconnect') {
      await supa.from('kv_store').delete().eq('key', `gew_zoom_token_${userId}`)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── Exchange auth code for tokens ──
    const tokenRes = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      throw new Error('Token exchange failed: ' + err)
    }

    const tokens = await tokenRes.json()

    // ── Get Zoom user profile ──
    const meRes = await fetch('https://api.zoom.us/v2/users/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (!meRes.ok) throw new Error('Failed to get Zoom user profile')
    const zoomUser = await meRes.json()

    // ── Get Zoom Phone number ──
    let zoomPhoneNumber: string | null = null
    try {
      const phoneRes = await fetch(`https://api.zoom.us/v2/phone/users/${zoomUser.id}`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (phoneRes.ok) {
        const phoneData = await phoneRes.json()
        zoomPhoneNumber = phoneData.phone_numbers?.[0]?.number ?? null
      }
    } catch (_) { /* Phone license may not be active */ }

    // ── Persist tokens ──
    const tokenData = {
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    Date.now() + tokens.expires_in * 1000,
      zoom_user_id:  zoomUser.id,
      zoom_email:    zoomUser.email,
      zoom_name:     `${zoomUser.first_name} ${zoomUser.last_name}`.trim(),
      zoom_phone:    zoomPhoneNumber,
    }

    await supa.from('kv_store').upsert({
      key:   `gew_zoom_token_${userId}`,
      value: JSON.stringify(tokenData),
    })

    return new Response(
      JSON.stringify({
        ok:         true,
        zoom_email: zoomUser.email,
        zoom_name:  tokenData.zoom_name,
        zoom_phone: zoomPhoneNumber,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
