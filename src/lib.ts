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
export const logout = () => { try { localStorage.removeItem(HAD) } catch { /* ignore */ } return supabase?.auth.signOut() }
