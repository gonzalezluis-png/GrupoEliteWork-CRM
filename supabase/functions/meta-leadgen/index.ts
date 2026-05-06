import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
}

const SUPA_URL     = Deno.env.get('SUPABASE_URL')!
const SUPA_SVC_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VERIFY_TOKEN = Deno.env.get('META_VERIFY_TOKEN') || 'grupoelite2026'
const APP_SECRET   = Deno.env.get('META_APP_SECRET')   || ''
const ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN') || ''
const BOARD_ID     = 'postulados-meta'
const KV_KEY       = `gew_leads_${BOARD_ID}`

// ── Supabase kv_store helpers ─────────────────────────────────────────────────
async function kvGet(key: string): Promise<any[]> {
  const r = await fetch(`${SUPA_URL}/rest/v1/kv_store?key=eq.${key}&select=value`, {
    headers: {
      'apikey':        SUPA_SVC_KEY,
      'Authorization': `Bearer ${SUPA_SVC_KEY}`,
    },
  })
  if (!r.ok) return []
  const rows = await r.json()
  if (!rows.length) return []
  try { return JSON.parse(rows[0].value) } catch { return [] }
}

async function kvSet(key: string, value: any[]) {
  await fetch(`${SUPA_URL}/rest/v1/kv_store`, {
    method: 'POST',
    headers: {
      'apikey':        SUPA_SVC_KEY,
      'Authorization': `Bearer ${SUPA_SVC_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
  })
}

// ── Signature verification ───────────────────────────────────────────────────
async function verifySignature(body: string, sig: string): Promise<boolean> {
  if (!APP_SECRET || !sig) return true // skip if not configured
  const key  = await crypto.subtle.importKey('raw', new TextEncoder().encode(APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const hex  = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
  return sig === `sha256=${hex}`
}

// ── Fetch lead from Graph API ─────────────────────────────────────────────────
async function fetchLeadFromGraph(leadgenId: string): Promise<any> {
  const url = `https://graph.facebook.com/v19.0/${leadgenId}?fields=field_data,created_time,id,form_id,ad_id,ad_name,adset_name,campaign_name&access_token=${ACCESS_TOKEN}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Graph API error: ${r.status}`)
  return r.json()
}

// ── Map Meta field_data to CRM lead schema ───────────────────────────────────
function mapLead(metaLead: any): Record<string, any> {
  const fields: Record<string, string> = {}
  for (const f of metaLead.field_data || []) {
    fields[f.name?.toLowerCase()] = Array.isArray(f.values) ? f.values[0] : f.values
  }

  const nombre    = fields['full_name'] || fields['nombre'] || fields['name'] || ''
  const email     = fields['email'] || ''
  const telefono  = fields['phone_number'] || fields['phone'] || fields['telefono'] || ''
  const ubicacion = fields['city'] || fields['ubicacion'] || fields['location'] || ''
  const hijos     = fields['hijos'] || fields['children'] || fields['dependents'] || ''
  const direccion = fields['street_address'] || fields['address'] || fields['direccion'] || ''
  const notas     = [
    metaLead.ad_name       ? `Anuncio: ${metaLead.ad_name}`       : '',
    metaLead.adset_name    ? `Conjunto: ${metaLead.adset_name}`    : '',
    metaLead.campaign_name ? `Campaña: ${metaLead.campaign_name}`  : '',
  ].filter(Boolean).join(' | ')

  const id      = `meta_${metaLead.id}`
  const creacion = metaLead.created_time
    ? new Date(metaLead.created_time).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  return {
    id,
    nombre,
    email,
    telefono,
    ubicacion,
    hijos,
    direccion,
    notas,
    lead:      'GUÍA DE INFORMACIÓN',
    entrada:   'Meta Lead Ads',
    resultado: 'SIN RESULTADO',
    asignado:  '',
    estado:    '',
    tipo:      'Presencial',
    creacion,
    _updatedAt: new Date().toISOString(),
    _metaLeadgenId: metaLead.id,
    _metaFormId:    metaLead.form_id || '',
    _metaAdId:      metaLead.ad_id   || '',
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)

  // GET — Meta webhook verification
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  // POST — incoming lead event
  if (req.method === 'POST') {
    const rawBody = await req.text()
    const sig     = req.headers.get('x-hub-signature-256') || ''

    if (!(await verifySignature(rawBody, sig))) {
      return new Response('Invalid signature', { status: 403 })
    }

    let body: any
    try { body = JSON.parse(rawBody) } catch { return new Response('Bad JSON', { status: 400 }) }

    // Extract leadgen_id(s) from the event
    const leadgenIds: string[] = []
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === 'leadgen' && change.value?.leadgen_id) {
          leadgenIds.push(change.value.leadgen_id)
        }
      }
    }

    if (!leadgenIds.length) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // Process each lead
    const existingLeads = await kvGet(KV_KEY)
    const existingIds   = new Set(existingLeads.map((l: any) => l._metaLeadgenId))
    let added = 0

    for (const leadgenId of leadgenIds) {
      if (existingIds.has(leadgenId)) continue // dedup
      try {
        const metaLead = await fetchLeadFromGraph(leadgenId)
        const lead     = mapLead(metaLead)
        existingLeads.unshift(lead) // newest first
        existingIds.add(leadgenId)
        added++
      } catch (e) {
        console.error('Failed to fetch lead', leadgenId, e)
      }
    }

    if (added > 0) await kvSet(KV_KEY, existingLeads)

    return new Response(JSON.stringify({ ok: true, added }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }

  return new Response('Method not allowed', { status: 405 })
})
