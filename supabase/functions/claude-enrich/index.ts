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
      systemPrompt = `Eres un asistente experto en normalización de datos de direcciones de Estados Unidos.
Tu tarea es analizar direcciones parciales o incompletas y completarlas lo mejor posible.
Para cada entrada, devuelve el mismo JSON con los campos completados o corregidos.
Reglas:
- Si la dirección ya está completa, devuélvela tal cual
- Completa ciudad (ubicacion) y estado si puedes deducirlos de la dirección
- Normaliza el formato de la dirección (capitalización, abreviaciones estándar: St, Ave, Blvd, etc.)
- Si no puedes determinar un campo con certeza, déjalo igual que el original
- No inventes información que no puedas deducir de los datos
- Responde SOLO con el array JSON, sin explicaciones ni texto adicional`

      userPrompt = `Analiza y completa estas direcciones:\n${JSON.stringify(data, null, 2)}\n\nResponde con el mismo array JSON con los campos completados.`
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
