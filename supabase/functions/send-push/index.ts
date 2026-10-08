// Supabase Edge Function «send-push»: отправляет уведомление из таблицы notifications на все устройства клиента.
// Вызывается базой (триггер на notifications через pg_net) с заголовком x-push-secret.
// Secrets функции: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:вашапочта), PUSH_SECRET.
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:support@formula.kz', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
const TARGET: Record<string, string> = { subscription_expiring: 'renew', new_promotion: 'home', referral_bonus: 'history', support_reply: 'support', support_closed: 'support' }

Deno.serve(async req => {
  if (req.method !== 'POST' || req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) return new Response('forbidden', { status: 403 })
  const { notification_id } = await req.json().catch(() => ({}))
  const { data: n } = await sb.from('notifications').select('id,user_id,type,title,message').eq('id', notification_id).single()
  if (!n) return new Response('not found', { status: 404 })
  const { data: subs } = await sb.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', n.user_id)
  const payload = JSON.stringify({ title: n.title, body: n.message, tag: n.type + ':' + n.id, tab: TARGET[n.type] ?? '' })
  let sent = 0
  for (const s of subs ?? []) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'normal' }); sent++ }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id) }
  }
  return Response.json({ sent })
})
