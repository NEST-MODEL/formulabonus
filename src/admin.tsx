import { useEffect, useMemo, useState } from 'react'
import { Coffee, UserCog, Download, LayoutDashboard, Package, Percent, Plus, ScrollText, Search, Share2, Users, Zap, ChevronRight } from 'lucide-react'
import { api, Cat, fmt, guessPlan, Plan, Promo, Reward } from './api'
import { BarBoard, PaySettings, Staff } from './bar'
import { kzt, N } from './lib'
import { act, Confirm, Badge, Btn, Card, cx, csv, Empty, Field, Input, Modal, num, PageHead, Select, Shell, Table, Tabs, useAsync } from './ui'

const KIND: Record<string, string> = { accrual: 'Начисление', annual: 'Годовой абонемент', referral: 'Реферал', redeem: 'Списание', expire: 'Сгорание', adjust: 'Корректировка' }
const kindTone = (k: string) => (k === 'redeem' ? 'gold' : k === 'expire' ? 'red' : k === 'adjust' ? 'gray' : 'green') as any
const Amt = ({ v }: { v: number }) => <b className={cx('font-medium', v > 0 ? 'text-emerald-400' : 'text-[#F5F5F5]')}>{v > 0 ? '+' : ''}{N(v)}</b>
const status = (left: number | null) => left === null ? <Badge>Нет абонемента</Badge> : left < 0 ? <Badge t="red">Истёк</Badge> : left <= 14 ? <Badge t="gold">Заканчивается · {left} дн.</Badge> : <Badge t="green">Активен</Badge>

function Bars({ data, keys }: { data: any[]; keys: { k: string; c: string }[] }) {
  const max = Math.max(1, ...data.flatMap(d => keys.map(x => d[x.k]))), w = 600 / Math.max(1, data.length), bw = (w * 0.8) / keys.length
  if (!data.some(d => keys.some(x => d[x.k] > 0))) return <Empty>Нет данных за период</Empty>
  return <div><svg viewBox="0 0 600 120" preserveAspectRatio="none" className="w-full h-32">{data.map((d, i) => keys.map((x, j) => <rect key={i + x.k} x={i * w + w * 0.1 + j * bw} width={Math.max(bw - 0.6, 0.5)} y={115 - (d[x.k] / max) * 105} height={(d[x.k] / max) * 105} fill={x.c} rx="1" />))}<line x1="0" x2="600" y1="115" y2="115" stroke="#242424" /></svg>
    <div className="flex justify-between text-xs text-mute mt-1"><span>{fmt(data[0].d)}</span><span>макс. {N(max)}</span><span>{fmt(data[data.length - 1].d)}</span></div></div>
}
function Overview({ go }: { go: (k: string) => void }) {
  const [days, setDays] = useState(30), [s] = useAsync(() => api.stats(days), 0, [days]), [ser] = useAsync(() => api.series(days), 0, [days])
  const [ms] = useAsync(api.expMemberships), [bs, reload] = useAsync(api.expBonus), [ex, reEx] = useAsync(api.expiredCount), [open, setOpen] = useState<'m' | 'b' | null>(null)
  const kp = s ? [['Продления', s.renewals], ['Повторные покупки', s.repeat], ['Возвращённые клиенты', s.returned], ['Доп. выручка', kzt(s.revenue)], ['Bonus выдано', N(s.issued)], ['Bonus списано', N(s.redeemed)]] : []
  const bc = new Set((bs ?? []).map(x => x.profiles?.full_name + x.profiles?.phone)).size
  const att: [string, number, () => void][] = [['Абонементы заканчиваются (14 дн.)', ms?.length ?? 0, () => setOpen('m')], ['Bonus скоро сгорят (14 дн.)', bc, () => setOpen('b')], ['Просроченные Bonus — сжечь', ex ?? 0, () => act(async () => `Сгорело партий: ${await api.expire()}`, () => { reload(); reEx() })]]
  return <div className="space-y-4">
    <PageHead title="Обзор"><Select value={days} onChange={e => setDays(+e.target.value)}><option value={7}>Последние 7 дней</option><option value={30}>Последние 30 дней</option><option value={90}>Последние 90 дней</option></Select></PageHead>
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-line border border-line rounded-xl overflow-hidden">{kp.map(([l, v]) => <div key={l as string} className="bg-surface p-4"><div className="text-xs text-mute">{l}</div><div className="text-xl font-semibold mt-1">{v}</div><div className="text-xs text-mute mt-0.5">за {days} дн.</div></div>)}</div>
    <div className="grid xl:grid-cols-[1fr_1fr_300px] gap-4">
      <Card title="Активность клиентов"><div className="text-xs text-mute mb-2">Операции Bonus по дням</div>{ser ? <Bars data={ser} keys={[{ k: 'n', c: '#FFD21C' }]} /> : <Empty>Загрузка…</Empty>}</Card>
      <Card title="Bonus activity"><div className="text-xs text-mute mb-2 flex gap-3"><span><i className="inline-block w-2 h-2 rounded-sm bg-gold mr-1" />Выдано</span><span><i className="inline-block w-2 h-2 rounded-sm bg-[#6b6b6b] mr-1" />Списано</span></div>{ser ? <Bars data={ser} keys={[{ k: 'inn', c: '#FFD21C' }, { k: 'out', c: '#6b6b6b' }]} /> : <Empty>Загрузка…</Empty>}</Card>
      <Card title="Требует внимания" pad={false}>{att.map(([l, n, f]) => <button key={l} onClick={f} className="w-full flex items-center justify-between px-4 py-3 border-t first:border-t-0 border-line hover:bg-hover text-left"><span className="text-[13px]">{l}</span><span className="flex items-center gap-1.5">{n > 0 ? <Badge t="gold">{n}</Badge> : <span className="text-mute">0</span>}<ChevronRight size={14} className="text-mute" /></span></button>)}</Card></div>
    {open && <Modal title={open === 'm' ? 'Абонементы заканчиваются' : 'Bonus скоро сгорят'} onClose={() => setOpen(null)} drawer>
      <Table size={12} rows={(open === 'm' ? ms : bs) ?? []} cols={[{ h: 'Клиент', r: x => x.profiles?.full_name }, { h: 'Телефон', r: x => x.profiles?.phone ?? '—' }, open === 'm' ? { h: 'До', r: x => fmt(x.ends_on) } : { h: 'Bonus · до', r: x => `${N(x.remaining)} · ${fmt(x.expires_at)}` }]} />
      <Btn v="secondary" onClick={() => { setOpen(null); go('clients') }}>Открыть клиентов</Btn></Modal>}
  </div>
}
function Redeem() {
  const [code, setCode] = useState(''), [p, setP] = useState<any>(null), [err, setErr] = useState('')
  const find = (c: string) => { setCode(c); setErr(''); if (c.length < 4) return setP(null); api.preview(c).then(setP).catch(e => { setP(null); setErr(e.message) }) }
  return <div><PageHead title="Списание" /><div className="max-w-md"><Card title="Код клиента"><div className="space-y-3">
    <Input value={code} onChange={e => find(num(e.target.value).slice(0, 4))} inputMode="numeric" autoFocus className="!h-14 text-center text-3xl tracking-[0.4em] font-semibold" placeholder="0000" />
    {err && <div className="text-red-400 text-[13px]">{err}</div>}
    {p && <div className="border border-line rounded-lg divide-y divide-line">{[['Клиент', p.client], ['Баланс', N(p.balance) + ' Bonus'], ['Товар', `${p.reward} · ${kzt(p.price)}`], ['Списать Bonus', N(p.bonus)], ['Клиент доплачивает', kzt(p.price - p.bonus)]].map(([a, b]) => <div key={a} className="flex justify-between px-3 py-2"><span className="text-mute">{a}</span><b className="font-medium">{b}</b></div>)}</div>}
    {p && <Btn className="w-full !h-10" onClick={() => act(async () => { const n = await api.confirm(code); return `${p.plan ? 'Продление оформлено. ' : ''}Списано ${N(n)} Bonus. К оплате ${kzt(p.price - n)}` }, () => { setP(null); setCode('') })}>{p.plan ? 'Принять оплату и продлить' : 'Списать'}</Btn>}</div></Card></div></div>
}
function ClientDrawer({ c, onClose, reload }: { c: any; onClose: () => void; reload: () => void }) {
  const [d, ld] = useAsync(() => api.clientDetail(c.id), 0, [c.id]), [tab, setTab] = useState('buy'), [plans] = useAsync(api.plans), [pid, setPid] = useState(''), [price, setPrice] = useState(''), [pur, setPur] = useState(''), [busy, setBusy] = useState(false)
  const act0 = (plans ?? []).filter(p => p.active), curP = act0.find(p => p.id === pid)
  const pick = (id: string) => { setPid(id); const p = act0.find(x => x.id === id); if (p) setPrice(String(p.price)) }
  useEffect(() => { if (!pid && d && act0.length) { const g = guessPlan(act0, d.m[0]); if (g) pick(g.id) } }) // eslint-disable-line
  const done = () => { ld(); reload() }
  return <Modal drawer title={c.full_name} onClose={onClose}>
    <div className="grid grid-cols-3 gap-px bg-line border border-line rounded-lg overflow-hidden">{[['Bonus', N(c.balance)], ['Покупки', c.purchases], ['Код друга', c.referral_code]].map(([a, b]) => <div key={a} className="bg-bg p-3"><div className="text-xs text-mute">{a}</div><div className="font-semibold mt-0.5">{b}</div></div>)}</div>
    <div className="flex items-center justify-between text-[13px]"><span className="text-mute">{c.phone ?? 'Телефон не указан'}</span>{status(c.left)}</div>
    <Card title="Оформить / продлить абонемент"><div className="space-y-2"><Select className="w-full" value={pid} onChange={e => pick(e.target.value)}>{act0.map(p => <option key={p.id} value={p.id}>{p.name} · {kzt(p.price)}</option>)}</Select>
      <div className="flex items-center gap-2"><Input value={price} onChange={e => setPrice(num(e.target.value))} /><span className="text-xs text-mute whitespace-nowrap">{curP ? `${curP.days} дн. · ${curP.annual ? '+10 000 Bonus' : '+5% Bonus'}` : ''}</span></div>
      <Btn disabled={busy || !pid || !price} onClick={() => { setBusy(true); act(async () => `Абонемент оформлен, начислено ${N(await api.sellPlan(c.id, pid, +price))} Bonus`, done).finally(() => setBusy(false)) }}>Оформить</Btn></div></Card>
    <Card title="Начислить за покупку (+5%)"><div className="flex gap-2"><Input value={pur} onChange={e => setPur(num(e.target.value))} placeholder="Сумма ₸" /><Btn disabled={!pur} onClick={() => act(async () => `Начислено ${N(await api.accrue(c.id, +pur))} Bonus`, () => { setPur(''); done() })}>Начислить</Btn></div></Card>
    <Tabs cur={tab} set={setTab} tabs={[['buy', 'Абонементы'], ['bonus', 'Bonus'], ['ref', 'Рефералы']]} />
    {tab === 'buy' && <Table size={5} rows={d?.m ?? []} cols={[{ h: 'План', r: x => x.plan }, { h: 'Цена', r: x => kzt(x.price) }, { h: 'До', r: x => fmt(x.ends_on) }]} />}
    {tab === 'bonus' && <Table size={6} rows={d?.t ?? []} cols={[{ h: 'Дата', r: x => fmt(x.created_at) }, { h: 'Операция', r: x => x.note ?? KIND[x.kind] }, { h: 'Bonus', r: x => <Amt v={x.amount} />, cls: 'text-right' }]} />}
    {tab === 'ref' && <Table size={5} rows={d?.r ?? []} empty="Друзей пока нет" cols={[{ h: 'Друг', r: x => x.nw?.full_name }, { h: 'Дата', r: x => fmt(x.created_at) }, { h: 'Статус', r: x => x.status === 'confirmed' ? <Badge t="green">Подтверждён</Badge> : <Badge>Ждёт покупки</Badge> }]} />}
  </Modal>
}
function Clients() {
  const [list, load] = useAsync(api.clients), [q, setQ] = useState(''), [f, setF] = useState('all'), [sel, setSel] = useState<any>(null)
  const rows = useMemo(() => (list ?? []).filter(c => (!q || (c.full_name + (c.phone ?? '')).toLowerCase().includes(q.toLowerCase())) && (f === 'all' || (f === 'active' && c.left !== null && c.left > 14) || (f === 'soon' && c.left !== null && c.left <= 14) || (f === 'none' && c.left === null))), [list, q, f])
  return <div><PageHead title="Клиенты"><div className="relative"><Search size={14} className="absolute left-3 top-3 text-mute" /><Input className="!pl-8 w-56" placeholder="Поиск клиента…" value={q} onChange={e => setQ(e.target.value)} /></div>
    <Select value={f} onChange={e => setF(e.target.value)}><option value="all">Все</option><option value="active">Активные</option><option value="soon">Заканчиваются</option><option value="none">Без абонемента</option></Select>
    <Btn v="secondary" onClick={() => csv('clients', ['Имя', 'Телефон', 'Bonus', 'Покупки'], rows.map(c => [c.full_name, c.phone ?? '', c.balance, c.purchases]))}><Download size={14} />CSV</Btn></PageHead>
    <Card pad={false}><Table rows={rows} onRow={c => setSel(c)} empty="Клиенты появятся после регистрации" cols={[{ h: 'Имя', r: c => <b className="font-medium">{c.full_name}</b> }, { h: 'Телефон', r: c => c.phone ?? '—', cls: 'hidden md:table-cell' }, { h: 'Bonus', r: c => N(c.balance) }, { h: 'Покупки', r: c => c.purchases, cls: 'hidden md:table-cell' }, { h: 'Последняя покупка', r: c => c.last ? fmt(c.last) : '—', cls: 'hidden lg:table-cell' }, { h: 'Статус', r: c => status(c.left) }]} /></Card>
    {sel && <ClientDrawer c={list?.find(x => x.id === sel.id) ?? sel} onClose={() => setSel(null)} reload={load} />}</div>
}
function Store() {
  const [list, load] = useAsync(api.allRewards), [cats, loadC] = useAsync(api.cats), [ed, setEd] = useState<Partial<Reward> | null>(null), [f, setF] = useState<any>({}), [del, setDel] = useState<Reward | null>(null), [delC, setDelC] = useState<Cat | null>(null), [cf, setCf] = useState('all'), [cn, setCn] = useState('')
  const cname = (id?: string | null) => cats?.find(c => c.id === id)?.name ?? '—'
  const open = (r: Partial<Reward> | null) => { setEd(r ?? {}); setF({ title: r?.title ?? '', price: String(r?.price ?? ''), pct: String(r?.pct ?? 10), cat: r?.cat ?? '', desc: r?.desc ?? '' }) }
  const save = () => act(async () => { const v = { title: f.title, price: +f.price, max_bonus_pct: Math.min(+f.pct, 100), category_id: f.cat || null, description: f.desc }; if (ed?.id) await api.updateReward(ed.id, { ...v, active: !!ed.active }); else await api.addReward(v); return 'Сохранено' }, () => { setEd(null); load() })
  const rows = (list ?? []).filter(r => cf === 'all' || (cf === 'none' ? !r.cat : r.cat === cf))
  return <div><PageHead title="Магазин"><Btn onClick={() => open(null)}><Plus size={14} />Добавить товар</Btn></PageHead>
    <div className="flex flex-wrap gap-1.5 mb-3">{[['all', 'Все'], ...(cats ?? []).map(c => [c.id, c.name]), ['none', 'Без категории']].map(([k, l]) => <Btn key={k} v={cf === k ? 'primary' : 'secondary'} onClick={() => setCf(k)}>{l}</Btn>)}</div>
    <Card pad={false}><Table rows={rows} empty="Товаров нет" cols={[{ h: 'Товар', r: r => <div><b className="font-medium">{r.title}</b>{r.desc && <div className="text-xs text-mute">{r.desc}</div>}</div> }, { h: 'Категория', r: r => cname(r.cat), cls: 'hidden md:table-cell' }, { h: 'Цена', r: r => kzt(r.price) }, { h: 'Bonus', r: r => `до ${r.pct}%`, cls: 'hidden md:table-cell' }, { h: 'Статус', r: r => r.active ? <Badge t="green">Активен</Badge> : <Badge>Скрыт</Badge> },
      { h: '', cls: 'text-right', r: r => <span className="inline-flex gap-1"><Btn v="secondary" onClick={() => open(r)}>Изменить</Btn><Btn v="ghost" onClick={() => act(async () => { await api.toggleReward(r.id, !r.active); return r.active ? 'Скрыт' : 'Показан' }, load)}>{r.active ? 'Скрыть' : 'Показать'}</Btn><Btn v="danger" onClick={() => setDel(r)}>Удалить</Btn></span> }]} /></Card>
    <div className="mt-8"><h2 className="text-lg font-semibold mb-3">Категории</h2><Card pad={false}>{(cats ?? []).map(c => <div key={c.id} className="flex items-center justify-between px-4 h-11 border-t first:border-t-0 border-line"><span className={c.active ? '' : 'text-mute line-through'}>{c.name}</span><span className="inline-flex gap-1">
      <Btn v="ghost" onClick={() => { const n = window.prompt('Новое название', c.name); if (n && n.trim()) act(async () => { await api.updateCat(c.id, { name: n.trim() }); return 'Сохранено' }, loadC) }}>Переименовать</Btn><Btn v="ghost" onClick={() => act(async () => { await api.updateCat(c.id, { active: !c.active }); return 'Готово' }, loadC)}>{c.active ? 'Скрыть' : 'Показать'}</Btn><Btn v="danger" onClick={() => setDelC(c)}>Удалить</Btn></span></div>)}
      <div className="flex gap-2 p-3 border-t border-line"><Input placeholder="Новая категория (кофе, напитки, спортпит…)" value={cn} onChange={e => setCn(e.target.value)} /><Btn disabled={!cn.trim()} onClick={() => act(async () => { await api.addCat(cn.trim()); return 'Категория добавлена' }, () => { setCn(''); loadC() })}>Добавить</Btn></div></Card></div>
    <PaySettings /><Plans />
    {del && <Confirm title="Удалить товар?" text={`«${del.title}» будет удалён навсегда. История операций и заказов сохранится. Если товар нужно просто убрать из магазина, используйте «Скрыть».`} onClose={() => setDel(null)} onYes={() => act(async () => { await api.deleteReward(del.id); return 'Товар удалён' }, load)} />}
    {delC && <Confirm title="Удалить категорию?" text={`Категория «${delC.name}» будет удалена. Товары останутся, но попадут в «Без категории».`} onClose={() => setDelC(null)} onYes={() => act(async () => { await api.deleteCat(delC.id); return 'Категория удалена' }, () => { loadC(); load() })} />}
    {ed && <Modal title={ed.id ? 'Изменить товар' : 'Новый товар'} onClose={() => setEd(null)}><Field l="Название"><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field><Field l="Описание (необязательно)"><Input value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field l="Категория"><Select className="w-full" value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}><option value="">Без категории</option>{(cats ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field><Field l="Цена, ₸"><Input value={f.price} onChange={e => setF({ ...f, price: num(e.target.value) })} /></Field></div>
      <Field l="Макс. покрытие Bonus, %"><Input value={f.pct} onChange={e => setF({ ...f, pct: num(e.target.value) })} /></Field><Btn disabled={!f.title || !f.price} onClick={save}>Сохранить</Btn></Modal>}</div>
}
function Plans() {
  const [l, load] = useAsync(api.plans), [ed, setEd] = useState<Partial<Plan> | null>(null), [f, setF] = useState<any>({})
  const open = (x: Plan | null) => { setEd(x ?? {}); setF({ name: x?.name ?? '', days: String(x?.days ?? 30), price: String(x?.price ?? ''), pct: String(x?.max_bonus_pct ?? 10), annual: x?.annual ? 'y' : 'n' }) }
  const save = () => act(async () => { const v = { name: f.name, days: +f.days, price: +f.price, max_bonus_pct: Math.min(+f.pct, 100), annual: f.annual === 'y' }; if (ed?.id) await api.updatePlan(ed.id, v); else await api.addPlan(v); return 'Сохранено' }, () => { setEd(null); load() })
  return <div className="mt-8"><div className="flex items-center justify-between mb-3"><h2 className="text-lg font-semibold">Тарифы абонементов</h2><Btn onClick={() => open(null)}><Plus size={14} />Добавить тариф</Btn></div>
    <Card pad={false}><Table rows={l ?? []} cols={[{ h: 'Тариф', r: x => <b className="font-medium">{x.name}</b> }, { h: 'Срок', r: x => `${x.days} дн.` }, { h: 'Цена', r: x => kzt(x.price) }, { h: 'Bonus', r: x => `до ${x.max_bonus_pct}%` }, { h: 'Начисление', r: x => x.annual ? '+10 000' : '+5%' }, { h: 'Статус', r: x => x.active ? <Badge t="green">Активен</Badge> : <Badge>Скрыт</Badge> },
      { h: '', cls: 'text-right', r: x => <span className="inline-flex gap-1"><Btn v="secondary" onClick={() => open(x)}>Изменить</Btn><Btn v="ghost" onClick={() => act(async () => { await api.updatePlan(x.id, { active: !x.active }); return 'Готово' }, load)}>{x.active ? 'Скрыть' : 'Показать'}</Btn></span> }]} /></Card>
    {ed && <Modal title={ed.id ? 'Изменить тариф' : 'Новый тариф'} onClose={() => setEd(null)}><Field l="Название"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field l="Срок, дней"><Input value={f.days} onChange={e => setF({ ...f, days: num(e.target.value) })} /></Field><Field l="Цена, ₸"><Input value={f.price} onChange={e => setF({ ...f, price: num(e.target.value) })} /></Field>
        <Field l="Макс. покрытие Bonus, %"><Input value={f.pct} onChange={e => setF({ ...f, pct: num(e.target.value) })} /></Field><Field l="Тип"><Select className="w-full" value={f.annual} onChange={e => setF({ ...f, annual: e.target.value })}><option value="n">Обычный (+5% Bonus)</option><option value="y">Годовой (+10 000 Bonus)</option></Select></Field></div>
      <Btn disabled={!f.name || !f.days || !f.price} onClick={save}>Сохранить</Btn></Modal>}</div>
}
const PK: Record<string, string> = { bonus: 'Bonus', discount: 'Скидка', info: 'Информация' }
function Promos() {
  const [l, load] = useAsync(api.allPromos), [del, setDel] = useState<Promo | null>(null), [ed, setEd] = useState<Partial<Promo> | null>(null), [f, setF] = useState<any>({})
  const open = (x: Partial<Promo> | null) => { setEd(x ?? {}); setF({ title: x?.title ?? '', body: x?.body ?? '', kind: x?.kind ?? 'info', value: x?.value ?? '', ends_on: x?.ends_on ?? '' }) }
  const save = () => act(async () => { const v = { ...f, ends_on: f.ends_on || null }; if (ed?.id) await api.updatePromo(ed.id, v); else await api.addPromo(v); return 'Сохранено' }, () => { setEd(null); load() })
  return <div><PageHead title="Акции"><Btn onClick={() => open(null)}><Plus size={14} />Добавить акцию</Btn></PageHead>
    <Card pad={false}><Table rows={l ?? []} empty="Акций пока нет" cols={[{ h: 'Название', r: x => <b className="font-medium">{x.title}</b> }, { h: 'Тип', r: x => PK[x.kind ?? 'info'] }, { h: 'Размер', r: x => x.value || '—' }, { h: 'До', r: x => x.ends_on ? fmt(x.ends_on) : 'Бессрочно' }, { h: 'Статус', r: x => x.active ? <Badge t="green">Активна</Badge> : <Badge>Скрыта</Badge> },
      { h: '', cls: 'text-right', r: x => <span className="inline-flex gap-1"><Btn v="secondary" onClick={() => open(x)}>Изменить</Btn><Btn v="ghost" onClick={() => act(async () => { await api.updatePromo(x.id, { active: !x.active }); return 'Готово' }, load)}>{x.active ? 'Скрыть' : 'Показать'}</Btn><Btn v="danger" onClick={() => setDel(x)}>Удалить</Btn></span> }]} /></Card>
    {del && <Confirm title="Удалить акцию?" text={`Акция «${del.title}» будет удалена навсегда. Если нужно просто убрать её у клиентов, используйте «Скрыть».`} onClose={() => setDel(null)} onYes={() => act(async () => { await api.deletePromo(del.id); return 'Акция удалена' }, load)} />}
    {ed && <Modal title={ed.id ? 'Изменить акцию' : 'Новая акция'} onClose={() => setEd(null)}><Field l="Название"><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field><Field l="Описание"><Input value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></Field>
      <div className="grid grid-cols-3 gap-3"><Field l="Тип"><Select className="w-full" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{Object.entries(PK).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field><Field l="Размер"><Input value={f.value} onChange={e => setF({ ...f, value: e.target.value })} placeholder="−15% / +500" /></Field><Field l="До"><Input type="date" value={f.ends_on} onChange={e => setF({ ...f, ends_on: e.target.value })} /></Field></div><Btn disabled={!f.title} onClick={save}>Сохранить</Btn></Modal>}</div>
}
function Refs() {
  const [l] = useAsync(api.referrals), r = l ?? [], ok = r.filter(x => x.status === 'confirmed')
  return <div><PageHead title="Рефералы" /><div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line rounded-xl overflow-hidden mb-4">{[['Всего рефералов', r.length], ['Активные (ждут покупки)', r.length - ok.length], ['Подтверждённые', ok.length], ['Выручка от рефералов', kzt(ok.reduce((s, x) => s + (x.membership?.price ?? 0), 0))]].map(([a, b]) => <div key={a as string} className="bg-surface p-4"><div className="text-xs text-mute">{a}</div><div className="text-xl font-semibold mt-1">{b}</div></div>)}</div>
    <Card pad={false}><Table rows={r} empty="Рефералов пока нет" cols={[{ h: 'Пригласил', r: x => x.ref?.full_name }, { h: 'Друг', r: x => x.nw?.full_name }, { h: 'Дата', r: x => fmt(x.created_at) }, { h: 'Статус', r: x => x.status === 'confirmed' ? <Badge t="green">Подтверждён {fmt(x.confirmed_at)}</Badge> : <Badge>Ждёт покупки</Badge> }]} /></Card></div>
}
function Ops() {
  const [l] = useAsync(api.txs, 10000), [k, setK] = useState('all'), [q, setQ] = useState(''), [a, setA] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState('')
  const rows = (l ?? []).filter(x => (k === 'all' || x.kind === k) && (!q || (x.profiles?.full_name ?? '').toLowerCase().includes(q.toLowerCase())) && (!a || Math.abs(x.amount) >= +a) && (!from || x.created_at.slice(0, 10) >= from) && (!to || x.created_at.slice(0, 10) <= to))
  return <div><PageHead title="Операции"><Btn v="secondary" onClick={() => csv('operations', ['Дата', 'Клиент', 'Тип', 'Описание', 'Bonus'], rows.map(x => [x.created_at.slice(0, 10), x.profiles?.full_name ?? '', KIND[x.kind], x.note ?? '', x.amount]))}><Download size={14} />CSV</Btn></PageHead>
    <div className="flex flex-wrap gap-2 mb-3"><Select value={k} onChange={e => setK(e.target.value)}><option value="all">Все типы</option>{Object.entries(KIND).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</Select><Input className="w-44" placeholder="Клиент" value={q} onChange={e => setQ(e.target.value)} /><Input className="w-32" placeholder="Сумма от" value={a} onChange={e => setA(num(e.target.value))} /><Input type="date" className="w-40" value={from} onChange={e => setFrom(e.target.value)} /><Input type="date" className="w-40" value={to} onChange={e => setTo(e.target.value)} /></div>
    <Card pad={false}><Table size={15} rows={rows} cols={[{ h: 'Дата', r: x => fmt(x.created_at) }, { h: 'Клиент', r: x => x.profiles?.full_name }, { h: 'Тип', r: x => <Badge t={kindTone(x.kind)}>{KIND[x.kind]}</Badge> }, { h: 'Описание', r: x => x.note ?? '—', cls: 'hidden md:table-cell' }, { h: 'Bonus', r: x => <Amt v={x.amount} />, cls: 'text-right' }]} /></Card></div>
}
export default function Admin({ who }: { who: string }) {
  const items: [string, string, any][] = [['overview', 'Обзор', LayoutDashboard], ['redeem', 'Списание', Zap], ['clients', 'Клиенты', Users], ['store', 'Магазин', Package], ['promos', 'Акции', Percent], ['orders', 'Заказы бара', Coffee], ['refs', 'Рефералы', Share2], ['ops', 'Операции', ScrollText], ['staff', 'Сотрудники', UserCog]]
  const [k, setK] = useState('overview')
  return <Shell items={items} cur={k} set={setK} who={who}>{k === 'overview' ? <Overview go={setK} /> : k === 'redeem' ? <Redeem /> : k === 'clients' ? <Clients /> : k === 'store' ? <Store /> : k === 'promos' ? <Promos /> : k === 'refs' ? <Refs /> : k === 'orders' ? <BarBoard /> : k === 'staff' ? <Staff /> : <Ops />}</Shell>
}
