import { useEffect, useRef, useState } from 'react'
import { ClipboardList, History, Home, ShoppingBag, Star, User } from 'lucide-react'
import { Orders, Shop } from './shop'
import { api, dmy, guessPlan, Snap } from './api'
import { kzt, maxBonus, N } from './lib'
import { Badge, Btn, Card, cx, Empty, Shell, toast, useAsync } from './ui'

const LBL: Record<string, string> = { new: 'оплата подтверждена', preparing: 'готовится', ready: 'готов, заберите на баре', done: 'выдан', cancelled: 'отменён' }
export default function Client() {
  const [s, load] = useAsync<Snap>(api.snap, 3000), [rf] = useAsync(api.myRefs, 10000), [tab, setTab] = useState('home'), [flt, setFlt] = useState('all'), [pl] = useAsync(api.plans), [lm] = useAsync(api.lastMembership), [sel, setSel] = useState(''), [ao] = useAsync(api.myOrders, 5000)
  const [code, setCode] = useState<string | null>(null), [st, setSt] = useState({ status: 'pending', used: 0 })
  useEffect(() => { if (!code || st.status === 'done') return; const t = setInterval(() => api.status(code).then(x => { setSt(x); if (x.status === 'done') load() }), 1500); return () => clearInterval(t) }, [code, st.status, load])
  const seen = useRef<Record<string, string>>({})
  useEffect(() => { ao?.forEach(o => { const p = seen.current[o.id]; if (p && p !== o.status) toast(`Заказ #${o.num}: ${LBL[o.status] ?? o.status}`); seen.current[o.id] = o.status }) }, [ao])
  useEffect(() => { api.expireMine().then(load).catch(() => {}) }, []) // eslint-disable-line
  if (!s) return <div className="p-8 text-center text-mute">Загрузка…</div>
  const plans = pl ?? [], cur = plans.length ? guessPlan(plans, lm ?? undefined) : undefined, chosen = plans.find(p => p.id === (sel || cur?.id)), cbonus = chosen ? Math.min(maxBonus(chosen.price, chosen.max_bonus_pct), s.balance) : 0
  const CodeCard = <Card><div className="text-center py-6">{st.status === 'done' ? <><div className="text-emerald-400 text-xl font-semibold">Готово · списано {N(st.used)} Bonus</div><div className="text-mute text-[13px] mt-1">Баланс, история и абонемент обновлены</div></> : <><div className="text-mute">Назовите код сотруднику</div><div className="text-6xl font-semibold tracking-[0.25em] text-gold my-4">{code}</div><div className="text-mute text-[13px]">Ждём подтверждения…</div></>}<Btn v="secondary" className="mt-6" onClick={() => setCode(null)}>Назад</Btn></div></Card>
  const pend = s.batches.some(b => b.pending), first = s.batches.filter(b => b.expires).sort((a, b) => +new Date(a.expires!) - +new Date(b.expires!))[0]
  const copy = () => { navigator.clipboard?.writeText(s.code); toast('Код скопирован') }
  const Row = ({ h }: { h: Snap['tx'][0] }) => <div className="flex justify-between items-center border-t first:border-t-0 border-line px-4 py-3"><div><div className="font-medium">{h.text}</div><div className="text-xs text-mute">{h.date}{h.sub ? ' · ' + h.sub : ''}</div></div><b className={cx('text-[15px]', h.amount > 0 ? 'text-emerald-400' : '')}>{h.amount > 0 ? '+' : ''}{N(h.amount)}</b></div>
  const items: [string, string, any][] = [['home', 'Главная', Home], ['history', 'История', History], ['store', 'Магазин', ShoppingBag], ['orders', 'Заказы', ClipboardList], ['profile', 'Профиль', User]]
  const conf = rf?.invited.filter(x => x.status === 'confirmed').length ?? 0, wait = (rf?.invited.length ?? 0) - conf
  return <Shell bottom items={items} cur={tab} set={k => { setTab(k); setCode(null) }} who={s.name || 'Клиент'}>
    {tab === 'home' && <div className="space-y-4 max-w-2xl">
      <div><h1 className="text-2xl font-semibold tracking-tight">Привет, {s.name}</h1><div className="text-mute mt-0.5">Копи бонусы и возвращайся за выгодой</div></div>
      {ao?.filter(o => ['awaiting_payment', 'new', 'preparing', 'ready'].includes(o.status)).map(o => <button key={o.id} onClick={() => setTab('orders')} className="w-full text-left rounded-xl border border-gold/40 bg-gold/5 px-4 py-3"><b>Заказ #{o.num}</b> · {o.status === 'ready' ? 'готов — заберите на баре' : o.status === 'preparing' ? 'готовится' : o.status === 'awaiting_payment' ? 'ожидает оплаты' : 'оплата подтверждена'}</button>)}
      <Card><div className="flex items-center gap-4 flex-wrap"><div className="w-12 h-12 rounded-lg border border-gold/40 bg-gold/10 grid place-items-center text-gold"><Star size={22} /></div>
        <div className="flex-1"><div className="text-xs text-mute">Баланс</div><div className="text-3xl font-semibold">{N(s.balance)} <span className="text-base font-normal text-mute">бонусов</span></div>{s.reserved > 0 && <div className="text-mute text-[13px] mt-0.5">Зарезервировано под заказ: {N(s.reserved)} Б</div>}{pend && <div className="text-gold text-[13px] mt-0.5">Бонусы активируются при первом использовании</div>}{first && <div className="text-gold text-[13px] mt-0.5">Действуют до: {dmy(first.expires!)} · Осталось: {first.days} дн.</div>}</div><Btn onClick={() => setTab('store')}>Обменять</Btn></div></Card>
      {s.batches.length > 0 && <Card title="Мои бонусы" pad={false}>{s.batches.map(b => <div key={b.id} className="border-t first:border-t-0 border-line px-4 py-3"><div className="font-medium">{N(b.amount)} · {b.label}</div><div className="text-xs text-mute">{b.pending ? 'Активируются при первом использовании' : `Действуют до ${dmy(b.expires!)} · осталось ${b.days} дн.`}</div></div>)}</Card>}
      <Card pad={false}><div className="px-4 py-3 flex justify-between items-center"><div><div className="font-medium">{s.daysLeft !== null ? `Абонемент заканчивается через ${s.daysLeft} дн.` : 'Нет активного абонемента'}</div><div className="text-xs text-mute">{s.daysLeft !== null ? 'Продлите — Bonus покроют до 10%' : 'Оформите у администратора и получите 5% Bonus'}</div></div><Btn v="secondary" onClick={() => setTab('renew')}>{s.daysLeft !== null ? 'Продлить' : 'Выбрать'}</Btn></div></Card>
      <Card title="Пригласи друга — +2 000 бонусов"><div className="space-y-3"><div className="text-mute text-[13px]">+2 000 бонусов за приглашение друга. Начисляются вам после первой покупки абонемента другом.</div>
        <div className="flex items-center gap-2"><div className="h-9 flex-1 rounded-lg border border-line bg-bg px-3 grid items-center font-semibold tracking-widest">{s.code}</div><Btn onClick={copy}>Скопировать</Btn></div>
        {rf && <div className="flex gap-2 text-[13px]"><Badge t="green">Подтверждено: {conf}</Badge><Badge>Ждут покупки: {wait}</Badge></div>}
        {rf?.asFriend === 'pending' && <div className="text-[13px] text-gold">Вы пришли по приглашению друга.</div>}</div></Card>
      {s.promos.length > 0 && <Card title="Акции" pad={false}>{s.promos.map(p => <div key={p.id} className="border-t first:border-t-0 border-line px-4 py-3 flex justify-between gap-3"><div><div className="font-medium">{p.title}</div><div className="text-[13px] text-mute">{p.body}</div></div>{p.value && <Badge t="gold">{p.value}</Badge>}</div>)}</Card>}
      <Card title="Последние действия" action={<Btn v="ghost" onClick={() => setTab('history')}>Все</Btn>} pad={false}>{s.tx.slice(0, 3).map(h => <Row key={h.id} h={h} />)}{!s.tx.length && <Empty>Операций пока нет</Empty>}</Card></div>}
    {tab === 'renew' && <div className="max-w-2xl space-y-3"><h1 className="text-2xl font-semibold tracking-tight">Продление абонемента</h1>
      {code ? CodeCard : <><div className="text-mute text-[13px]">Выберите срок — цена подставится автоматически. Bonus покроют часть стоимости.</div>
        <div className="grid sm:grid-cols-2 gap-3">{plans.map(p => <button key={p.id} onClick={() => setSel(p.id)} className={cx('text-left rounded-xl border p-4', chosen?.id === p.id ? 'border-gold bg-gold/5' : 'border-line bg-surface')}><div className="flex justify-between gap-2"><b className="font-medium">{p.name}</b>{cur?.id === p.id && <Badge t="gold">Ваш тариф</Badge>}</div><div className="text-xl font-semibold mt-1">{kzt(p.price)}</div><div className="text-xs text-mute mt-0.5">{p.days} дн. · Bonus покроют до {kzt(maxBonus(p.price, p.max_bonus_pct))} · {p.annual ? '+10 000 бонусов' : '+5% бонусов'}</div></button>)}</div>
        {chosen && <Card><div className="space-y-1.5">{[['Тариф', chosen.name], ['Цена', kzt(chosen.price)], ['Спишется Bonus', N(cbonus)]].map(([a, b]) => <div key={a} className="flex justify-between"><span className="text-mute">{a}</span><b className="font-medium">{b}</b></div>)}<div className="flex justify-between border-t border-line pt-2 mt-2"><span>К оплате</span><b className="text-gold text-lg">{kzt(chosen.price - cbonus)}</b></div>
          <Btn className="w-full mt-3" onClick={() => api.renew(chosen.id).then(c => { setCode(c); setSt({ status: 'pending', used: 0 }) }).catch(e => toast(e.message, false))}>Получить код продления</Btn></div></Card>}</>}</div>}
    {tab === 'history' && <div className="max-w-2xl space-y-3"><h1 className="text-2xl font-semibold tracking-tight">История</h1>
      <div className="flex gap-1.5">{[['all', 'Все'], ['in', 'Начисления'], ['out', 'Списания']].map(([k, l]) => <Btn key={k} v={flt === k ? 'primary' : 'secondary'} onClick={() => setFlt(k)}>{l}</Btn>)}</div>
      <Card pad={false}>{s.tx.filter(h => flt === 'all' || (flt === 'in' ? h.amount > 0 : h.amount < 0)).map(h => <Row key={h.id} h={h} />)}{!s.tx.length && <Empty>Операций пока нет</Empty>}</Card></div>}
    {tab === 'store' && <Shop s={s} goOrders={() => setTab('orders')} />}
    {tab === 'orders' && <Orders />}
    {tab === 'profile' && <div className="max-w-md space-y-3"><h1 className="text-2xl font-semibold tracking-tight">Профиль</h1><Card pad={false}>{[['Имя', s.name], ['Телефон', s.phone || '—'], ['Код для друзей', s.code], ['Статус', 'Клиент']].map(([a, b]) => <div key={a} className="flex justify-between px-4 py-3 border-t first:border-t-0 border-line"><span className="text-mute">{a}</span><b className="font-medium">{b}</b></div>)}</Card><Btn className="w-full" onClick={copy}>Скопировать код для друга</Btn></div>}
  </Shell>
}
