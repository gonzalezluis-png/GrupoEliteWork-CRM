import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { successUrl, cancelUrl } = await req.json()
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!

    const params = new URLSearchParams({
      'mode': 'setup',
      'payment_method_types[]': 'card',
      'success_url': successUrl || 'https://lead.grupoelitework.com?setup=success',
      'cancel_url':  cancelUrl  || 'https://lead.grupoelitework.com?setup=cancel',
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
