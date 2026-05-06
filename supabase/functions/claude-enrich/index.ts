import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { task, data, imageBase64, mediaType = 'image/jpeg' } = await req.json()
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')!

    // ── Extract referrals from image ──────────────────────────────────────────
    if (task === 'extract_referrals_image') {
      if (!imageBase64) throw new Error('imageBase64 es requerido')

      const visionRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type':      'application/json',
        },
        body: JSON.stringify({
          model:      'claude-opus-4-7',
          max_tokens: 2048,
          system: `Eres un asistente que extrae datos de hojas de referidos escritas a mano o impresas.
Devuelve ÚNICAMENTE un array JSON con objetos que tengan estos campos (sin texto adicional ni markdown):
- "nombre": nombre completo de la persona referida
- "telefono": número de teléfono (solo dígitos, guiones y espacios)
- "relacion": relación con quien refirió (ej: amigo, familiar, compañero, etc.)

Si un campo no está claro, devuelve cadena vacía "".
Si no hay personas en la imagen, devuelve [].
Responde ÚNICAMENTE con el array JSON.`,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: imageBase64 },
              },
              { type: 'text', text: 'Extrae todos los referidos de esta imagen.' },
            ],
          }],
        }),
      })

      if (!visionRes.ok) throw new Error('Claude API error: ' + await visionRes.text())

      const visionJson = await visionRes.json()
      const rawText    = visionJson.content?.[0]?.text || '[]'
      const jsonMatch  = rawText.match(/\[[\s\S]*\]/)
      const result     = jsonMatch ? JSON.parse(jsonMatch[0]) : []

      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // ── Complete addresses ────────────────────────────────────────────────────
    let systemPrompt = ''
    let userPrompt   = ''

    if (task === 'complete_addresses') {
      // data: array of { idx, direccion, ubicacion, boardContext? }
      const boardContext = data[0]?.boardContext || ''
      systemPrompt = `Eres un experto en normalización de direcciones postales de Estados Unidos.
Para cada entrada devuelve ÚNICAMENTE el array JSON, sin texto adicional ni markdown.

REGLAS — léelas todas antes de responder:

1. ZIP CODE SOLO (exactamente 5 dígitos, ej: "77001"):
   → Devuelve la ciudad y estado REAL que corresponde a ese ZIP. Formato: "Ciudad, ST ZIPCODE"
   → SOLO si conoces con certeza ese ZIP. Si no lo conoces, devuelve direccion_completa = direccion original.

2. DIRECCIÓN CON NÚMERO DE CALLE Y NOMBRE DE CALLE (ej: "123 Main St"):
   → Si el campo "ubicacion" o "boardContext" indica ciudad/estado, úsalos para completar.
   → Normaliza abreviaciones: Street→St, Avenue→Ave, Boulevard→Blvd, Drive→Dr, Lane→Ln, Road→Rd, Court→Ct, Place→Pl.
   → Si no puedes confirmar ciudad/estado con certeza, devuelve solo la parte que sí conoces sin inventar ciudad.

3. YA COMPLETA (tiene número, calle, ciudad, estado y/o ZIP):
   → Solo normaliza formato y capitalización. NO cambies ningún dato.

4. DIRECCIÓN CORTA, AMBIGUA O INCOHERENTE:
   → Si no puedes hacer una coincidencia con alta certeza, devuelve direccion_completa = la misma direccion original SIN cambios.
   → NUNCA inventes ciudades, estados ni ZIPs que no correspondan claramente a la dirección dada.

5. CONTEXTO:
   → boardContext: "${boardContext}" — si indica un estado o ciudad, úsalo como referencia prioritaria.
   → ubicacion del lead también puede indicar la zona geográfica.

Formato de respuesta: [{"idx":0,"direccion_completa":"valor"}, ...]`

      userPrompt = `Normaliza estas direcciones:\n${JSON.stringify(data, null, 2)}`
    } else {
      return new Response(JSON.stringify({ error: 'Tarea no reconocida' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error('Claude API error: ' + err)
    }

    const claude = await res.json()
    const rawText = claude.content?.[0]?.text || '[]'

    // Extract JSON from response
    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
