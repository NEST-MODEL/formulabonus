import { supabase } from './lib'
const S = supabase!
export type Tx = { id: string; kind: string; text: string; amount: number; date: string }
export type Reward = { id: string; title: string; price: number; pct: number; active?: boolean }
export type Promo = { id: string; title: string; body: string; active: boolean }
export type Snap = { phone: string; promos: Promo[]; name: string; code: string; balance: number; expiring: { amount: number; days: number } | null; daysLeft: number | null; tx: Tx[]; rewards: Reward[] }
export type Preview = { code: string; client: string; balance: number; reward: string; price: number; bonus: number }
const DAY = 864e5
export const fmt = (t: string | number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
const ok = <T,>(r: { data: T; error: any }) => { if (r.error) throw new Error(r.error.message); return r.data }
const rw = (x: any): Reward => ({ id: x.id, title: x.title, price: x.price, pct: x.max_bonus_pct, active: x.active })
const exp14 = (b: { r: number; exp: number }[]) => {
  const n = b.filter(x => x.exp - Date.now() <= 14 * DAY)
  return n.length ? { amount: n.reduce((s, x) => s + x.r, 0), days: Math.max(0, Math.ceil((Math.min(...n.map(x => x.exp)) - Date.now()) / DAY)) } : null
}
export const api = {
  signIn: (email: string, password: string) => S.auth.signInWithPassword({ email, password }).then(r => { if (r.error) throw new Error('Неверная почта или пароль') }),
  signUp: (name: string, phone: string, email: string, password: string, ref: string) =>
    S.auth.signUp({ email, password, options: { data: { full_name: name, phone, ref } } }).then(r => { if (r.error) throw new Error(r.error.message); if (!r.data.session) throw new Error('Отключите Confirm email в Supabase (Auth → Providers → Email)') }),
  role: async () => { const { data: { user } } = await S.auth.getUser(); if (!user) return null; const { data } = await S.from('profiles').select('role').eq('id', user.id).single(); return (data?.role as string) ?? 'client' },
  snap: async (): Promise<Snap> => {
    const { data: { user } } = await S.auth.getUser(), id = user!.id
    const [p, w, t, m, r, pr, b] = await Promise.all([
      S.from('profiles').select('full_name,phone,referral_code').eq('id', id).single(),
      S.from('bonus_wallets').select('balance').eq('client_id', id).maybeSingle(),
      S.from('bonus_transactions').select('id,kind,amount,note,created_at').eq('client_id', id).order('created_at', { ascending: false }).limit(30),
      S.from('memberships').select('ends_on').eq('client_id', id).eq('status', 'active').order('ends_on', { ascending: false }).limit(1),
      S.from('rewards').select('id,title,price,max_bonus_pct,active').eq('active', true),
      S.from('promos').select('id,title,body,active').eq('active', true).order('created_at', { ascending: false }),
      S.from('bonus_transactions').select('remaining,expires_at').eq('client_id', id).gt('remaining', 0).gt('expires_at', new Date().toISOString())])
    const end = m.data?.[0]?.ends_on
    return { phone: p.data?.phone ?? '', promos: (pr.data ?? []) as Promo[], name: p.data?.full_name ?? '', code: p.data?.referral_code ?? '', balance: w.data?.balance ?? 0,
      expiring: exp14((b.data ?? []).map((x: any) => ({ r: x.remaining, exp: +new Date(x.expires_at) }))),
      daysLeft: end ? Math.ceil((+new Date(end) - Date.now()) / DAY) : null,
      tx: (t.data ?? []).map((x: any) => ({ id: x.id, kind: x.kind, text: x.note ?? x.kind, amount: x.amount, date: fmt(x.created_at) })),
      rewards: (r.data ?? []).map(rw) }
  },
  redeem: async (id: string) => ok(await S.rpc('create_redemption', { p_reward: id })) as string,
  status: async (c: string) => { const { data } = await S.from('redemptions').select('status,bonus_used').eq('code', c).order('created_at', { ascending: false }).limit(1).maybeSingle(); return { status: data?.status ?? 'pending', used: data?.bonus_used ?? 0 } },
  preview: async (c: string): Promise<Preview> => {
    const { data, error } = await S.from('redemptions').select('code,client_id,rewards(title,price,max_bonus_pct),profiles!client_id(full_name)').eq('code', c.trim().toUpperCase()).eq('status', 'pending').gt('expires_at', new Date().toISOString()).single()
    if (error || !data) throw new Error('Код не найден или уже использован')
    const d: any = data, { data: w } = await S.from('bonus_wallets').select('balance').eq('client_id', d.client_id).maybeSingle(), balance = w?.balance ?? 0
    return { code: d.code, client: d.profiles?.full_name ?? '—', balance, reward: d.rewards.title, price: d.rewards.price, bonus: Math.min(Math.floor(d.rewards.price * d.rewards.max_bonus_pct / 100), balance) }
  },
  confirm: async (c: string) => ok(await S.rpc('confirm_redemption', { p_code: c.trim().toUpperCase() })) as number,
  // ---- admin ----
  stats: async () => ok(await S.rpc('admin_stats')) as any,
  expMemberships: async () => ok(await S.from('memberships').select('ends_on,plan,profiles(full_name,phone)').eq('status', 'active').lte('ends_on', new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10)).order('ends_on')) as any[],
  expBonus: async () => ok(await S.from('bonus_transactions').select('remaining,expires_at,profiles!client_id(full_name,phone)').gt('remaining', 0).gt('expires_at', new Date().toISOString()).lte('expires_at', new Date(Date.now() + 14 * DAY).toISOString()).order('expires_at')) as any[],
  clients: async (q: string) => {
    let s = S.from('profiles').select('id,full_name,phone,referral_code').eq('role', 'client').order('created_at', { ascending: false }).limit(30)
    if (q.trim()) s = s.or(`full_name.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%`)
    const list = ok(await s) as any[], w = ok(await S.from('bonus_wallets').select('client_id,balance').in('client_id', list.map(x => x.id))) as any[]
    return list.map(x => ({ ...x, balance: w.find(y => y.client_id === x.id)?.balance ?? 0 }))
  },
  sell: async (client: string, plan: string, price: number, days: number) => ok(await S.rpc('sell_membership', { p_client: client, p_plan: plan, p_price: price, p_days: days })) as number,
  accrue: async (client: string, purchase: number) => ok(await S.rpc('accrue_bonus', { p_client: client, p_purchase: purchase, p_pct: 5, p_note: 'Покупка в клубе' })) as number,
  allRewards: async () => (ok(await S.from('rewards').select('id,title,price,max_bonus_pct,active').order('title')) as any[]).map(rw),
  addReward: async (title: string, price: number, pct: number) => ok(await S.from('rewards').insert({ title, price, max_bonus_pct: pct })),
  updateReward: async (id: string, f: { title: string; price: number; max_bonus_pct: number; active: boolean }) => ok(await S.from('rewards').update(f).eq('id', id)),
  allPromos: async () => ok(await S.from('promos').select('id,title,body,active').order('created_at', { ascending: false })) as Promo[],
  addPromo: async (title: string, body: string) => ok(await S.from('promos').insert({ title, body })),
  updatePromo: async (id: string, f: { title: string; body: string; active: boolean }) => ok(await S.from('promos').update(f).eq('id', id)),
  toggleReward: async (id: string, active: boolean) => ok(await S.from('rewards').update({ active }).eq('id', id)),
  referrals: async () => ok(await S.from('referrals').select('status,created_at,confirmed_at,ref:profiles!referrer_id(full_name),nw:profiles!referred_id(full_name)').order('created_at', { ascending: false })) as any[],
  txs: async () => ok(await S.from('bonus_transactions').select('kind,amount,note,created_at,profiles!client_id(full_name)').order('created_at', { ascending: false }).limit(60)) as any[],
  expire: async () => ok(await S.rpc('run_expiry')) as number,
}
