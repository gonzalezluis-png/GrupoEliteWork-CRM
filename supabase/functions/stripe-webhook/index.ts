import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature') || ''
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
  const stripeKey     = Deno.env.get('STRIPE_SECRET_KEY')!

  // Verify Stripe signature if webhook secret is configured
  if (webhookSecret) {
    const isValid = await verifyStripeSignature(body, signature, webhookSecret)
    if (!isValid) return new Response('Invalid signature', { status: 400 })
  }

  const event = JSON.parse(body)

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object

    // Setup mode: save customer + payment method for auto-recharge
    if (session.mode === 'setup') {
      const customerId   = session.customer
      const setupIntentId = session.setup_intent
      if (setupIntentId) {
        const siRes = await fetch(`https://api.stripe.com/v1/setup_intents/${setupIntentId}`, {
          headers: { 'Authorization': `Bearer ${stripeKey}` },
        })
        const si = await siRes.json()
        const paymentMethodId = si.payment_method
        if (customerId && paymentMethodId) {
          const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${paymentMethodId}`, {
            headers: { 'Authorization': `Bearer ${stripeKey}` },
          })
          const pm = await pmRes.json()
          await supa.from('kv_store').upsert({ key: 'gew_stripe_customer_id',     value: customerId })
          await supa.from('kv_store').upsert({ key: 'gew_stripe_payment_method',  value: paymentMethodId })
          await supa.from('kv_store').upsert({ key: 'gew_stripe_card_last4',      value: pm.card?.last4 || '' })
          await supa.from('kv_store').upsert({ key: 'gew_stripe_card_brand',      value: pm.card?.brand || '' })
        }
      }
      return new Response('ok', { status: 200 })
    }

    const boardId  = session.metadata?.boardId
    const credits  = parseInt(session.metadata?.credits || '0')

    if (!credits) return new Response('Missing credits metadata', { status: 400 })

    // Add to global pool
    const credKey = 'gew_credits_global'
    const { data: existing } = await supa
      .from('kv_store')
      .select('value')
      .eq('key', credKey)
      .maybeSingle()

    const current = parseInt(existing?.value || '0')
    const updated = current + credits

    await supa.from('kv_store').upsert({ key: credKey, value: String(updated) })

    // Log transaction
    const txKey = `gew_msg_tx_${Date.now()}`
    const boardName = session.metadata?.boardName || boardId
    const amountTotal = session.amount_total || 0
    await supa.from('kv_store').upsert({
      key: txKey,
      value: JSON.stringify({ boardId, boardName, credits, amount: amountTotal, date: new Date().toISOString(), stripeSession: session.id })
    })
  }

  return new Response('ok', { status: 200 })
})

async function verifyStripeSignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = signature.split(',').reduce((acc: Record<string,string>, p) => {
      const [k, v] = p.split('=')
      acc[k] = v
      return acc
    }, {})
    const timestamp = parts['t']
    const sig       = parts['v1']
    const payload   = `${timestamp}.${body}`
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const computed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    const hex = Array.from(new Uint8Array(computed)).map(b => b.toString(16).padStart(2, '0')).join('')
    return hex === sig
  } catch { return false }
}
