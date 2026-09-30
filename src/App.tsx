import { ReactNode, useCallback, useEffect, useState } from 'react'
import { api, fmt, Preview, Promo, Reward, Snap } from './api'
import { kzt, maxBonus, N, supabase } from './lib'

const inp = 'bg-bg border border-line rounded-xl px-4 py-3 w-full outline-none focus:border-gold'
const btn = 'bg-gold text-black rounded-xl px-5 py-3 font-bold disabled:opacity-40 active:scale-95 transition'
const ghost = 'border border-line rounded-xl px-4 py-2 text-sm hover:border-gold'
const Box = ({ children, t }: { children: ReactNode; t?: string }) => <div className="bg-card border border-line rounded-2xl p-5 space-y-3">{t && <div className="font-display text-sm text-gold">{t}</div>}{children}</div>
const Msg = ({ m }: { m: { ok: boolean; t: string } | null }) => m ? <div className={m.ok ? 'text-gold font-semibold' : 'text-red-400'}>{m.t}</div> : null
const Logo = () => <div className="flex items-center gap-2"><svg width="30" height="26" viewBox="0 0 30 26"><path d="M8 0h22l-3 6H14l-1 4h11l-3 6H11l-3 10H2z" fill="#FFD21F" /></svg><div className="font-display leading-none text-sm">FORMULA<br /><span className="text-gold">BONUS</span></div></div>
type M = { ok: boolean; t: string } | null
const run = (f: () => Promise<string>, set: (m: M) => void, after?: () => void) => f().then(t => { set({ ok: true, t }); after?.() }).catch(e => set({ ok: false, t: e.message }))
function useAsync<T>(f: () => Promise<T>, every = 0) {
  const [d, setD] = useState<T | null>(null), load = useCallback(() => { f().then(setD).catch(() => {}) }, []) // eslint-disable-line
  useEffect(() => { load(); if (!every) return; const t = setInterval(load, every); return () => clearInterval(t) }, [load, every])
  return [d, load] as const
}
const num = (v: string) => v.replace(/\D/g, '')

/* ---- оболочка: сайдбар на ПК, нижнее меню на телефоне ---- */
function Shell({ items, cur, set, who, children }: { items: [string, string, string][]; cur: string; set: (k: string) => void; who: string; children: ReactNode }) {
  return <div className="min-h-screen">
    <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 bg-card border-r border-line p-5 flex-col gap-1">
      <div className="mb-6"><Logo /></div>
      {items.map(([k, l, i]) => <button key={k} onClick={() => set(k)} className={`text-left px-4 py-3 rounded-xl font-semibold ${cur === k ? 'bg-gold text-black' : 'text-mute hover:text-white'}`}>{i}  {l}</button>)}
      <button onClick={() => supabase!.auth.signOut()} className="mt-auto text-left px-4 py-3 text-mute hover:text-white">⎋  Выйти ({who})</button>
    </aside>
    <header className="md:hidden flex justify-between items-center p-4 border-b border-line"><Logo /><button onClick={() => supabase!.auth.signOut()} className="text-mute text-sm">Выйти</button></header>
    <main className="md:ml-60 p-4 md:p-8 pb-28 md:pb-8 max-w-5xl">{children}</main>
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-line flex overflow-x-auto pb-[env(safe-area-inset-bottom)]">
      {items.map(([k, l, i]) => <button key={k} onClick={() => set(k)} className={`flex-1 min-w-[68px] py-3 text-[11px] font-semibold ${cur === k ? 'text-gold' : 'text-mute'}`}><div className="text-lg leading-none">{i}</div>{l}</button>)}
    </nav></div>
}

/* ---------------- КЛИЕНТ ---------------- */
function Client() {
  const [s, load] = useAsync<Snap>(api.snap, 3000), [tab, setTab] = useState('home'), [flt, setFlt] = useState('all')
  const [code, setCode] = useState<string | null>(null), [st, setSt] = useState({ status: 'pending', used: 0 }), [err, setErr] = useState('')
  useEffect(() => { if (!code || st.status === 'done') return; const t = setInterval(() => api.status(code).then(x => { setSt(x); if (x.status === 'done') load() }), 1500); return () => clearInterval(t) }, [code, st.status, load])
  if (!s) return <div className="p-8 text-center text-mute">Загрузка…</div>
  const Row = ({ h }: { h: Snap['tx'][0] }) => <div className="flex justify-between items-center bg-card border border-line rounded-2xl px-4 py-3"><div><div className="font-semibold">{h.text}</div><div className="text-xs text-mute">{h.date}</div></div><div className={`font-display ${h.amount > 0 ? 'text-gold' : 'text-red-400'}`}>{h.amount > 0 ? '+' : ''}{N(h.amount)}</div></div>
  const items: [string, string, string][] = [['home', 'Главная', '⌂'], ['history', 'История', '↺'], ['store', 'Магазин', '▣'], ['profile', 'Профиль', '☺']]
  return <Shell items={items} cur={tab} set={k => { setTab(k); setCode(null) }} who="клиент">
    {tab === 'home' && <div className="space-y-4">
      <h1 className="font-display text-2xl">Привет, {s.name}!</h1>
      <div className="bg-card border border-line rounded-3xl p-5 flex items-center gap-4 flex-wrap">
        <div className="w-16 h-16 rounded-full border-2 border-gold grid place-items-center text-gold text-2xl">★</div>
        <div className="flex-1"><div className="text-mute text-sm">Твои бонусы</div><div className="font-display text-4xl">{N(s.balance)}</div>{s.expiring && <div className="text-gold text-sm mt-1">{N(s.expiring.amount)} сгорят через {s.expiring.days} дн.</div>}</div>
        <button className={btn} onClick={() => setTab('store')}>Обменять бонусы →</button></div>
      <div className="grid md:grid-cols-2 gap-3">
        <Box>{s.daysLeft !== null ? <div className="font-semibold">Абонемент заканчивается через {s.daysLeft} дн.</div> : <div className="font-semibold">Нет активного абонемента — оформите у администратора и получите 5% Bonus</div>}<button className="text-gold text-sm underline" onClick={() => setTab('store')}>Продлить — Bonus покроют до 10%</button></Box>
        <Box><div className="font-semibold">Пригласите друга → получите 3 000 Bonus</div><button className="text-gold text-sm underline" onClick={() => navigator.clipboard?.writeText(s.code)}>Код: {s.code} — скопировать</button></Box></div>
      {s.promos.length > 0 && <div className="space-y-2"><div className="font-display text-sm text-gold">Акции</div>{s.promos.map(p => <Box key={p.id}><div className="font-semibold">{p.title}</div><div className="text-mute text-sm">{p.body}</div></Box>)}</div>}
      <div className="flex justify-between"><div className="font-display text-sm text-gold">Последние действия</div><button className="text-mute text-sm" onClick={() => setTab('history')}>Смотреть все →</button></div>
      <div className="space-y-2">{s.tx.slice(0, 3).map(h => <Row key={h.id} h={h} />)}</div></div>}
    {tab === 'history' && <div className="space-y-3"><h1 className="font-display text-2xl">История бонусов</h1>
      <div className="flex gap-2">{[['all', 'Все'], ['in', 'Начисления'], ['out', 'Списания']].map(([k, l]) => <button key={k} onClick={() => setFlt(k)} className={`px-4 py-2 rounded-xl text-sm font-semibold ${flt === k ? 'bg-gold text-black' : 'bg-card border border-line'}`}>{l}</button>)}</div>
      {s.tx.filter(h => flt === 'all' || (flt === 'in' ? h.amount > 0 : h.amount < 0)).map(h => <Row key={h.id} h={h} />)}{!s.tx.length && <div className="text-mute">Операций пока нет</div>}</div>}
    {tab === 'store' && <div className="space-y-3"><div className="flex justify-between items-center"><h1 className="font-display text-2xl">Магазин</h1><div className="bg-card border border-line rounded-xl px-4 py-2">★ {N(s.balance)}</div></div>
      {code ? <Box><div className="text-center py-6">{st.status === 'done' ? <><div className="text-gold font-display text-2xl">Списано {N(st.used)} Bonus ✓</div><div className="text-mute text-sm mt-1">Баланс и история обновлены</div></> : <><div className="text-mute">Назовите код сотруднику</div><div className="font-display text-6xl my-4 tracking-[0.3em] text-gold">{code}</div><div className="text-mute text-sm">Ждём подтверждения…</div></>}
        <button className={ghost + ' mt-6'} onClick={() => setCode(null)}>Назад в магазин</button></div></Box>
        : <>{err && <div className="text-red-400 text-sm">{err}</div>}<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{s.rewards.map(r => <div key={r.id} className="bg-card border border-line rounded-2xl p-5 flex flex-col gap-2"><div className="text-3xl">🎁</div><div className="font-semibold">{r.title}</div><div className="text-mute text-sm">{kzt(r.price)} · Bonus покроют до {kzt(maxBonus(r.price, r.pct))}</div>
          <button className={btn + ' mt-auto'} onClick={() => api.redeem(r.id).then(c => { setCode(c); setSt({ status: 'pending', used: 0 }); setErr('') }).catch(e => setErr(e.message))}>Обменять</button></div>)}</div></>}</div>}
    {tab === 'profile' && <div className="space-y-3 max-w-md"><h1 className="font-display text-2xl">Профиль</h1><Box>{[['Имя', s.name], ['Телефон', s.phone || '—'], ['Реферальный код', s.code], ['Статус', 'Клиент']].map(([a, b]) => <div key={a} className="flex justify-between"><span className="text-mute">{a}</span><b>{b}</b></div>)}</Box>
      <button className={btn + ' w-full'} onClick={() => navigator.clipboard?.writeText(s.code)}>Скопировать код для друга</button></div>}
  </Shell>
}

/* ---------------- АДМИН ---------------- */
function Dash() {
  const [s] = useAsync(api.stats), [ms] = useAsync(api.expMemberships), [bs, reload] = useAsync(api.expBonus), [m, setM] = useState<M>(null)
  const k = s ? [['Продления (30 дн.)', s.renewals], ['Повторные покупки', s.repeat], ['Рефералы (подтв.)', s.referrals], ['Вернувшиеся клиенты', s.returned], ['Доп. выручка (30 дн.)', kzt(s.revenue)], ['Bonus выдано / списано', `${N(s.issued)} / ${N(s.redeemed)}`]] : []
  return <div className="space-y-5"><div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{k.map(([l, v]) => <div key={l as string} className="bg-card border border-line rounded-2xl p-5"><div className="text-sm text-mute">{l}</div><div className="font-display text-2xl mt-2 text-gold">{v}</div></div>)}</div>
    <div className="grid lg:grid-cols-2 gap-4">
      <Box t="Абонемент заканчивается (14 дн.)">{ms?.length ? ms.map((x, i) => <div key={i} className="flex justify-between text-sm"><span>{x.profiles?.full_name} · {x.profiles?.phone ?? '—'}</span><b>{fmt(x.ends_on)}</b></div>) : <div className="text-mute text-sm">Нет</div>}</Box>
      <Box t="Bonus скоро сгорят (14 дн.)">{bs?.length ? bs.map((x, i) => <div key={i} className="flex justify-between text-sm"><span>{x.profiles?.full_name} · {N(x.remaining)}</span><b>{fmt(x.expires_at)}</b></div>) : <div className="text-mute text-sm">Нет</div>}
        <button className="text-sm underline text-gold" onClick={() => run(async () => `Сгорело партий: ${await api.expire()}`, setM, reload)}>Сжечь просроченные</button><Msg m={m} /></Box></div></div>
}
function Redeem() {
  const [code, setCode] = useState(''), [p, setP] = useState<Preview | null>(null), [m, setM] = useState<M>(null)
  useEffect(() => { if (code.length < 4) { setP(null); return } api.preview(code).then(x => { setP(x); setM(null) }).catch(e => { setP(null); setM({ ok: false, t: e.message }) }) }, [code])
  return <div className="max-w-lg"><Box t="Быстрое списание Bonus"><div className="text-mute text-sm">Введите 4-значный код клиента — данные найдутся сами</div>
    <input value={code} onChange={e => setCode(num(e.target.value).slice(0, 4))} inputMode="numeric" autoFocus className={inp + ' font-display text-4xl text-center tracking-[0.4em]'} placeholder="0000" />
    {p && <div className="bg-bg border border-line rounded-xl p-4 space-y-1"><div className="font-semibold">{p.client} · баланс {N(p.balance)} Bonus</div><div>{p.reward} — {kzt(p.price)}</div><div>Списать: <b className="text-gold">{N(p.bonus)} Bonus</b> · клиент доплачивает {kzt(p.price - p.bonus)}</div>
      <button className={btn + ' w-full mt-2'} onClick={() => run(async () => `Списано ${N(await api.confirm(code))} Bonus. Клиент доплачивает ${kzt(p.price - p.bonus)}`, setM, () => { setP(null); setCode('') })}>Списать</button></div>}<Msg m={m} /></Box></div>
}
function Clients() {
  const [q, setQ] = useState(''), [list, load] = useAsync(() => api.clients(q)), [sel, setSel] = useState<any>(null), [m, setM] = useState<M>(null)
  const [plan, setPlan] = useState('Абонемент 1 месяц'), [price, setPrice] = useState('22000'), [days, setDays] = useState('30'), [pur, setPur] = useState('')
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [q, load])
  return <div className="grid lg:grid-cols-2 gap-4"><Box t="Клиенты"><input className={inp} placeholder="Поиск по имени или телефону" value={q} onChange={e => setQ(e.target.value)} />
    {list?.map(c => <button key={c.id} onClick={() => { setSel(c); setM(null) }} className={`w-full text-left flex justify-between p-3 rounded-xl ${sel?.id === c.id ? 'bg-gold/15' : 'hover:bg-bg'}`}><span>{c.full_name}<span className="text-mute text-sm"> · {c.phone ?? 'без телефона'}</span></span><b className="text-gold">{N(c.balance)}</b></button>)}</Box>
    {sel ? <Box t={sel.full_name}><div className="text-sm text-mute">Баланс {N(sel.balance)} Bonus · код друга {sel.referral_code}</div><div className="font-semibold">Продать / продлить абонемент (+5% Bonus)</div>
      <input className={inp} value={plan} onChange={e => setPlan(e.target.value)} /><div className="flex gap-2"><input className={inp} value={price} onChange={e => setPrice(num(e.target.value))} placeholder="Цена ₸" /><input className={inp} value={days} onChange={e => setDays(num(e.target.value))} placeholder="Дней" /></div>
      <button className={btn} onClick={() => run(async () => `Абонемент оформлен, начислено ${N(await api.sell(sel.id, plan, +price, +days))} Bonus`, setM, load)}>Оформить</button>
      <div className="font-semibold pt-2">Начислить за покупку (+5%)</div><div className="flex gap-2"><input className={inp} value={pur} onChange={e => setPur(num(e.target.value))} placeholder="Сумма ₸" />
        <button className={btn} disabled={!pur} onClick={() => run(async () => `Начислено ${N(await api.accrue(sel.id, +pur))} Bonus`, setM, () => { setPur(''); load() })}>Начислить</button></div><Msg m={m} /></Box> : <Box><div className="text-mute">Выберите клиента слева</div></Box>}</div>
}
function RewardRow({ r, done }: { r: Reward; done: () => void }) {
  const [t, setT] = useState(r.title), [p, setP] = useState(String(r.price)), [pc, setPc] = useState(String(r.pct)), [m, setM] = useState<M>(null)
  const save = (active: boolean) => run(async () => { await api.updateReward(r.id, { title: t, price: +p, max_bonus_pct: Math.min(+pc, 100), active }); return 'Сохранено' }, setM, done)
  return <div className={`bg-card border border-line rounded-2xl p-4 grid md:grid-cols-[1fr_120px_90px_auto] gap-2 items-center ${r.active ? '' : 'opacity-50'}`}>
    <input className={inp} value={t} onChange={e => setT(e.target.value)} /><input className={inp} value={p} onChange={e => setP(num(e.target.value))} placeholder="Цена ₸" /><input className={inp} value={pc} onChange={e => setPc(num(e.target.value))} placeholder="% Bonus" />
    <div className="flex gap-2"><button className={btn + ' !py-2'} onClick={() => save(!!r.active)}>Сохранить</button><button className={ghost} onClick={() => save(!r.active)}>{r.active ? 'Скрыть' : 'Показать'}</button></div>{m && <div className="md:col-span-4"><Msg m={m} /></div>}</div>
}
function Store() {
  const [list, load] = useAsync(api.allRewards), [t, setT] = useState(''), [p, setP] = useState(''), [pc, setPc] = useState('10'), [m, setM] = useState<M>(null)
  return <div className="space-y-4"><div className="text-mute text-sm">Название, цену и максимальный % покрытия Bonus можно менять прямо в строке.</div>{list?.map(r => <RewardRow key={r.id + r.title + r.price + r.pct + r.active} r={r} done={load} />)}
    <Box t="Добавить товар"><div className="grid md:grid-cols-[1fr_120px_90px_auto] gap-2"><input className={inp} placeholder="Название" value={t} onChange={e => setT(e.target.value)} /><input className={inp} placeholder="Цена ₸" value={p} onChange={e => setP(num(e.target.value))} /><input className={inp} placeholder="% Bonus" value={pc} onChange={e => setPc(num(e.target.value))} />
      <button className={btn} disabled={!t || !p} onClick={() => run(async () => { await api.addReward(t, +p, Math.min(+pc, 100)); return 'Товар добавлен' }, setM, () => { setT(''); setP(''); load() })}>Добавить</button></div><Msg m={m} /></Box></div>
}
function PromoRow({ x, done }: { x: Promo; done: () => void }) {
  const [t, setT] = useState(x.title), [b, setB] = useState(x.body), [m, setM] = useState<M>(null)
  const save = (a: boolean) => run(async () => { await api.updatePromo(x.id, { title: t, body: b, active: a }); return 'Сохранено' }, setM, done)
  return <div className={`bg-card border border-line rounded-2xl p-4 space-y-2 ${x.active ? '' : 'opacity-50'}`}><input className={inp} value={t} onChange={e => setT(e.target.value)} /><input className={inp} value={b} onChange={e => setB(e.target.value)} />
    <div className="flex gap-2"><button className={btn + ' !py-2'} onClick={() => save(x.active)}>Сохранить</button><button className={ghost} onClick={() => save(!x.active)}>{x.active ? 'Скрыть' : 'Показать'}</button></div><Msg m={m} /></div>
}
function Promos() {
  const [l, load] = useAsync(api.allPromos), [t, setT] = useState(''), [b, setB] = useState('')
  return <div className="space-y-4">{l?.map(x => <PromoRow key={x.id + x.title + x.body + x.active} x={x} done={load} />)}
    <Box t="Новая акция"><input className={inp} placeholder="Заголовок" value={t} onChange={e => setT(e.target.value)} /><input className={inp} placeholder="Описание" value={b} onChange={e => setB(e.target.value)} />
      <button className={btn} disabled={!t} onClick={() => api.addPromo(t, b).then(() => { setT(''); setB(''); load() })}>Опубликовать</button></Box></div>
}
function Refs() { const [l] = useAsync(api.referrals); return <Box t="Рефералы">{l?.length ? l.map((x, i) => <div key={i} className="flex justify-between text-sm"><span>{x.ref?.full_name} → {x.nw?.full_name}</span><b className={x.status === 'confirmed' ? 'text-gold' : 'text-mute'}>{x.status === 'confirmed' ? 'Подтверждён ' + fmt(x.confirmed_at) : 'Ждёт покупки'}</b></div>) : <div className="text-mute">Пока нет</div>}</Box> }
function Txs() { const [l] = useAsync(api.txs, 5000); return <Box t="Транзакции (ledger)">{l?.map((x, i) => <div key={i} className="flex justify-between text-sm border-b border-line py-2"><span>{fmt(x.created_at)} · {x.profiles?.full_name} · {x.note ?? x.kind}</span><b className={x.amount > 0 ? 'text-gold' : 'text-red-400'}>{x.amount > 0 ? '+' : ''}{N(x.amount)}</b></div>)}</Box> }
function Admin() {
  const items: [string, string, string][] = [['dash', 'Обзор', '◫'], ['redeem', 'Списание', '⚡'], ['clients', 'Клиенты', '☺'], ['store', 'Магазин', '▣'], ['promos', 'Акции', '％'], ['refs', 'Рефералы', '⇄'], ['txs', 'Операции', '≡']]
  const V = { dash: Dash, redeem: Redeem, clients: Clients, store: Store, promos: Promos, refs: Refs, txs: Txs }, [k, setK] = useState('dash'), C = (V as any)[k]
  return <Shell items={items} cur={k} set={setK} who="админ"><h1 className="font-display text-2xl mb-5">{items.find(i => i[0] === k)![1]}</h1><C /></Shell>
}

/* ---------------- ВХОД ---------------- */
function Auth() {
  const [reg, setReg] = useState(false), [f, setF] = useState({ name: '', phone: '', email: '', pass: '', ref: '' }), [err, setErr] = useState('')
  const u = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  const go = () => (reg ? api.signUp(f.name, f.phone, f.email, f.pass, f.ref) : api.signIn(f.email, f.pass)).catch(e => setErr(e.message))
  return <div className="min-h-screen grid md:grid-cols-2">
    <div className="p-8 md:p-14 flex flex-col justify-center gap-6 bg-gradient-to-br from-card to-bg"><Logo />
      <h1 className="font-display text-3xl md:text-5xl leading-tight">Твои тренировки<br />приносят <span className="text-gold">бонусы</span></h1>
      <p className="text-mute max-w-md">Копи бонусы за тренировки, делай покупки в клубе и обменивай их на приятные скидки и подарки.</p></div>
    <div className="p-6 md:p-14 flex items-center"><div className="w-full max-w-sm mx-auto bg-card border border-line rounded-2xl p-6 space-y-3">
      <div className="font-display">{reg ? 'Регистрация' : 'Вход в Formula Bonus'}</div>
      {reg && <><input className={inp} placeholder="Имя" value={f.name} onChange={u('name')} /><input className={inp} placeholder="Телефон" value={f.phone} onChange={u('phone')} /></>}
      <input className={inp} placeholder="Почта" value={f.email} onChange={u('email')} /><input className={inp} type="password" placeholder="Пароль (мин. 6)" value={f.pass} onChange={u('pass')} />
      {reg && <input className={inp + ' uppercase'} placeholder="Код друга (необязательно)" value={f.ref} onChange={u('ref')} />}
      {err && <div className="text-red-400 text-sm">{err}</div>}<button className={btn + ' w-full'} onClick={go}>{reg ? 'Зарегистрироваться' : 'Войти'}</button>
      <button className="text-sm text-gold w-full" onClick={() => { setReg(!reg); setErr('') }}>{reg ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}</button></div></div></div>
}
export default function App() {
  const [role, setRole] = useState<string | null | undefined>(undefined)
  useEffect(() => { if (!supabase) return; const f = () => { api.role().then(setRole) }; f(); const { data } = supabase.auth.onAuthStateChange(f); return () => data.subscription.unsubscribe() }, [])
  if (!supabase) return <div className="max-w-md mx-auto mt-20 p-6 bg-card rounded-2xl">Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.</div>
  if (role === undefined) return <div className="p-8 text-center text-mute">Загрузка…</div>
  if (role === null) return <Auth />
  return role === 'client' ? <Client /> : <Admin />
}
