import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Packages: { credits, price_cents, label }
const PACKAGES = [
  { id: 'pkg_100',  credits: 100,  price_cents: 160,  label: '100 mensajes' },
  { id: 'pkg_500',  credits: 500,  price_cents: 800,  label: '500 mensajes' },
  { id: 'pkg_1000', credits: 1000, price_cents: 1600, label: '1,000 mensajes' },
  { id: 'pkg_5000', credits: 5000, price_cents: 8000, label: '5,000 mensajes' },
]

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { packageId, boardId, successUrl, cancelUrl } = await req.json()
    const pkg = PACKAGES.find(p => p.id === packageId)
    if (!pkg) throw new Error('Paquete no válido')

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!

    const params = new URLSearchParams({
      'payment_method_types[]': 'card',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `Grupo Elite Work — ${pkg.label}`,
      'line_items[0][price_data][product_data][description]': `${pkg.credits} créditos de mensajería SMS/WhatsApp`,
      'line_items[0][price_data][unit_amount]': String(pkg.price_cents),
      'line_items[0][quantity]': '1',
      'mode': 'payment',
      'success_url': successUrl || 'https://lead.grupoelitework.com?payment=success',
      'cancel_url': cancelUrl  || 'https://lead.grupoelitework.com?payment=cancel',
      'metadata[boardId]': boardId,
      'metadata[credits]': String(pkg.credits),
      'metadata[packageId]': packageId,
    })

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    const session = await res.json()
    if (!res.ok) throw new Error(session.error?.message || 'Stripe error')

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
