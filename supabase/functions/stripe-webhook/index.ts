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

  if (event.type === 'checkout.session.completed') {
    const session  = event.data.object
    const boardId  = session.metadata?.boardId
    const credits  = parseInt(session.metadata?.credits || '0')

    if (!boardId || !credits) return new Response('Missing metadata', { status: 400 })

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const credKey = `gew_credits_${boardId}`

    // Get current credits
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
