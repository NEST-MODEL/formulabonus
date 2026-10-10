import { useState } from 'react'
import { Check, Minus, Plus, ShoppingCart } from 'lucide-react'
import { api, Order, Snap } from './api'
import { kzt, maxBonus, N } from './lib'
import { Badge, Btn, Card, cx, Empty, Input, Modal, num, toast, useAsync } from './ui'
import { ScreenHead } from './home'

const STEPS: [string, string][] = [['awaiting_payment', 'Оплата'], ['new', 'Принят'], ['preparing', 'Готовится'], ['ready', 'Готов'], ['done', 'Выдан']]
export function Shop({ s, goOrders }: { s: Snap; goOrders: () => void }) {
  const [cats] = useAsync(api.cats), [cfg] = useAsync(api.setting, 10000), [cat, setCat] = useState('all'), [cart, setCart] = useState<Record<string, number>>({}), [open, setOpen] = useState(false)
  const [method, setMethod] = useState('kaspi'), [bon, setBon] = useState<string | null>(null), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const closed = cfg?.bar_open === '0'
  const lines = s.rewards.filter(r => cart[r.id]), count = lines.reduce((a, r) => a + cart[r.id], 0), total = lines.reduce((a, r) => a + r.price * cart[r.id], 0)
  const max = Math.min(lines.reduce((a, r) => a + maxBonus(r.price * cart[r.id], r.pct), 0), s.balance), bonus = Math.min(bon === null ? max : +bon || 0, max), cash = total - bonus
  const step = (id: string, d: number) => setCart(c => { const n = Math.max(0, Math.min(20, (c[id] ?? 0) + d)), x = { ...c }; if (n) x[id] = n; else delete x[id]; return x })
  const chips: [string, string][] = [['all', 'Все'], ...(cats ?? []).filter(c => s.rewards.some(r => r.cat === c.id)).map(c => [c.id, c.name] as [string, string]), ...(s.rewards.some(r => !r.cat) && (cats ?? []).length ? [['none', 'Другое'] as [string, string]] : [])]
  const shown = s.rewards.filter(r => cat === 'all' || (cat === 'none' ? !r.cat : r.cat === cat))
  const send = () => { setBusy(true); api.createOrder(lines.map(r => ({ id: r.id, qty: cart[r.id] })), method, bonus, note).then(o => { toast(`Заказ #${o.num} оформлен`); setCart({}); setOpen(false); setNote(''); setBon(null); goOrders() }).catch(e => toast(e.message, false)).finally(() => setBusy(false)) }
  const Radio = ({ k, l, d }: { k: string; l: string; d: string }) => <button onClick={() => setMethod(k)} className={cx('flex items-center gap-3 text-left rounded-lg border p-3', method === k ? 'border-gold bg-gold/5' : 'border-line')}><span className={cx('w-4 h-4 rounded-full border grid place-items-center', method === k ? 'border-gold' : 'border-mute')}>{method === k && <span className="w-2 h-2 rounded-full bg-gold" />}</span><span><div className="font-medium">{l}</div><div className="text-xs text-mute">{d}</div></span></button>
  return <div className="max-w-3xl space-y-3 pb-16">
    <div className="flex justify-between items-center"><h1 className="text-2xl font-semibold tracking-tight">Магазин</h1><Badge t="gold">{N(s.balance)} Bonus</Badge></div>
    {closed && <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-red-300 text-[13px]">Бар сейчас не принимает заказы</div>}
    {chips.length > 1 && <div className="flex gap-1.5 overflow-x-auto pb-1">{chips.map(([k, l]) => <Btn key={k} v={cat === k ? 'primary' : 'secondary'} onClick={() => setCat(k)}>{l}</Btn>)}</div>}
    <div className="grid sm:grid-cols-2 gap-3">{shown.map(r => <div key={r.id} className="bg-surface border border-line rounded-xl p-4 flex flex-col gap-1.5"><div className="font-medium">{r.title}</div>{r.desc && <div className="text-xs text-mute">{r.desc}</div>}
      <div className="text-[13px]"><b>{kzt(r.price)}</b> <span className="text-mute">· Bonus покроют до {kzt(maxBonus(r.price, r.pct))}</span></div>
      {cart[r.id] ? <div className="flex items-center gap-3 mt-1"><Btn v="secondary" className="!px-2" onClick={() => step(r.id, -1)}><Minus size={14} /></Btn><b className="w-5 text-center">{cart[r.id]}</b><Btn v="secondary" className="!px-2" onClick={() => step(r.id, 1)}><Plus size={14} /></Btn></div> : <Btn className="mt-1" disabled={closed} onClick={() => step(r.id, 1)}>В корзину</Btn>}</div>)}</div>
    {!shown.length && <Empty>В этой категории пока пусто</Empty>}
    {count > 0 && <button onClick={() => setOpen(true)} className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 md:left-[calc(50%+7rem)] z-40 bg-gold text-black rounded-xl h-11 px-5 font-semibold flex items-center gap-2 shadow-lg"><ShoppingCart size={16} />Корзина · {count} · {kzt(total)}</button>}
    {open && <Modal drawer title="Оформление заказа" onClose={() => setOpen(false)}>
      <div className="space-y-2">{lines.map(r => <div key={r.id} className="flex items-center justify-between gap-2"><div><div className="font-medium">{r.title}</div><div className="text-xs text-mute">{kzt(r.price)} × {cart[r.id]} = {kzt(r.price * cart[r.id])}</div></div><div className="flex items-center gap-2"><Btn v="secondary" className="!px-2" onClick={() => step(r.id, -1)}><Minus size={14} /></Btn><b>{cart[r.id]}</b><Btn v="secondary" className="!px-2" onClick={() => step(r.id, 1)}><Plus size={14} /></Btn></div></div>)}</div>
      <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Комментарий бармену (на молоке, без сахара…)" maxLength={200} />
      <div className="space-y-2"><div className="flex justify-between text-[13px]"><span className="text-mute">Ваши бонусы: {N(s.balance)} Б{s.reserved > 0 ? ` (зарезервировано ${N(s.reserved)})` : ''}</span><span className="text-mute">можно до {N(max)} Б</span></div>
        <div className="flex gap-2"><Input inputMode="numeric" value={String(bonus)} onChange={e => setBon(num(e.target.value))} /><Btn v="secondary" onClick={() => setBon('0')}>0</Btn><Btn v="secondary" onClick={() => setBon(String(max))}>Макс.</Btn></div></div>
      <div className="border border-line rounded-lg divide-y divide-line">{[['Товары', kzt(total)], ['Бонусами', '−' + N(bonus) + ' Б']].map(([a, b]) => <div key={a} className="flex justify-between px-3 py-2"><span className="text-mute">{a}</span><b className="font-medium">{b}</b></div>)}<div className="flex justify-between px-3 py-2.5"><span>К оплате</span><b className="text-gold text-lg">{kzt(cash)}</b></div></div>
      {cash > 0 ? <div className="grid gap-2"><div className="text-xs text-mute">Способ оплаты</div><Radio k="kaspi" l="Kaspi" d="Оплата по ссылке, затем «Я оплатил»" /><Radio k="cash" l="Наличными при получении" d="Оплатите на баре" /></div> : <div className="text-[13px] text-mute">Заказ полностью оплачивается бонусами — бармен подтвердит его.</div>}
      <div className="text-xs text-mute">Бонусы резервируются и списываются окончательно после подтверждения оплаты сотрудником.</div>
      <Btn className="w-full !h-10" disabled={busy || closed || !count} onClick={send}>Оформить заказ</Btn></Modal>}
  </div>
}
const status = (o: Order): [string, string] => o.status === 'cancelled' ? ['red', 'Отменён'] : o.status === 'done' ? ['green', '✓ Заказ выдан'] : o.status === 'ready' ? ['green', '✅ Заказ готов'] : o.status === 'preparing' ? ['gold', '🥤 Готовится']
  : o.status === 'new' ? ['green', '🟢 Оплата подтверждена'] : o.payment_status === 'awaiting_confirmation' ? ['gold', '🟡 Ожидаем подтверждения оплаты'] : o.pay_method === 'kaspi' ? ['gold', '🟡 Ожидаем оплату'] : ['gold', '🟡 Ожидает подтверждения']
function OrderCard({ o, cfg, reload }: { o: Order; cfg: Record<string, string>; reload: () => void }) {
  const [t, label] = status(o), idx = STEPS.findIndex(x => x[0] === o.status), bonus = o.paid ? o.bonus_used : o.bonus_planned, cash = o.paid ? o.cash_amount : o.total - o.bonus_planned
  const url = o.kaspi_payment_url || cfg.kaspi_payment_url || (import.meta.env.VITE_KASPI_PAYMENT_URL as string | undefined) || '', act = (f: Promise<any>, m: string) => f.then(() => { toast(m); reload() }).catch(e => toast(e.message, false))
  const wait = o.status === 'awaiting_payment'
  return <Card><div className="space-y-3">
    <div className="flex justify-between items-start gap-2"><div><div className="text-xl font-semibold">Заказ #{o.num}</div><div className="text-xs text-mute">{new Date(o.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div><Badge t={t as any}>{label}</Badge></div>
    {o.status !== 'cancelled' && <div className="flex gap-1">{STEPS.map(([k, l], i) => <div key={k} className="flex-1"><div className={cx('h-1 rounded', i <= idx ? 'bg-gold' : 'bg-line')} /><div className={cx('text-[10px] mt-1', i === idx ? 'text-gold font-medium' : 'text-mute')}>{l}</div></div>)}</div>}
    {o.status === 'ready' && <div className="rounded-lg bg-gold/10 text-gold px-3 py-2 font-medium">Заказ готов — заберите на баре{o.pay_method === 'kaspi' ? ' (покажите чек Kaspi бармену)' : ''}</div>}
    <div className="text-[13px] space-y-0.5">{o.order_items.map((i, k) => <div key={k} className="flex justify-between"><span>{i.title} ×{i.qty}</span><span className="text-mute">{kzt(i.price * i.qty)}</span></div>)}{o.comment && <div className="text-mute pt-1">«{o.comment}»</div>}</div>
    <div className="border-t border-line pt-2 text-[13px] space-y-0.5"><div className="flex justify-between"><span className="text-mute">Итого</span><span>{kzt(o.total)}</span></div><div className="flex justify-between"><span className="text-mute">Бонусами{wait ? ' (резерв)' : ''}</span><span>−{N(bonus)} Б</span></div><div className="flex justify-between font-semibold text-[15px]"><span>{o.paid ? 'Оплачено' : 'К оплате'}</span><span className="text-gold">{kzt(cash)}{o.pay_method === 'kaspi' ? ' Kaspi' : o.pay_method === 'cash' ? ' наличными' : ''}</span></div></div>
    {wait && o.pay_method === 'kaspi' && (o.payment_status === 'awaiting_confirmation'
      ? <div className="rounded-lg border border-gold/30 bg-gold/5 p-3 text-[13px]"><b className="text-gold">Оплата ожидает подтверждения</b><div className="text-mute mt-1">Мы проверим оплату и передадим заказ в работу. Заказ не потерян — статус обновится здесь.</div></div>
      : <div className="rounded-lg border border-line bg-bg p-3 text-[13px] space-y-3"><div><div className="font-medium">Оплата через Kaspi</div><div className="text-mute">К оплате:</div><div className="text-2xl font-semibold text-gold">{kzt(cash)}</div></div>
        <ol className="list-decimal pl-5 space-y-0.5 text-mute"><li>Нажмите «Перейти к оплате».</li><li>Откройте Kaspi.</li><li>Введите сумму {kzt(cash)}.</li><li>Проверьте получателя и оплатите.</li><li>Вернитесь в Formula Bonus и нажмите «Я оплатил».</li></ol><div className="text-xs text-mute">При получении заказа покажите чек бармену.</div>
        {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="h-10 rounded-lg bg-gold text-black font-semibold grid place-items-center">Перейти к оплате Kaspi</a> : <div className="text-red-300">Ссылка оплаты ещё не настроена — оплатите на баре.</div>}
        <Btn v="secondary" className="w-full !h-10" onClick={() => act(api.claimPaid(o.id), 'Спасибо! Бар проверит оплату')}><Check size={14} />Я оплатил</Btn></div>)}
    {wait && o.pay_method === 'cash' && <div className="rounded-lg border border-line bg-bg p-3 text-[13px]"><div className="font-medium">Оплата при получении</div><div className="text-mute">Оплата: {kzt(cash)} наличными. Заказ пойдёт в работу после того, как бармен получит оплату.</div></div>}
    {wait && o.pay_method === 'bonus' && <div className="text-[13px] text-mute">Заказ оплачивается бонусами — бармен подтвердит и передаст в работу.</div>}
    {wait && !o.kaspi_claimed && <Btn v="danger" onClick={() => act(api.cancelOrder(o.id), 'Заказ отменён, бонусы освобождены')}>Отменить заказ</Btn>}
  </div></Card>
}
export function Orders() {
  const [l, load] = useAsync(api.myOrders, 3000), [cfg] = useAsync(api.setting, 15000)
  return <div className="max-w-xl space-y-3"><h1 className="text-2xl font-semibold tracking-tight">Мои заказы</h1>{l?.map(o => <OrderCard key={o.id} o={o} cfg={cfg ?? {}} reload={load} />)}{l && !l.length && <Empty>Заказов пока нет. Выберите что-нибудь в магазине.</Empty>}</div>
}

/* Магазин по 4-значному коду (основной режим, пока BAR_ORDERS = false) */
export function StoreCodes({ s, onCode }: { s: Snap; onCode: (code: string) => void }) {
  const [cats] = useAsync(api.cats), [cat, setCat] = useState('all'), [busy, setBusy] = useState('')
  const chips: [string, string][] = [['all', 'Все'], ...(cats ?? []).filter(c => s.rewards.some(r => r.cat === c.id)).map(c => [c.id, c.name] as [string, string]), ...(s.rewards.some(r => !r.cat) && (cats ?? []).length ? [['none', 'Другое'] as [string, string]] : [])]
  const shown = s.rewards.filter(r => cat === 'all' || (cat === 'none' ? !r.cat : r.cat === cat))
  const get = (id: string) => { setBusy(id); api.redeem(id).then(onCode).catch(e => toast(e.message, false)).finally(() => setBusy('')) }
  return <div className="max-w-lg mx-auto space-y-3">
    <ScreenHead title="Магазин" sub="Обменивай бонусы на скидки" right={<span className="rounded-full bg-gold text-black px-3 py-1.5 text-[13px] font-bold">{N(s.balance)} Bonus</span>} />
    <div className="rise text-[13px] text-mute" style={{ animationDelay: '60ms' }}>Выберите товар, получите 4-значный код и назовите его администратору — Bonus спишутся, остальное оплатите на месте.</div>
    {chips.length > 1 && <div className="rise flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 [touch-action:pan-x_pan-y]" style={{ animationDelay: '100ms' }}>{chips.map(([k, l]) => <Btn key={k} v={cat === k ? 'primary' : 'secondary'} onClick={() => setCat(k)}>{l}</Btn>)}</div>}
    <div key={cat} className="grid sm:grid-cols-2 gap-3">{shown.map((r, i) => <div key={r.id} style={{ animationDelay: `${140 + Math.min(i, 8) * 55}ms` }} className="rise card-dark rounded-2xl p-4 flex flex-col gap-1.5"><div className="font-medium">{r.title}</div>{r.desc && <div className="text-xs text-mute">{r.desc}</div>}
      <div className="text-[13px]"><b>{kzt(r.price)}</b> <span className="text-mute">· Bonus покроют до {kzt(Math.min(maxBonus(r.price, r.pct), s.balance))}</span></div>
      <button disabled={busy === r.id} onClick={() => get(r.id)} className="press mt-2 h-10 rounded-xl bg-gold text-black font-semibold disabled:opacity-50">Получить код</button></div>)}</div>
    {!shown.length && <Empty>В этой категории пока пусто</Empty>}
  </div>
}
