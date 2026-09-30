import { createClient } from '@supabase/supabase-js'
export const supabase = import.meta.env.VITE_SUPABASE_URL ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY) : null
export const kzt = (n: number) => n.toLocaleString('ru-RU') + ' ₸'
export const N = (n: number) => n.toLocaleString('ru-RU')
export const maxBonus = (price: number, pct: number) => Math.floor((price * pct) / 100)
