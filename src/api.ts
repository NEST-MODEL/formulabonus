import { supabase } from './lib'
const S = supabase!
export type Tx = { id: string; kind: string; text: string; amount: number; date: string }
export type Reward = { id: string; title: string; price: number; pct: number; active?: boolean }
export type Promo = { id: string; title: string; body: string; active: boolean; kind?: string; value?: string; ends_on?: string | null }
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
      S.from('promos').select('id,title,body,active,kind,value,ends_on').eq('active', true).order('created_at', { ascending: false }),
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
  stats: async (days = 30) => ok(await S.rpc('admin_stats', { p_days: days })) as any,
  expMemberships: async () => ok(await S.from('memberships').select('ends_on,plan,profiles(full_name,phone)').eq('status', 'active').lte('ends_on', new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10)).order('ends_on')) as any[],
  expBonus: async () => ok(await S.from('bonus_transactions').select('remaining,expires_at,profiles!client_id(full_name,phone)').gt('remaining', 0).gt('expires_at', new Date().toISOString()).lte('expires_at', new Date(Date.now() + 14 * DAY).toISOString()).order('expires_at')) as any[],
  clients: async () => {
    const list = ok(await S.from('profiles').select('id,full_name,phone,referral_code,created_at').eq('role', 'client').order('created_at', { ascending: false }).limit(500)) as any[], ids = list.map(x => x.id)
    const [w, m] = await Promise.all([S.from('bonus_wallets').select('client_id,balance').in('client_id', ids), S.from('memberships').select('client_id,starts_on,ends_on,status').in('client_id', ids)])
    return list.map(x => { const ms = (m.data ?? []).filter((y: any) => y.client_id === x.id), a = ms.find((y: any) => y.status === 'active')
      return { ...x, balance: (w.data ?? []).find((y: any) => y.client_id === x.id)?.balance ?? 0, purchases: ms.length, last: ms.map((y: any) => y.starts_on).sort().pop() ?? null, left: a ? Math.ceil((+new Date(a.ends_on) - Date.now()) / DAY) : null } })
  },
  clientDetail: async (id: string) => { const [m, t, r] = await Promise.all([S.from('memberships').select('plan,price,starts_on,ends_on,status').eq('client_id', id).order('starts_on', { ascending: false }), S.from('bonus_transactions').select('kind,amount,note,created_at').eq('client_id', id).order('created_at', { ascending: false }).limit(50), S.from('referrals').select('status,created_at,nw:profiles!referred_id(full_name)').eq('referrer_id', id)]); return { m: (m.data ?? []) as any[], t: (t.data ?? []) as any[], r: (r.data ?? []) as any[] } },
  series: async (days: number) => { const d = ok(await S.from('bonus_transactions').select('amount,created_at').gte('created_at', new Date(Date.now() - days * DAY).toISOString())) as any[], o: Record<string, any> = {}
    for (let i = days - 1; i >= 0; i--) { const k = new Date(Date.now() - i * DAY).toISOString().slice(0, 10); o[k] = { d: k, inn: 0, out: 0, n: 0 } }
    d.forEach(x => { const e = o[x.created_at.slice(0, 10)]; if (!e) return; e.n++; if (x.amount > 0) e.inn += x.amount; else e.out -= x.amount }); return Object.values(o) as { d: string; inn: number; out: number; n: number }[] },
  expiredCount: async () => { const { count } = await S.from('bonus_transactions').select('id', { count: 'exact', head: true }).gt('remaining', 0).lte('expires_at', new Date().toISOString()); return count ?? 0 },
  myRefs: async () => { const { data: { user } } = await S.auth.getUser(), id = user!.id; const [a, b] = await Promise.all([S.from('referrals').select('status').eq('referrer_id', id), S.from('referrals').select('status').eq('referred_id', id).maybeSingle()]); return { invited: (a.data ?? []) as { status: string }[], asFriend: b.data?.status as string | undefined } },
  sell: async (client: string, plan: string, price: number, days: number) => ok(await S.rpc('sell_membership', { p_client: client, p_plan: plan, p_price: price, p_days: days })) as number,
  accrue: async (client: string, purchase: number) => ok(await S.rpc('accrue_bonus', { p_client: client, p_purchase: purchase, p_pct: 5, p_note: 'Покупка в клубе' })) as number,
  allRewards: async () => (ok(await S.from('rewards').select('id,title,price,max_bonus_pct,active').order('title')) as any[]).map(rw),
  addReward: async (title: string, price: number, pct: number) => ok(await S.from('rewards').insert({ title, price, max_bonus_pct: pct })),
  updateReward: async (id: string, f: { title: string; price: number; max_bonus_pct: number; active: boolean }) => ok(await S.from('rewards').update(f).eq('id', id)),
  allPromos: async () => ok(await S.from('promos').select('id,title,body,active,kind,value,ends_on').order('created_at', { ascending: false })) as Promo[],
  addPromo: async (f: Partial<Promo>) => ok(await S.from('promos').insert(f)),
  updatePromo: async (id: string, f: Partial<Promo>) => ok(await S.from('promos').update(f).eq('id', id)),
  toggleReward: async (id: string, active: boolean) => ok(await S.from('rewards').update({ active }).eq('id', id)),
  referrals: async () => ok(await S.from('referrals').select('membership:memberships(price),status,created_at,confirmed_at,ref:profiles!referrer_id(full_name),nw:profiles!referred_id(full_name)').order('created_at', { ascending: false })) as any[],
  txs: async () => ok(await S.from('bonus_transactions').select('kind,amount,note,created_at,profiles!client_id(full_name,phone)').order('created_at', { ascending: false }).limit(500)) as any[],
  expire: async () => ok(await S.rpc('run_expiry')) as number,
}
