import { useEffect, useRef, useState } from 'react'
import { Coffee } from 'lucide-react'
import { api, Order } from './api'
import { kzt, N } from './lib'
import { BAR_ORDERS } from './features'
import { Badge, Btn, Card, Empty, PageHead, Select, Shell, Table, toast, useAsync, Input, Field } from './ui'

const ago = (t: string) => { const m = Math.max(0, Math.round((Date.now() - +new Date(t)) / 60000)); return m < 1 ? 'только что' : m < 60 ? m + ' мин' : Math.floor(m / 60) + ' ч' }
function OCard({ o, reload }: { o: Order; reload: () => void }) {
  const [busy, setBusy] = useState(false), wait = o.status === 'awaiting_payment', bonus = o.paid ? o.bonus_used : o.bonus_planned, cash = o.paid ? o.cash_amount : o.total - o.bonus_planned
  const run = (f: () => Promise<any>, m?: string) => { setBusy(true); f().then(() => { if (m) toast(m); reload() }).catch(e => toast(e.message, false)).finally(() => setBusy(false)) }
  const confirm = () => api.barConfirm(o.id).then(r => toast(r.already ? 'Оплата уже была подтверждена' : `Оплата подтверждена. Бонусов списано: ${N(r.bonus)}. Получено: ${kzt(r.to_pay)}`))
  const st = (s: string) => () => api.barStatus(o.id, s)
  const pm = o.pay_method === 'kaspi' ? 'Kaspi' : o.pay_method === 'cash' ? 'наличные' : 'только бонусы'
  return <div className={`bg-surface border rounded-xl p-4 space-y-2.5 ${wait && o.kaspi_claimed ? 'border-gold/60' : 'border-line'}`}>
    <div className="flex justify-between"><div className="text-lg font-semibold">Заказ #{o.num} <span className="text-sm font-normal text-mute">· {o.client_name}</span></div><span className="text-xs text-mute">{ago(o.created_at)}</span></div>
    <div className="space-y-0.5">{o.order_items.map((i, k) => <div key={k} className="font-medium">{i.title} ×{i.qty}</div>)}</div>
    {o.comment && <div className="rounded-md bg-gold/10 text-gold px-2.5 py-1.5 text-[13px]">«{o.comment}»</div>}
    <div className="text-[13px]"><b>{kzt(o.total)}</b> <span className="text-mute">· {N(bonus)} Б + {kzt(cash)} {pm}</span></div>
    <div className="flex flex-wrap gap-1.5">{o.status === 'cancelled' ? <Badge t="red">Отменён</Badge> : wait ? (o.pay_method === 'kaspi' ? (o.kaspi_claimed ? <Badge t="gold">🟡 Ожидает подтверждения оплаты</Badge> : <Badge>Клиент ещё не оплатил</Badge>) : <Badge t="gold">🟡 Ждёт оплаты: {pm}</Badge>) : <Badge t="green">Оплата подтверждена</Badge>}</div>
    <div className="flex flex-wrap gap-1.5">
      {wait && <Btn disabled={busy} onClick={() => run(confirm)}>{o.pay_method === 'cash' ? 'Получил оплату' : 'Подтвердить оплату'}</Btn>}
      {o.status === 'new' && <Btn disabled={busy} onClick={() => run(st('preparing'))}>Готовить</Btn>}
      {o.status === 'preparing' && <Btn disabled={busy} onClick={() => run(st('ready'), 'Заказ готов')}>Готов</Btn>}
      {o.status === 'ready' && <Btn disabled={busy} onClick={() => run(st('done'), 'Выдан')}>Выдан</Btn>}
      <Btn v="danger" disabled={busy} onClick={() => { if (window.confirm(`Отменить заказ #${o.num}?${o.paid ? ' Бонусы вернутся клиенту, деньги верните вручную.' : ' Резерв бонусов освободится.'}`)) run(st('cancelled'), 'Отменён') }}>Отменить</Btn></div></div>
}
export function BarBoard() {
  const [o, load] = useAsync(api.orders, 3000), [cfg, loadC] = useAsync(api.setting, 8000), [snd, setSnd] = useState(false), ctx = useRef<AudioContext | null>(null), prev = useRef<number | null>(null)
  const list = o ?? [], by = (s: string) => list.filter(x => x.status === s).sort((a, b) => s === 'awaiting_payment' ? +b.kaspi_claimed - +a.kaspi_claimed : 0), fresh = by('new').length + by('awaiting_payment').length
  useEffect(() => { if (o === null) return; if (prev.current !== null && fresh > prev.current && snd && ctx.current) { const c = ctx.current, g = c.createGain(), os = c.createOscillator(); os.connect(g); g.connect(c.destination); os.frequency.value = 880; g.gain.value = 0.15; os.start(); os.stop(c.currentTime + 0.25) } prev.current = fresh }, [fresh, o, snd])
  const toggleSound = () => { if (!snd) ctx.current = ctx.current ?? new AudioContext(); setSnd(!snd) }
  const cols: [string, string][] = [['awaiting_payment', 'Ожидают оплаты'], ['new', 'Оплачены · новые'], ['preparing', 'Готовятся'], ['ready', 'Готовы к выдаче']], closed = list.filter(x => x.status === 'done' || x.status === 'cancelled').slice(0, 12)
  return <div><PageHead title="Заказы бара"><Btn v="secondary" onClick={toggleSound}>{snd ? '🔔 Звук включён' : '🔕 Звук выключен'}</Btn>
    <Select value={cfg?.bar_open === '0' ? '0' : '1'} onChange={e => api.saveSetting('bar_open', e.target.value).then(loadC).catch(x => toast(x.message, false))}><option value="1">Бар открыт</option><option value="0">Бар закрыт (заказы не принимаются)</option></Select></PageHead>
    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">{cols.map(([k, l]) => <div key={k} className="space-y-3"><div className="flex items-center gap-2"><h2 className="font-medium">{l}</h2><Badge t={(k === 'new' || k === 'awaiting_payment') && by(k).length ? 'gold' : 'gray'}>{by(k).length}</Badge></div>{by(k).map(x => <OCard key={x.id} o={x} reload={load} />)}{!by(k).length && <Empty>Пусто</Empty>}</div>)}</div>
    <div className="mt-8"><Card title="Закрытые (последние)" pad={false}><Table size={12} rows={closed} empty="Пока нет" cols={[{ h: '№', r: x => '#' + x.num }, { h: 'Клиент', r: x => x.client_name }, { h: 'Состав', r: x => x.order_items.map(i => `${i.qty}×${i.title}`).join(', '), cls: 'hidden md:table-cell' }, { h: 'Сумма', r: x => kzt(x.total) }, { h: 'Статус', r: x => x.status === 'done' ? <Badge t="green">Выдан</Badge> : <Badge t="red">Отменён</Badge> }]} /></Card></div></div>
}
export function BarApp() { return <Shell items={[['b', 'Заказы', Coffee]]} cur="b" set={() => {}} who="Бармен"><BarBoard /></Shell> }
const RL: Record<string, string> = { client: 'Клиент', staff: 'Ресепшен', bartender: 'Бармен', admin: 'Админ', dev: 'Разработчик' }
export function Staff({ role: me }: { role: string }) {
  const roles = Object.keys(RL).filter(r => (me === 'dev' || r !== 'dev') && (BAR_ORDERS || r !== 'bartender'))
  const [l, load] = useAsync(api.staff), [c] = useAsync(api.clients), [q, setQ] = useState(''), [role, setRole] = useState(BAR_ORDERS ? 'bartender' : 'staff'), set = (id: string, r: string) => api.setRole(id, r).then(() => { toast('Роль изменена'); load() }).catch(e => toast(e.message, false))
  const found = q.trim() ? (c ?? []).filter(x => (x.full_name + (x.phone ?? '')).toLowerCase().includes(q.toLowerCase())).slice(0, 6) : []
  return <div className="space-y-4"><PageHead title="Сотрудники" />
    <Card title="Добавить сотрудника"><div className="space-y-3"><div className="text-[13px] text-mute">Человек сначала регистрируется сам, затем вы находите его здесь и назначаете роль. {BAR_ORDERS ? ' Бармен видит только заказы бара.' : ''}</div>
      <div className="flex flex-wrap gap-2"><Input className="max-w-xs" placeholder="Имя или телефон" value={q} onChange={e => setQ(e.target.value)} /><Select value={role} onChange={e => setRole(e.target.value)}>{roles.filter(r => r !== 'client').map(r => <option key={r} value={r}>{RL[r]}</option>)}</Select></div>
      {found.map(x => <div key={x.id} className="flex items-center justify-between border-t border-line pt-2"><span>{x.full_name} <span className="text-mute text-xs">{x.phone ?? ''}</span></span><Btn onClick={() => set(x.id, role).then(() => setQ(''))}>Назначить: {RL[role]}</Btn></div>)}</div></Card>
    <Card title="Команда" pad={false}><Table rows={l ?? []} cols={[{ h: 'Имя', r: x => <b className="font-medium">{x.full_name}</b> }, { h: 'Телефон', r: x => x.phone ?? '—' }, { h: 'Роль', r: x => x.role === 'dev' && me !== 'dev' ? <Badge>{RL.dev}</Badge> : <Select value={x.role} onChange={e => set(x.id, e.target.value)}>{roles.map(k => <option key={k} value={k}>{RL[k]}</option>)}</Select> }]} /></Card></div>
}
export function PaySettings() {
  const [c, load] = useAsync(api.setting), [u, setU] = useState<string | null>(null)
  const save = () => api.saveSetting('kaspi_payment_url', (u ?? c?.kaspi_payment_url ?? '').trim()).then(() => { toast('Сохранено'); load() }).catch(e => toast(e.message, false))
  return <div className="mt-8"><h2 className="text-lg font-semibold mb-3">Оплата Kaspi</h2><Card><div className="space-y-3"><Field l="Ссылка Kaspi Pay для оплаты заказов"><Input value={u ?? c?.kaspi_payment_url ?? ''} onChange={e => setU(e.target.value)} placeholder="https://pay.kaspi.kz/..." /></Field>
    <div className="text-xs text-mute">Клиент нажимает «Перейти к оплате Kaspi», открывается эта ссылка, сумму он вводит сам. Факт оплаты подтверждает сотрудник вручную в панели заказов. Ссылку можно менять в любой момент.</div><Btn onClick={save}>Сохранить</Btn></div></Card></div>
}
