import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PACKAGES: Record<string, { credits: number; price_cents: number; label: string }> = {
  pkg_100:  { credits: 100,  price_cents: 160,  label: '100 mensajes' },
  pkg_500:  { credits: 500,  price_cents: 800,  label: '500 mensajes' },
  pkg_1000: { credits: 1000, price_cents: 1600, label: '1,000 mensajes' },
  pkg_5000: { credits: 5000, price_cents: 8000, label: '5,000 mensajes' },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!

    const { data: rows } = await supa.from('kv_store').select('key,value')
      .in('key', [
        'gew_autocharge_threshold', 'gew_autocharge_package',
        'gew_stripe_customer_id', 'gew_stripe_payment_method',
        'gew_credits_global', 'gew_autocharge_lock',
      ])

    const get = (k: string) => rows?.find((r: { key: string; value: string }) => r.key === k)?.value

    const threshold = parseInt(get('gew_autocharge_threshold') || '50')
    const currentCredits = parseInt(get('gew_credits_global') || '0')

    if (currentCredits > threshold) {
      return new Response(JSON.stringify({ skipped: 'above_threshold', credits: currentCredits }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 2-minute cooldown to prevent double charges
    const lockTime = parseInt(get('gew_autocharge_lock') || '0')
    const now = Date.now()
    if (now - lockTime < 120_000) {
      return new Response(JSON.stringify({ skipped: 'cooldown' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const customerId = get('gew_stripe_customer_id')
    const paymentMethodId = get('gew_stripe_payment_method')
    if (!customerId || !paymentMethodId) {
      return new Response(JSON.stringify({ error: 'No hay método de pago guardado' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const packageId = get('gew_autocharge_package') || 'pkg_500'
    const pkg = PACKAGES[packageId]
    if (!pkg) throw new Error('Paquete inválido')

    // Acquire lock before charging
    await supa.from('kv_store').upsert({ key: 'gew_autocharge_lock', value: String(now) })

    const piParams = new URLSearchParams({
      amount: String(pkg.price_cents),
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: 'true',
      off_session: 'true',
      description: `Auto-recarga Grupo Elite Work — ${pkg.label}`,
      'metadata[packageId]': packageId,
      'metadata[credits]': String(pkg.credits),
      'metadata[autoRecharge]': 'true',
    })

    const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: piParams,
    })
    const pi = await piRes.json()

    if (!piRes.ok || pi.status !== 'succeeded') {
      // Release lock on failure
      await supa.from('kv_store').upsert({ key: 'gew_autocharge_lock', value: '0' })
      throw new Error(pi.error?.message || `Pago fallido: ${pi.status}`)
    }

    const newBalance = currentCredits + pkg.credits
    await supa.from('kv_store').upsert({ key: 'gew_credits_global', value: String(newBalance) })

    await supa.from('kv_store').upsert({
      key: `gew_msg_tx_${now}`,
      value: JSON.stringify({
        autoRecharge: true, packageId, credits: pkg.credits,
        amount: pkg.price_cents, date: new Date().toISOString(),
        stripePaymentIntent: pi.id, newBalance,
      }),
    })

    return new Response(JSON.stringify({ success: true, creditsAdded: pkg.credits, newBalance }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
