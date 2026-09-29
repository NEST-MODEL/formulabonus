import { useCallback, useEffect, useState } from 'react'
import { api, Preview, Snap } from './api'
import { kzt, maxBonus, supabase } from './lib'

function useSnap() {
  const [s, setS] = useState<Snap | null>(null)
  const load = useCallback(() => { api.snap().then(setS).catch(() => {}) }, [])
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t) }, [load])
  return [s, load] as const
}
const N = (n: number) => n.toLocaleString('ru-RU')

function Client() {
  const [s, load] = useSnap()
  const [tab, setTab] = useState<'home' | 'store' | 'history'>('home')
  const [code, setCode] = useState<string | null>(null)
  const [st, setSt] = useState({ status: 'pending', used: 0 })
  const [err, setErr] = useState('')
  useEffect(() => { if (!code || st.status === 'done') return; const t = setInterval(() => api.status(code).then(x => { setSt(x); if (x.status === 'done') load() }), 1500); return () => clearInterval(t) }, [code, st.status, load])
  if (!s) return <div className="p-8 text-center">Загрузка…</div>
  const get = (id: string) => api.redeem(id).then(c => { setCode(c); setSt({ status: 'pending', used: 0 }); setErr('') }).catch(e => setErr(e.message))
  return (
    <div className="mx-auto max-w-sm min-h-[680px] bg-white rounded-[28px] shadow-xl overflow-hidden flex flex-col">
      <div className="flex-1 p-5 space-y-4 overflow-y-auto">
        <div className="bg-ink text-white rounded-2xl p-5">
          <div className="text-sm opacity-70">Привет, {s.name}. Ваш баланс Bonus</div>
          <div className="font-display text-4xl mt-1">{N(s.balance)}</div>
          {s.expiring && <div className="text-amber text-sm mt-2">{N(s.expiring.amount)} сгорят через {s.expiring.days} дн.</div>}
        </div>
        {tab === 'home' && <>
          {s.expiring && <Card tone="amber" t={`У вас ${N(s.expiring.amount)} Bonus, которые скоро сгорят`} b="Потратить в магазине" go={() => setTab('store')} />}
          {s.daysLeft !== null && <Card tone="volt" t={`Абонемент заканчивается через ${s.daysLeft} дн.`} b="Продлить со скидкой Bonus" go={() => setTab('store')} />}
          <Card tone="mint" t="Пригласите друга → получите 3 000 Bonus" b={`Ваш код: ${s.code}`} go={() => navigator.clipboard?.writeText(s.code)} />
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
              <button onClick={() => get(r.id)} className="mt-3 bg-volt text-white rounded-xl px-4 py-2 font-semibold">Получить код</button>
            </div>))}</>)}
        {tab === 'history' && s.tx.map(h => (
          <div key={h.id} className="flex justify-between border-b border-ink/10 py-3">
            <div><div className="font-semibold">{h.text}</div><div className="text-xs text-ink/50">{h.date}</div></div>
            <div className={h.amount > 0 ? 'text-mint font-bold' : 'font-bold'}>{h.amount > 0 ? '+' : ''}{N(h.amount)}</div>
          </div>))}
      </div>
      <nav className="grid grid-cols-3 border-t border-ink/10 text-sm font-semibold">
        {(['home', 'store', 'history'] as const).map(k => (
          <button key={k} onClick={() => setTab(k)} className={`py-4 ${tab === k ? 'text-volt' : 'text-ink/50'}`}>{{ home: 'Главная', store: 'Formula Store', history: 'История' }[k]}</button>))}
      </nav>
    </div>)
}
function Card({ t, b, tone, go }: { t: string; b: string; tone: 'amber' | 'volt' | 'mint'; go?: () => void }) {
  const bg = { amber: 'bg-amber/20', volt: 'bg-volt/10', mint: 'bg-mint/15' }[tone]
  return <div className={`${bg} rounded-2xl p-4`}><div className="font-semibold">{t}</div><button onClick={go} className="mt-2 text-sm font-bold underline">{b}</button></div>
}

function Admin() {
  const [code, setCode] = useState('')
  const [p, setP] = useState<Preview | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [sum, setSum] = useState('')
  const find = () => api.preview(code).then(x => { setP(x); setMsg(null) }).catch(e => { setP(null); setMsg({ ok: false, t: e.message }) })
  const spend = () => api.confirm(code).then(n => { setMsg({ ok: true, t: `Списано ${N(n)} Bonus. Клиент доплачивает ${kzt(p!.price - n)}` }); setP(null); setCode('') }).catch(e => setMsg({ ok: false, t: e.message }))
  const accrue = () => api.accrue(+sum).then(a => { setMsg({ ok: true, t: `Начислено ${N(a)} Bonus (5%, действуют 90 дней)` }); setSum('') }).catch(e => setMsg({ ok: false, t: e.message }))
  const kpis = [['Продления за месяц', '38'], ['Повторные покупки', '124'], ['Рефералы (подтв.)', '17'], ['Вернувшиеся клиенты', '61']]
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{kpis.map(([l, v]) => (
        <div key={l} className="bg-white rounded-2xl p-5"><div className="text-sm text-ink/60">{l}</div><div className="font-display text-3xl mt-2">{v}</div></div>))}</div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 space-y-3">
          <div className="font-display">Быстрое списание</div>
          <div className="flex gap-2"><input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && find()} className="border border-ink/20 rounded-xl px-4 py-3 flex-1 uppercase" placeholder="Код клиента, например FB-A1B2C3" />
            <button onClick={find} className="bg-ink text-white rounded-xl px-5 font-semibold">Найти</button></div>
          {p && <div className="bg-chalk rounded-xl p-4 space-y-1">
            <div className="font-semibold">{p.client} · баланс {N(p.balance)} Bonus</div>
            <div>{p.reward} — {kzt(p.price)}</div>
            <div>Списать: <b>{N(p.bonus)} Bonus</b> · клиент платит {kzt(p.price - p.bonus)}</div>
            <button onClick={spend} className="mt-2 bg-volt text-white rounded-xl px-5 py-2 font-semibold">Списать</button></div>}
          {msg && <div className={msg.ok ? 'text-mint font-semibold' : 'text-red-600'}>{msg.t}</div>}
        </div>
        <div className="bg-white rounded-2xl p-6 space-y-3">
          <div className="font-display">Начисление Bonus</div>
          <div className="text-sm text-ink/60">Сумма подтверждённой покупки клиента</div>
          <div className="flex gap-2"><input value={sum} onChange={e => setSum(e.target.value.replace(/\D/g, ''))} className="border border-ink/20 rounded-xl px-4 py-3 flex-1" placeholder="22000" />
            <button onClick={accrue} disabled={!sum} className="bg-ink text-white rounded-xl px-5 font-semibold disabled:opacity-40">Начислить</button></div>
        </div>
      </div>
    </div>)
}

function Login() {
  const [e, setE] = useState(''), [p, setP] = useState(''), [err, setErr] = useState('')
  const go = () => supabase!.auth.signInWithPassword({ email: e, password: p }).then(({ error }) => error && setErr('Неверная почта или пароль'))
  return (<div className="max-w-xs mx-auto mt-24 bg-white rounded-2xl p-6 space-y-3">
    <div className="font-display text-xl">Formula Bonus</div>
    <input value={e} onChange={x => setE(x.target.value)} placeholder="Почта" className="border border-ink/20 rounded-xl px-4 py-3 w-full" />
    <input value={p} onChange={x => setP(x.target.value)} type="password" placeholder="Пароль" className="border border-ink/20 rounded-xl px-4 py-3 w-full" />
    {err && <div className="text-red-600 text-sm">{err}</div>}
    <button onClick={go} className="bg-volt text-white rounded-xl py-3 w-full font-semibold">Войти</button></div>)
}

export default function App() {
  const [role, setRole] = useState<string | null | undefined>(supabase ? undefined : 'demo')
  const [mode, setMode] = useState<'client' | 'admin'>('client')
  useEffect(() => {
    if (!supabase) return
    const f = () => { api.role().then(setRole) }; f()
    const { data } = supabase.auth.onAuthStateChange(f); return () => data.subscription.unsubscribe()
  }, [])
  if (role === undefined) return <div className="p-8 text-center">Загрузка…</div>
  if (role === null) return <Login />
  const staff = role === 'staff' || role === 'admin'
  return (<div className="min-h-screen p-4">
    <div className="flex gap-2 justify-center mb-6 flex-wrap">
      {role === 'demo' ? <>
        {(['client', 'admin'] as const).map(m => (<button key={m} onClick={() => setMode(m)} className={`px-5 py-2 rounded-full font-semibold ${mode === m ? 'bg-ink text-white' : 'bg-white'}`}>{m === 'client' ? 'Клиент (телефон)' : 'Сотрудник (ПК)'}</button>))}
        <button onClick={() => { api.reset(); location.reload() }} className="px-5 py-2 rounded-full bg-white text-ink/60">Сбросить демо</button></>
        : <button onClick={() => supabase!.auth.signOut()} className="px-5 py-2 rounded-full bg-white font-semibold">Выйти</button>}
    </div>
    {(role === 'demo' ? mode === 'admin' : staff) ? <Admin /> : <Client />}</div>)
}
