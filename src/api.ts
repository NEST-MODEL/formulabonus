import { supabase as sb } from './lib'
export type Tx = { id: string; kind: string; text: string; amount: number; date: string }
export type Reward = { id: string; title: string; price: number; pct: number }
export type Snap = { name: string; code: string; balance: number; expiring: { amount: number; days: number } | null; daysLeft: number | null; tx: Tx[]; rewards: Reward[] }
export type Preview = { code: string; client: string; balance: number; reward: string; price: number; bonus: number }
export type Status = { status: string; used: number }
const DAY = 864e5, fmt = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
const expiringOf = (b: { r: number; exp: number }[]) => {
  const near = b.filter(x => x.exp - Date.now() <= 14 * DAY)
  return near.length ? { amount: near.reduce((s, x) => s + x.r, 0), days: Math.max(0, Math.ceil((Math.min(...near.map(x => x.exp)) - Date.now()) / DAY)) } : null
}

// ---------- DEMO (localStorage) — используется, когда Supabase не подключён ----------
const K = 'fb-demo'
type St = { b: { r: number; exp: number }[]; tx: Tx[]; pend: Record<string, string>; done: Record<string, number> }
const R: Reward[] = [
  { id: '1', title: 'Шоколадка', price: 700, pct: 15 }, { id: '2', title: 'Протеиновый батончик', price: 1200, pct: 15 },
  { id: '3', title: 'Вода 0.75 л', price: 500, pct: 10 }, { id: '4', title: 'Продление абонемента', price: 22000, pct: 10 }]
const load = (): St => {
  const s = localStorage.getItem(K); if (s) return JSON.parse(s)
  const n = Date.now(), st: St = { b: [{ r: 1200, exp: n + 9 * DAY }, { r: 1100, exp: n + 80 * DAY }], pend: {}, done: {},
    tx: [{ id: 'a', kind: 'accrual', text: 'Покупка абонемента · 5%', amount: 1100, date: fmt(n - 10 * DAY) }, { id: 'b', kind: 'referral', text: 'Друг купил абонемент', amount: 1200, date: fmt(n - 20 * DAY) }] }
  localStorage.setItem(K, JSON.stringify(st)); return st
}
const save = (s: St) => localStorage.setItem(K, JSON.stringify(s))
const live = (s: St) => s.b.filter(x => x.r > 0 && x.exp > Date.now())
const bal = (s: St) => live(s).reduce((a, x) => a + x.r, 0)
const demoPrev = (code: string): Preview => {
  const s = load(), rid = s.pend[code]; if (!rid) throw new Error('Код не найден или уже использован')
  const r = R.find(x => x.id === rid)!, balance = bal(s)
  return { code, client: 'Айдана К.', balance, reward: r.title, price: r.price, bonus: Math.min(Math.floor(r.price * r.pct / 100), balance) }
}
const demo = {
  role: async () => 'demo' as string | null,
  snap: async (): Promise<Snap> => { const s = load(); return { name: 'Айдана К.', code: 'AIDANA-7Q', balance: bal(s), expiring: expiringOf(live(s)), daysLeft: 7, tx: s.tx, rewards: R } },
  redeem: async (id: string) => { const s = load(), c = 'FB-' + Math.random().toString(36).slice(2, 8).toUpperCase(); s.pend[c] = id; save(s); return c },
  status: async (c: string): Promise<Status> => { const s = load(); return s.pend[c] ? { status: 'pending', used: 0 } : { status: 'done', used: s.done[c] ?? 0 } },
  preview: async (c: string) => demoPrev(c.trim().toUpperCase()),
  confirm: async (c: string) => {
    c = c.trim().toUpperCase(); const p = demoPrev(c), s = load(); let left = p.bonus
    for (const x of live(s).sort((a, b) => a.exp - b.exp)) { const t = Math.min(x.r, left); x.r -= t; left -= t }  // FIFO: сгорают раньше — списываются раньше
    s.tx.unshift({ id: c, kind: 'redeem', text: p.reward, amount: -p.bonus, date: fmt(Date.now()) }); s.done[c] = p.bonus; delete s.pend[c]; save(s); return p.bonus
  },
  accrue: async (purchase: number) => { const s = load(), a = Math.floor(purchase * 0.05); s.b.push({ r: a, exp: Date.now() + 90 * DAY }); s.tx.unshift({ id: String(Date.now()), kind: 'accrual', text: `Покупка ${purchase} ₸ · 5%`, amount: a, date: fmt(Date.now()) }); save(s); return a },
  reset: () => localStorage.removeItem(K),
}

// ---------- SUPABASE (реальная БД, RPC) ----------
const S = () => sb!
const real = {
  role: async () => { const { data: { user } } = await S().auth.getUser(); if (!user) return null; const { data } = await S().from('profiles').select('role').eq('id', user.id).single(); return (data?.role as string) ?? 'client' },
  snap: async (): Promise<Snap> => {
    const { data: { user } } = await S().auth.getUser(), id = user!.id
    const [p, w, t, m, r, b] = await Promise.all([
      S().from('profiles').select('full_name,referral_code').eq('id', id).single(),
      S().from('bonus_wallets').select('balance').eq('client_id', id).maybeSingle(),
      S().from('bonus_transactions').select('id,kind,amount,note,created_at').eq('client_id', id).order('created_at', { ascending: false }).limit(30),
      S().from('memberships').select('ends_on').eq('client_id', id).eq('status', 'active').order('ends_on', { ascending: false }).limit(1),
      S().from('rewards').select('id,title,price,max_bonus_pct').eq('active', true),
      S().from('bonus_transactions').select('remaining,expires_at').eq('client_id', id).gt('remaining', 0).gt('expires_at', new Date().toISOString())])
    const end = m.data?.[0]?.ends_on
    return { name: p.data?.full_name ?? 'Клиент', code: p.data?.referral_code ?? '', balance: w.data?.balance ?? 0,
      expiring: expiringOf((b.data ?? []).map((x: any) => ({ r: x.remaining, exp: +new Date(x.expires_at) }))),
      daysLeft: end ? Math.ceil((+new Date(end) - Date.now()) / DAY) : null,
      tx: (t.data ?? []).map((x: any) => ({ id: x.id, kind: x.kind, text: x.note ?? x.kind, amount: x.amount, date: fmt(+new Date(x.created_at)) })),
      rewards: (r.data ?? []).map((x: any) => ({ id: x.id, title: x.title, price: x.price, pct: x.max_bonus_pct })) }
  },
  redeem: async (id: string) => { const { data, error } = await S().rpc('create_redemption', { p_reward: id }); if (error) throw error; return data as string },
  status: async (c: string): Promise<Status> => { const { data } = await S().from('redemptions').select('status,bonus_used').eq('code', c).single(); return { status: data?.status ?? 'pending', used: data?.bonus_used ?? 0 } },
  preview: async (c: string): Promise<Preview> => {
    const { data, error } = await S().from('redemptions').select('code,client_id,rewards(title,price,max_bonus_pct),profiles!client_id(full_name)').eq('code', c.trim().toUpperCase()).eq('status', 'pending').single()
    if (error || !data) throw new Error('Код не найден или уже использован')
    const d: any = data, { data: w } = await S().from('bonus_wallets').select('balance').eq('client_id', d.client_id).maybeSingle(), balance = w?.balance ?? 0
    return { code: d.code, client: d.profiles?.full_name ?? '—', balance, reward: d.rewards.title, price: d.rewards.price, bonus: Math.min(Math.floor(d.rewards.price * d.rewards.max_bonus_pct / 100), balance) }
  },
  confirm: async (c: string) => { const { data, error } = await S().rpc('confirm_redemption', { p_code: c.trim().toUpperCase() }); if (error) throw error; return data as number },
  accrue: async (_p: number): Promise<number> => { throw new Error('Начисление через БД — Этап 4') },
  reset: () => {},
}
export const api = sb ? real : demo
