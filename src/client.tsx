import { useEffect, useState } from 'react'
import { Gift, History, Home, ShoppingBag, Star, User } from 'lucide-react'
import { api, dmy, Snap } from './api'
import { kzt, maxBonus, N } from './lib'
import { Badge, Btn, Card, cx, Empty, Shell, toast, useAsync } from './ui'

export default function Client() {
  const [s, load] = useAsync<Snap>(api.snap, 3000), [rf] = useAsync(api.myRefs, 10000), [tab, setTab] = useState('home'), [flt, setFlt] = useState('all')
  const [code, setCode] = useState<string | null>(null), [st, setSt] = useState({ status: 'pending', used: 0 })
  useEffect(() => { if (!code || st.status === 'done') return; const t = setInterval(() => api.status(code).then(x => { setSt(x); if (x.status === 'done') load() }), 1500); return () => clearInterval(t) }, [code, st.status, load])
  useEffect(() => { api.expireMine().then(load).catch(() => {}) }, []) // eslint-disable-line
  if (!s) return <div className="p-8 text-center text-mute">Загрузка…</div>
  const pend = s.batches.some(b => b.pending), first = s.batches.filter(b => b.expires).sort((a, b) => +new Date(a.expires!) - +new Date(b.expires!))[0]
  const copy = () => { navigator.clipboard?.writeText(s.code); toast('Код скопирован') }
  const Row = ({ h }: { h: Snap['tx'][0] }) => <div className="flex justify-between items-center border-t first:border-t-0 border-line px-4 py-3"><div><div className="font-medium">{h.text}</div><div className="text-xs text-mute">{h.date}{h.sub ? ' · ' + h.sub : ''}</div></div><b className={cx('text-[15px]', h.amount > 0 ? 'text-emerald-400' : '')}>{h.amount > 0 ? '+' : ''}{N(h.amount)}</b></div>
  const items: [string, string, any][] = [['home', 'Главная', Home], ['history', 'История', History], ['store', 'Магазин', ShoppingBag], ['profile', 'Профиль', User]]
  const conf = rf?.invited.filter(x => x.status === 'confirmed').length ?? 0, wait = (rf?.invited.length ?? 0) - conf
  return <Shell bottom items={items} cur={tab} set={k => { setTab(k); setCode(null) }} who={s.name || 'Клиент'}>
    {tab === 'home' && <div className="space-y-4 max-w-2xl">
      <div><h1 className="text-2xl font-semibold tracking-tight">Привет, {s.name}</h1><div className="text-mute mt-0.5">Копи бонусы и возвращайся за выгодой</div></div>
      <Card><div className="flex items-center gap-4 flex-wrap"><div className="w-12 h-12 rounded-lg border border-gold/40 bg-gold/10 grid place-items-center text-gold"><Star size={22} /></div>
        <div className="flex-1"><div className="text-xs text-mute">Баланс</div><div className="text-3xl font-semibold">{N(s.balance)} <span className="text-base font-normal text-mute">бонусов</span></div>{pend && <div className="text-gold text-[13px] mt-0.5">Бонусы активируются при первом использовании</div>}{first && <div className="text-gold text-[13px] mt-0.5">Действуют до: {dmy(first.expires!)} · Осталось: {first.days} дн.</div>}</div><Btn onClick={() => setTab('store')}>Обменять</Btn></div></Card>
      {s.batches.length > 0 && <Card title="Мои бонусы" pad={false}>{s.batches.map(b => <div key={b.id} className="border-t first:border-t-0 border-line px-4 py-3"><div className="font-medium">{N(b.amount)} · {b.label}</div><div className="text-xs text-mute">{b.pending ? 'Активируются при первом использовании' : `Действуют до ${dmy(b.expires!)} · осталось ${b.days} дн.`}</div></div>)}</Card>}
      <Card pad={false}><div className="px-4 py-3 flex justify-between items-center"><div><div className="font-medium">{s.daysLeft !== null ? `Абонемент заканчивается через ${s.daysLeft} дн.` : 'Нет активного абонемента'}</div><div className="text-xs text-mute">{s.daysLeft !== null ? 'Продлите — Bonus покроют до 10%' : 'Оформите у администратора и получите 5% Bonus'}</div></div>{s.daysLeft !== null && <Btn v="secondary" onClick={() => setTab('store')}>Продлить</Btn>}</div></Card>
      <Card title="Пригласи друга — +2 000 бонусов"><div className="space-y-3"><div className="text-mute text-[13px]">+2 000 бонусов за приглашение друга. Начисляются вам после первой покупки абонемента другом.</div>
        <div className="flex items-center gap-2"><div className="h-9 flex-1 rounded-lg border border-line bg-bg px-3 grid items-center font-semibold tracking-widest">{s.code}</div><Btn onClick={copy}>Скопировать</Btn></div>
        {rf && <div className="flex gap-2 text-[13px]"><Badge t="green">Подтверждено: {conf}</Badge><Badge>Ждут покупки: {wait}</Badge></div>}
        {rf?.asFriend === 'pending' && <div className="text-[13px] text-gold">Вы пришли по приглашению друга.</div>}</div></Card>
      {s.promos.length > 0 && <Card title="Акции" pad={false}>{s.promos.map(p => <div key={p.id} className="border-t first:border-t-0 border-line px-4 py-3 flex justify-between gap-3"><div><div className="font-medium">{p.title}</div><div className="text-[13px] text-mute">{p.body}</div></div>{p.value && <Badge t="gold">{p.value}</Badge>}</div>)}</Card>}
      <Card title="Последние действия" action={<Btn v="ghost" onClick={() => setTab('history')}>Все</Btn>} pad={false}>{s.tx.slice(0, 3).map(h => <Row key={h.id} h={h} />)}{!s.tx.length && <Empty>Операций пока нет</Empty>}</Card></div>}
    {tab === 'history' && <div className="max-w-2xl space-y-3"><h1 className="text-2xl font-semibold tracking-tight">История</h1>
      <div className="flex gap-1.5">{[['all', 'Все'], ['in', 'Начисления'], ['out', 'Списания']].map(([k, l]) => <Btn key={k} v={flt === k ? 'primary' : 'secondary'} onClick={() => setFlt(k)}>{l}</Btn>)}</div>
      <Card pad={false}>{s.tx.filter(h => flt === 'all' || (flt === 'in' ? h.amount > 0 : h.amount < 0)).map(h => <Row key={h.id} h={h} />)}{!s.tx.length && <Empty>Операций пока нет</Empty>}</Card></div>}
    {tab === 'store' && <div className="max-w-2xl space-y-3"><div className="flex justify-between items-center"><h1 className="text-2xl font-semibold tracking-tight">Магазин</h1><Badge t="gold">{N(s.balance)} Bonus</Badge></div>
      {code ? <Card><div className="text-center py-6">{st.status === 'done' ? <><div className="text-emerald-400 text-xl font-semibold">Списано {N(st.used)} Bonus</div><div className="text-mute text-[13px] mt-1">Баланс и история обновлены</div></> : <><div className="text-mute">Назовите код сотруднику</div><div className="text-6xl font-semibold tracking-[0.25em] text-gold my-4">{code}</div><div className="text-mute text-[13px]">Ждём подтверждения…</div></>}<Btn v="secondary" className="mt-6" onClick={() => setCode(null)}>Назад в магазин</Btn></div></Card>
        : <div className="grid sm:grid-cols-2 gap-3">{s.rewards.map(r => <div key={r.id} className="bg-surface border border-line rounded-xl p-4 flex flex-col gap-2"><Gift size={18} className="text-gold" /><div className="font-medium">{r.title}</div><div className="text-[13px] text-mute">{kzt(r.price)} · Bonus покроют до {kzt(maxBonus(r.price, r.pct))}</div>
          <Btn className="mt-1 w-full" onClick={() => api.redeem(r.id).then(c => { setCode(c); setSt({ status: 'pending', used: 0 }) }).catch(e => toast(e.message, false))}>Обменять</Btn></div>)}</div>}</div>}
    {tab === 'profile' && <div className="max-w-md space-y-3"><h1 className="text-2xl font-semibold tracking-tight">Профиль</h1><Card pad={false}>{[['Имя', s.name], ['Телефон', s.phone || '—'], ['Код для друзей', s.code], ['Статус', 'Клиент']].map(([a, b]) => <div key={a} className="flex justify-between px-4 py-3 border-t first:border-t-0 border-line"><span className="text-mute">{a}</span><b className="font-medium">{b}</b></div>)}</Card><Btn className="w-full" onClick={copy}>Скопировать код для друга</Btn></div>}
  </Shell>
}
