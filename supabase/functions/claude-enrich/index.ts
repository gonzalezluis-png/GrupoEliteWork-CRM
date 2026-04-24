import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { task, data } = await req.json()
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')!

    let systemPrompt = ''
    let userPrompt   = ''

    if (task === 'complete_addresses') {
      // data: array of { idx, direccion, ubicacion }
      systemPrompt = `Eres un experto en normalización de direcciones postales de Estados Unidos.
Para cada entrada devuelve un objeto JSON con los campos originales MÁS un campo "direccion_completa" con la dirección completa y normalizada.

Reglas estrictas:
1. Si "direccion" contiene SOLO 5 dígitos (ej: "77001") → es un ZIP code. Busca la ciudad y estado correspondientes y devuelve "Ciudad, Estado ZIPCODE" en "direccion_completa"
2. Si "direccion" es una dirección parcial (sin ciudad, estado o ZIP) → intenta completarla con ciudad, estado y ZIP. Formato: "Número Calle, Ciudad, Estado ZIPCODE"
3. Si ya está completa → normaliza formato (capitalización, abreviaciones: St, Ave, Blvd, Dr, Ln, Rd, etc.)
4. Usa "ubicacion" como contexto adicional si ayuda a determinar la ciudad/estado
5. Si absolutamente no puedes determinar algún dato, usa lo que tienes sin inventar
6. Responde ÚNICAMENTE con el array JSON, sin texto adicional ni markdown

Formato de respuesta: [{"idx":0,"direccion_completa":"123 Main St, Houston, TX 77001"}, ...]`

      userPrompt = `Completa estas direcciones:\n${JSON.stringify(data, null, 2)}`
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
