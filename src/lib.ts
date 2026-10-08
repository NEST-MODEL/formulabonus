import { createClient } from '@supabase/supabase-js'
export const supabase = import.meta.env.VITE_SUPABASE_URL ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY) : null
export const kzt = (n: number) => n.toLocaleString('ru-RU') + ' ₸'
export const N = (n: number) => n.toLocaleString('ru-RU')
export const maxBonus = (price: number, pct: number) => Math.floor((price * pct) / 100)

// ---- Вход по номеру телефона ----
// Supabase Auth без платного SMS-провайдера не умеет вход «телефон + пароль», поэтому логином служит
// технический адрес из номера на зарезервированном домене .internal (никогда не существует в интернете, писем не отправляется).
// Пароль, как и раньше, хранит и хеширует сам Supabase Auth.
export const PHONE_LOGIN_DOMAIN = 'phone.formula.internal'
export const normPhone = (v: string) => { let d = v.replace(/\D/g, ''); if (d.length === 11 && (d[0] === '8' || d[0] === '7')) d = '7' + d.slice(1); else if (d.length === 10) d = '7' + d; return /^7\d{10}$/.test(d) ? d : null }
export const phoneEmail = (digits: string) => `${digits}@${PHONE_LOGIN_DOMAIN}`
export const fmtPhone = (v: string) => { const d = (v.replace(/\D/g, '').replace(/^8/, '7') || '').slice(0, 11), x = d.startsWith('7') ? d.slice(1) : d
  return '+7' + (x ? ' (' + x.slice(0, 3) : '') + (x.length > 3 ? ') ' + x.slice(3, 6) : '') + (x.length > 6 ? '-' + x.slice(6, 8) : '') + (x.length > 8 ? '-' + x.slice(8, 10) : '') }
export const maskPhone = (p?: string | null) => { const d = (p ?? '').replace(/\D/g, ''); return d.length >= 11 ? `+7 ${d.slice(1, 4)} *** ** ${d.slice(-2)}` : (p || '—') }
// Флаг «был вход»: если сессия пропала не по кнопке «Выйти», на экране входа покажем спокойное сообщение
const HAD = 'fb-had-session'
export const markSession = () => { try { localStorage.setItem(HAD, '1') } catch { /* ignore */ } }
export const lostSession = () => { try { return localStorage.getItem(HAD) === '1' } catch { return false } }
export const logout = async () => {
  try { localStorage.removeItem(HAD) } catch { /* ignore */ }
  // на общем телефоне следующий пользователь не должен получать чужие push
  try { const reg = await navigator.serviceWorker?.getRegistration(import.meta.env.BASE_URL), sub = await reg?.pushManager?.getSubscription(); if (sub) { await supabase?.rpc('delete_push_subscription', { p_endpoint: sub.endpoint }); await sub.unsubscribe() } } catch { /* ignore */ }
  return supabase?.auth.signOut()
}

// ---- Push-уведомления в шторку ----
const VAPID = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || ''
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
export type PushState = 'on' | 'off' | 'denied' | 'install' | 'unsupported'
export const pushState = async (): Promise<PushState> => {
  if (!VAPID) return 'unsupported'
  if (isIOS() && !standalone()) return 'install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off'
}
const key = (b64: string) => { const p = '='.repeat((4 - b64.length % 4) % 4), raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)) }
// ask=true — по нажатию кнопки (запрос разрешения); ask=false — тихо обновить подписку при открытии, если разрешение уже есть
export const enablePush = async (ask = true) => {
  const st = await pushState()
  if (st === 'install') throw new Error('На iPhone сначала установите приложение на экран «Домой» (Поделиться → На экран «Домой»), затем включите уведомления оттуда')
  if (st === 'unsupported') throw new Error('Этот браузер не поддерживает уведомления')
  if (st === 'denied') throw new Error('Уведомления запрещены. Разрешите их для этого сайта в настройках телефона/браузера')
  if (!ask && Notification.permission !== 'granted') return
  if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') throw new Error('Вы не разрешили уведомления')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(VAPID) })
  const j = sub.toJSON(), { error } = await supabase!.rpc('save_push_subscription', { p_endpoint: sub.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth })
  if (error) throw new Error('Не удалось включить уведомления. Попробуйте ещё раз.')
}
