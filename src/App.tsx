import { ReactNode, useCallback, useEffect, useState } from 'react'
import { api, fmt, Preview, Snap } from './api'
import { kzt, maxBonus, N, supabase } from './lib'

const inp = 'border border-ink/20 rounded-xl px-4 py-3 w-full bg-white'
const btn = 'bg-volt text-white rounded-xl px-5 py-3 font-semibold disabled:opacity-40'
const Box = ({ children, t }: { children: ReactNode; t?: string }) => <div className="bg-white rounded-2xl p-5 space-y-3">{t && <div className="font-display">{t}</div>}{children}</div>
const Msg = ({ m }: { m: { ok: boolean; t: string } | null }) => m ? <div className={m.ok ? 'text-mint font-semibold' : 'text-red-600'}>{m.t}</div> : null
function useAsync<T>(f: () => Promise<T>, every = 0) {
  const [d, setD] = useState<T | null>(null), load = useCallback(() => { f().then(setD).catch(() => {}) }, []) // eslint-disable-line
  useEffect(() => { load(); if (!every) return; const t = setInterval(load, every); return () => clearInterval(t) }, [load, every])
  return [d, load] as const
}

/* ---------------- CLIENT ---------------- */
function Client() {
  const [s, load] = useAsync<Snap>(api.snap, 3000)
  const [tab, setTab] = useState<'home' | 'store' | 'history'>('home')
  const [code, setCode] = useState<string | null>(null), [st, setSt] = useState({ status: 'pending', used: 0 }), [err, setErr] = useState('')
  useEffect(() => { if (!code || st.status === 'done') return; const t = setInterval(() => api.status(code).then(x => { setSt(x); if (x.status === 'done') load() }), 1500); return () => clearInterval(t) }, [code, st.status, load])
  if (!s) return <div className="p-8 text-center">Загрузка…</div>
  const Card = ({ t, b, go, c }: { t: string; b: string; go?: () => void; c: string }) => <div className={`${c} rounded-2xl p-4`}><div className="font-semibold">{t}</div><button onClick={go} className="mt-2 text-sm font-bold underline">{b}</button></div>
  return (
    <div className="mx-auto max-w-sm min-h-[680px] bg-white rounded-[28px] shadow-xl overflow-hidden flex flex-col">
      <div className="flex-1 p-5 space-y-4 overflow-y-auto">
        <div className="bg-ink text-white rounded-2xl p-5">
          <div className="text-sm opacity-70">{s.name}, ваш баланс Bonus</div>
          <div className="font-display text-4xl mt-1">{N(s.balance)}</div>
          {s.expiring && <div className="text-amber text-sm mt-2">{N(s.expiring.amount)} сгорят через {s.expiring.days} дн.</div>}
        </div>
        {tab === 'home' && <>
          {s.expiring && <Card c="bg-amber/20" t={`У вас ${N(s.expiring.amount)} Bonus, которые скоро сгорят`} b="Потратить в магазине" go={() => setTab('store')} />}
          {s.daysLeft !== null ? <Card c="bg-volt/10" t={`Абонемент заканчивается через ${s.daysLeft} дн.`} b="Продлить — Bonus покроют до 10%" go={() => setTab('store')} /> : <Card c="bg-volt/10" t="У вас нет активного абонемента" b="Оформите его у администратора и получите 5% Bonus" />}
          <Card c="bg-mint/15" t="Пригласите друга → получите 3 000 Bonus" b={`Ваш код: ${s.code} (нажмите, чтобы скопировать)`} go={() => navigator.clipboard?.writeText(s.code)} />
        </>}
        {tab === 'store' && (code ? (
          <div className="text-center py-6">
            {st.status === 'done' ? <><div className="text-mint font-display text-xl">Списано {N(st.used)} Bonus</div><div className="text-sm text-ink/60 mt-1">Баланс и история обновлены</div></>
              : <><div className="text-sm">Покажите код сотруднику</div><div className="font-display text-3xl my-4 tracking-widest">{code}</div><div className="text-sm text-ink/50">Ждём подтверждения…</div></>}
            <button className="block mx-auto mt-6 text-volt font-semibold" onClick={() => setCode(null)}>Назад в магазин</button>
          </div>) : <>
          {err && <div className="text-red-600 text-sm">{err}</div>}
          {s.rewards.map(r => (
            <div key={r.id} className="border border-ink/10 rounded-2xl p-4">
              <div className="font-semibold">{r.title}</div>
              <div className="text-sm text-ink/60">{kzt(r.price)} · Bonus покроют до {kzt(maxBonus(r.price, r.pct))}</div>
              <button onClick={() => api.redeem(r.id).then(c => { setCode(c); setSt({ status: 'pending', used: 0 }); setErr('') }).catch(e => setErr(e.message))} className={btn + ' mt-3 !py-2'}>Получить код</button>
            </div>))}</>)}
        {tab === 'history' && (s.tx.length ? s.tx.map(h => (
          <div key={h.id} className="flex justify-between border-b border-ink/10 py-3">
            <div><div className="font-semibold">{h.text}</div><div className="text-xs text-ink/50">{h.date}</div></div>
            <div className={h.amount > 0 ? 'text-mint font-bold' : 'font-bold'}>{h.amount > 0 ? '+' : ''}{N(h.amount)}</div></div>)) : <div className="text-ink/50">Операций пока нет</div>)}
      </div>
      <nav className="grid grid-cols-3 border-t border-ink/10 text-sm font-semibold">
        {(['home', 'store', 'history'] as const).map(k => <button key={k} onClick={() => setTab(k)} className={`py-4 ${tab === k ? 'text-volt' : 'text-ink/50'}`}>{{ home: 'Главная', store: 'Formula Store', history: 'История' }[k]}</button>)}
      </nav></div>)
}

/* ---------------- ADMIN ---------------- */
const run = (f: () => Promise<string>, set: (m: { ok: boolean; t: string }) => void, after?: () => void) => f().then(t => { set({ ok: true, t }); after?.() }).catch(e => set({ ok: false, t: e.message }))

function Dash() {
  const [s] = useAsync(api.stats), [ms] = useAsync(api.expMemberships), [bs, reload] = useAsync(api.expBonus), [m, setM] = useState<any>(null)
  const k = s ? [['Продления (30 дн.)', s.renewals], ['Повторные покупки', s.repeat], ['Рефералы (подтв.)', s.referrals], ['Вернувшиеся клиенты', s.returned], ['Доп. выручка (30 дн.)', kzt(s.revenue)], ['Bonus выдано / списано', `${N(s.issued)} / ${N(s.redeemed)}`]] : []
  return <div className="space-y-5">
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{k.map(([l, v]) => <div key={l as string} className="bg-white rounded-2xl p-5"><div className="text-sm text-ink/60">{l}</div><div className="font-display text-2xl mt-2">{v}</div></div>)}</div>
    <div className="grid md:grid-cols-2 gap-5">
      <Box t="Абонемент заканчивается (14 дн.)">{ms?.length ? ms.map((x, i) => <div key={i} className="flex justify-between text-sm"><span>{x.profiles?.full_name} · {x.profiles?.phone ?? '—'}</span><b>{fmt(x.ends_on)}</b></div>) : <div className="text-ink/50 text-sm">Нет</div>}</Box>
      <Box t="Bonus скоро сгорят (14 дн.)">{bs?.length ? bs.map((x, i) => <div key={i} className="flex justify-between text-sm"><span>{x.profiles?.full_name} · {N(x.remaining)}</span><b>{fmt(x.expires_at)}</b></div>) : <div className="text-ink/50 text-sm">Нет</div>}
        <button className="text-sm underline" onClick={() => run(async () => `Сгорело партий: ${await api.expire()}`, setM, reload)}>Списать просроченные (сгорание)</button><Msg m={m} /></Box>
    </div></div>
}
function Redeem() {
  const [code, setCode] = useState(''), [p, setP] = useState<Preview | null>(null), [m, setM] = useState<any>(null)
  const find = () => api.preview(code).then(x => { setP(x); setM(null) }).catch(e => { setP(null); setM({ ok: false, t: e.message }) })
  return <div className="max-w-xl"><Box t="Быстрое списание Bonus">
    <div className="flex gap-2"><input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && find()} className={inp + ' uppercase'} placeholder="Код клиента, например FB-A1B2C3" /><button onClick={find} className={btn}>Найти</button></div>
    {p && <div className="bg-chalk rounded-xl p-4 space-y-1"><div className="font-semibold">{p.client} · баланс {N(p.balance)} Bonus</div><div>{p.reward} — {kzt(p.price)}</div>
      <div>Списать: <b>{N(p.bonus)} Bonus</b> · клиент доплачивает {kzt(p.price - p.bonus)}</div>
      <button className={btn + ' mt-2'} onClick={() => run(async () => { const n = await api.confirm(code); return `Списано ${N(n)} Bonus. Клиент доплачивает ${kzt(p.price - n)}` }, setM, () => { setP(null); setCode('') })}>Списать</button></div>}
    <Msg m={m} /></Box></div>
}
function Clients() {
  const [q, setQ] = useState(''), [list, load] = useAsync(() => api.clients(q)), [sel, setSel] = useState<any>(null), [m, setM] = useState<any>(null)
  const [plan, setPlan] = useState('Абонемент 1 месяц'), [price, setPrice] = useState('22000'), [days, setDays] = useState('30'), [pur, setPur] = useState('')
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [q, load])
  return <div className="grid md:grid-cols-2 gap-5">
    <Box t="Клиенты"><input className={inp} placeholder="Поиск по имени или телефону" value={q} onChange={e => setQ(e.target.value)} />
      {list?.map(c => <button key={c.id} onClick={() => { setSel(c); setM(null) }} className={`w-full text-left flex justify-between p-3 rounded-xl ${sel?.id === c.id ? 'bg-volt/10' : 'hover:bg-chalk'}`}><span>{c.full_name}<span className="text-ink/50 text-sm"> · {c.phone ?? 'без телефона'}</span></span><b>{N(c.balance)}</b></button>)}</Box>
    {sel ? <Box t={sel.full_name}><div className="text-sm text-ink/60">Баланс {N(sel.balance)} Bonus · код {sel.referral_code}</div>
      <div className="font-semibold">Продать / продлить абонемент (+5% Bonus)</div>
      <input className={inp} value={plan} onChange={e => setPlan(e.target.value)} /><div className="flex gap-2"><input className={inp} value={price} onChange={e => setPrice(e.target.value.replace(/\D/g, ''))} placeholder="Цена ₸" /><input className={inp} value={days} onChange={e => setDays(e.target.value.replace(/\D/g, ''))} placeholder="Дней" /></div>
      <button className={btn} onClick={() => run(async () => `Абонемент оформлен, начислено ${N(await api.sell(sel.id, plan, +price, +days))} Bonus`, setM, load)}>Оформить</button>
      <div className="font-semibold pt-2">Начислить за покупку (+5%)</div>
      <div className="flex gap-2"><input className={inp} value={pur} onChange={e => setPur(e.target.value.replace(/\D/g, ''))} placeholder="Сумма покупки ₸" />
        <button className={btn} disabled={!pur} onClick={() => run(async () => `Начислено ${N(await api.accrue(sel.id, +pur))} Bonus`, setM, () => { setPur(''); load() })}>Начислить</button></div><Msg m={m} /></Box> : <Box><div className="text-ink/50">Выберите клиента слева</div></Box>}
  </div>
}
function Store() {
  const [list, load] = useAsync(api.allRewards), [t, setT] = useState(''), [p, setP] = useState(''), [pc, setPc] = useState('10'), [m, setM] = useState<any>(null)
  return <div className="grid md:grid-cols-2 gap-5">
    <Box t="Товары и награды">{list?.map(r => <div key={r.id} className="flex justify-between items-center"><span className={r.active ? '' : 'text-ink/40 line-through'}>{r.title} · {kzt(r.price)} · до {r.pct}%</span>
      <button className="text-sm underline" onClick={() => api.toggleReward(r.id, !r.active).then(load)}>{r.active ? 'Скрыть' : 'Показать'}</button></div>)}</Box>
    <Box t="Добавить товар"><input className={inp} placeholder="Название" value={t} onChange={e => setT(e.target.value)} /><div className="flex gap-2"><input className={inp} placeholder="Цена ₸" value={p} onChange={e => setP(e.target.value.replace(/\D/g, ''))} /><input className={inp} placeholder="Макс. % Bonus" value={pc} onChange={e => setPc(e.target.value.replace(/\D/g, ''))} /></div>
      <button className={btn} disabled={!t || !p} onClick={() => run(async () => { await api.addReward(t, +p, Math.min(+pc, 100)); return 'Товар добавлен' }, setM, () => { setT(''); setP(''); load() })}>Добавить</button><Msg m={m} /></Box></div>
}
function Refs() {
  const [l] = useAsync(api.referrals)
  return <Box t="Рефералы">{l?.length ? l.map((x, i) => <div key={i} className="flex justify-between text-sm"><span>{x.ref?.full_name} → {x.nw?.full_name}</span><b className={x.status === 'confirmed' ? 'text-mint' : 'text-amber'}>{x.status === 'confirmed' ? 'Подтверждён ' + fmt(x.confirmed_at) : 'Ждёт покупки'}</b></div>) : <div className="text-ink/50">Пока нет</div>}</Box>
}
function Txs() {
  const [l] = useAsync(api.txs, 5000)
  return <Box t="Транзакции (ledger)">{l?.map((x, i) => <div key={i} className="flex justify-between text-sm border-b border-ink/5 py-1"><span>{fmt(x.created_at)} · {x.profiles?.full_name} · {x.note ?? x.kind}</span><b className={x.amount > 0 ? 'text-mint' : ''}>{x.amount > 0 ? '+' : ''}{N(x.amount)}</b></div>)}</Box>
}
function Admin() {
  const T = { dash: ['Dashboard', Dash], redeem: ['Списание', Redeem], clients: ['Клиенты', Clients], store: ['Магазин', Store], refs: ['Рефералы', Refs], txs: ['Транзакции', Txs] } as const
  const [k, setK] = useState<keyof typeof T>('dash'), V = T[k][1]
  return <div className="max-w-5xl mx-auto"><div className="flex gap-2 flex-wrap mb-5">{(Object.keys(T) as (keyof typeof T)[]).map(x => <button key={x} onClick={() => setK(x)} className={`px-4 py-2 rounded-full font-semibold ${k === x ? 'bg-ink text-white' : 'bg-white'}`}>{T[x][0]}</button>)}</div><V /></div>
}

/* ---------------- AUTH + APP ---------------- */
function Auth() {
  const [reg, setReg] = useState(false), [f, setF] = useState({ name: '', phone: '', email: '', pass: '', ref: '' }), [err, setErr] = useState('')
  const u = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  const go = () => (reg ? api.signUp(f.name, f.phone, f.email, f.pass, f.ref) : api.signIn(f.email, f.pass)).catch(e => setErr(e.message))
  return <div className="max-w-xs mx-auto mt-16 bg-white rounded-2xl p-6 space-y-3">
    <div className="font-display text-xl">Formula Bonus</div>
    {reg && <><input className={inp} placeholder="Имя" value={f.name} onChange={u('name')} /><input className={inp} placeholder="Телефон" value={f.phone} onChange={u('phone')} /></>}
    <input className={inp} placeholder="Почта" value={f.email} onChange={u('email')} /><input className={inp} type="password" placeholder="Пароль (мин. 6)" value={f.pass} onChange={u('pass')} />
    {reg && <input className={inp + ' uppercase'} placeholder="Код друга (необязательно)" value={f.ref} onChange={u('ref')} />}
    {err && <div className="text-red-600 text-sm">{err}</div>}
    <button className={btn + ' w-full'} onClick={go}>{reg ? 'Зарегистрироваться' : 'Войти'}</button>
    <button className="text-sm text-volt w-full" onClick={() => { setReg(!reg); setErr('') }}>{reg ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Регистрация'}</button></div>
}
export default function App() {
  const [role, setRole] = useState<string | null | undefined>(undefined)
  useEffect(() => { if (!supabase) return; const f = () => { api.role().then(setRole) }; f(); const { data } = supabase.auth.onAuthStateChange(f); return () => data.subscription.unsubscribe() }, [])
  if (!supabase) return <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-2xl">Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (см. README).</div>
  if (role === undefined) return <div className="p-8 text-center">Загрузка…</div>
  if (role === null) return <Auth />
  return <div className="min-h-screen p-4"><div className="flex justify-end max-w-5xl mx-auto mb-3"><button onClick={() => supabase!.auth.signOut()} className="px-4 py-2 rounded-full bg-white font-semibold text-sm">Выйти ({role === 'client' ? 'клиент' : 'админ'})</button></div>
    {role === 'client' ? <Client /> : <Admin />}</div>
}
