import { useEffect, useRef, useState } from 'react'
import { ClipboardList, History, Home, ShoppingBag, Sparkles, User, Users } from 'lucide-react'
import { FriendsScreen, HomeScreen, ProfileScreen, RoundBtn, ScreenHead } from './home'
import { Bell2, PushCard, Support } from './support'
import { enablePush } from './lib'
import { CLIENT_UPDATE } from './whatsnew'
import { Orders, Shop, StoreCodes } from './shop'
import { BAR_ORDERS } from './features'
import { api, dmy, guessPlan, Snap } from './api'
import { kzt, maxBonus, N } from './lib'
import { Badge, Btn, Card, cx, Empty, Input, Modal, Shell, toast, useAsync } from './ui'

const LBL: Record<string, string> = { new: 'оплата подтверждена', preparing: 'готовится', ready: 'готов, заберите на баре', done: 'выдан', cancelled: 'отменён' }
export default function Client() {
  const [s, load] = useAsync<Snap>(api.snap, 3000), [tab, setTab] = useState('home'), [flt, setFlt] = useState('all'), [pl] = useAsync(api.plans), [lm] = useAsync(api.lastMembership), [sel, setSel] = useState(''), [ao] = useAsync(() => BAR_ORDERS ? api.myOrders() : Promise.resolve([]), BAR_ORDERS ? 5000 : 0)
  const [code, setCode] = useState<string | null>(null), [st, setSt] = useState({ status: 'pending', used: 0 })
  useEffect(() => { if (!code || st.status === 'done') return; const t = setInterval(() => api.status(code).then(x => { setSt(x); if (x.status === 'done') load() }), 1500); return () => clearInterval(t) }, [code, st.status, load])
  const seen = useRef<Record<string, string>>({})
  useEffect(() => { ao?.forEach(o => { const p = seen.current[o.id]; if (p && p !== o.status) toast(`Заказ #${o.num}: ${LBL[o.status] ?? o.status}`); seen.current[o.id] = o.status }) }, [ao])
  // уведомления: генерация один раз при открытии, счётчик — при открытии и возврате в приложение (без постоянного опроса)
  useEffect(() => {
    const go = (u: string) => { const t = new URL(u, location.href).searchParams.get('tab'); if (t) { setTab(t); setCode(null); history.replaceState(null, '', import.meta.env.BASE_URL) } }
    go(location.href); enablePush(false).catch(() => {})  // тихо обновляем подписку, если разрешение уже дано
    const f = (e: MessageEvent) => { if (e.data?.type === 'open-tab') { go(e.data.url); loadUnread() } }; navigator.serviceWorker?.addEventListener('message', f); return () => navigator.serviceWorker?.removeEventListener('message', f)
  }, []) // eslint-disable-line
  const [unread, setUnread] = useState(0), loadUnread = () => { api.unread().then(setUnread).catch(() => {}) }
  useEffect(() => { api.syncNotifications().catch(() => {}).finally(loadUnread); const f = () => { if (document.visibilityState === 'visible') loadUnread() }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f) }, []) // eslint-disable-line
  // плашка «ОБНОВЛЕНИЕ!» — один раз на каждое обновление
  const [upd, setUpd] = useState(() => { try { return localStorage.getItem('fb-update-seen') !== CLIENT_UPDATE.id } catch { return false } }), [updOpen, setUpdOpen] = useState(false)
  useEffect(() => { if (upd) try { localStorage.setItem('fb-update-seen', CLIENT_UPDATE.id) } catch { /* ignore */ } }, []) // eslint-disable-line
  const [birth, setBirth] = useState<string | null>(null)
  useEffect(() => { api.expireMine().then(load).catch(() => {}) }, []) // eslint-disable-line
  if (!s) return <div className="p-8 text-center text-mute">Загрузка…</div>
  const plans = pl ?? [], cur = plans.length ? guessPlan(plans, lm ?? undefined) : undefined, chosen = plans.find(p => p.id === (sel || cur?.id)), cbonus = chosen ? Math.min(maxBonus(chosen.price, chosen.max_bonus_pct), s.balance) : 0
  const CodeCard = <Card><div className="text-center py-6">{st.status === 'done' ? <><div className="text-emerald-400 text-xl font-semibold">Готово · списано {N(st.used)} Bonus</div><div className="text-mute text-[13px] mt-1">Баланс, история и абонемент обновлены</div></> : <><div className="text-mute">Назовите код сотруднику</div><div className="text-6xl font-semibold tracking-[0.25em] text-gold my-4">{code}</div><div className="text-mute text-[13px]">Ждём подтверждения…</div></>}<Btn v="secondary" className="mt-6" onClick={() => setCode(null)}>Назад</Btn></div></Card>
  const pend = s.batches.some(b => b.pending), first = s.batches.filter(b => b.expires).sort((a, b) => +new Date(a.expires!) - +new Date(b.expires!))[0]
    const Row = ({ h }: { h: Snap['tx'][0] }) => <div className="flex justify-between items-center border-t first:border-t-0 border-line px-4 py-3"><div><div className="font-medium">{h.text}</div><div className="text-xs text-mute">{h.date}{h.sub ? ' · ' + h.sub : ''}</div></div><b className={cx('text-[15px]', h.amount > 0 ? 'text-emerald-400' : '')}>{h.amount > 0 ? '+' : ''}{N(h.amount)}</b></div>
  const items: [string, string, any][] = [['home', 'Главная', Home], ['store', 'Магазин', ShoppingBag], ...(BAR_ORDERS ? [['orders', 'Заказы', ClipboardList]] as [string, string, any][] : []), ['friends', 'Друзья', Users], ['history', 'История', History], ['profile', 'Профиль', User]]
  const goTab = (k: string) => { setTab(k); setCode(null); window.scrollTo({ top: 0 }) }
  const banner = upd && <button onClick={() => setUpdOpen(true)} className="rise press w-full mb-3 text-left rounded-2xl border border-gold/50 bg-gold/10 px-4 py-3 flex items-center gap-3"><Sparkles size={18} className="text-gold shrink-0" /><span className="flex-1"><b className="text-gold">ОБНОВЛЕНИЕ!</b> <span className="text-[13px]">Нажмите, чтобы узнать подробнее</span></span><span onClick={e => { e.stopPropagation(); setUpd(false) }} className="text-mute px-1" aria-label="Скрыть">✕</span></button>
  return <Shell bottom items={items} cur={tab} set={goTab} who={s.name || 'Клиент'}>
    {updOpen && <Modal title={CLIENT_UPDATE.title} onClose={() => { setUpdOpen(false); setUpd(false) }}><ul className="space-y-2 text-[13px]">{CLIENT_UPDATE.items.map(x => <li key={x} className="flex gap-2"><span className="text-gold">•</span><span>{x}</span></li>)}</ul><Btn className="w-full" onClick={() => { setUpdOpen(false); setUpd(false) }}>Понятно</Btn></Modal>}
    {tab === 'support' && <div className="max-w-lg mx-auto"><Support /></div>}
    {tab === 'home' && <HomeScreen s={s} go={goTab} banner={banner}
      right={<><Bell2 count={unread} reload={loadUnread} go={goTab} /><RoundBtn onClick={() => goTab('profile')} label="Профиль"><User size={18} /></RoundBtn></>}
      recent={<><div className="flex items-center justify-between mb-3"><h2 className="text-xl font-bold">Последние действия</h2><button onClick={() => goTab('history')} className="text-gold font-semibold text-[13px]">Все</button></div>
        <div className="card-dark rounded-2xl overflow-hidden">{s.tx.slice(0, 3).map(h => <Row key={h.id} h={h} />)}{!s.tx.length && <Empty>Операций пока нет</Empty>}</div></>} />}
    {tab === 'friends' && <FriendsScreen s={s} back={() => goTab('home')} />}
    {tab === 'renew' && <div className="max-w-lg mx-auto space-y-3"><ScreenHead title="Продление абонемента" sub={s.plan ? `Сейчас: ${s.plan}${s.daysLeft !== null && s.daysLeft > 0 ? ` · осталось ${s.daysLeft} дн.` : ''}` : 'Выберите подходящий срок'} />
      {code ? CodeCard : <><div className="text-mute text-[13px]">Выберите срок — цена подставится автоматически. Bonus покроют часть стоимости.</div>
        <div className="grid sm:grid-cols-2 gap-3">{plans.map(p => <button key={p.id} onClick={() => setSel(p.id)} className={cx('text-left rounded-xl border p-4', chosen?.id === p.id ? 'border-gold bg-gold/5' : 'border-line bg-surface')}><div className="flex justify-between gap-2"><b className="font-medium">{p.name}</b>{cur?.id === p.id && <Badge t="gold">Ваш тариф</Badge>}</div><div className="text-xl font-semibold mt-1">{kzt(p.price)}</div><div className="text-xs text-mute mt-0.5">{p.days} дн. · Bonus покроют до {kzt(maxBonus(p.price, p.max_bonus_pct))} · {p.annual ? '+10 000 бонусов' : '+5% бонусов'}</div></button>)}</div>
        {chosen && <Card><div className="space-y-1.5">{[['Тариф', chosen.name], ['Цена', kzt(chosen.price)], ['Спишется Bonus', N(cbonus)]].map(([a, b]) => <div key={a} className="flex justify-between"><span className="text-mute">{a}</span><b className="font-medium">{b}</b></div>)}<div className="flex justify-between border-t border-line pt-2 mt-2"><span>К оплате</span><b className="text-gold text-lg">{kzt(chosen.price - cbonus)}</b></div>
          <Btn className="w-full mt-3" onClick={() => api.renew(chosen.id).then(c => { setCode(c); setSt({ status: 'pending', used: 0 }) }).catch(e => toast(e.message, false))}>Получить код продления</Btn></div></Card>}</>}</div>}
    {tab === 'history' && <div className="max-w-lg mx-auto space-y-3"><ScreenHead title="История" sub="Начисления и списания бонусов" />
      <div className="flex gap-1.5">{[['all', 'Все'], ['in', 'Начисления'], ['out', 'Списания']].map(([k, l]) => <Btn key={k} v={flt === k ? 'primary' : 'secondary'} onClick={() => setFlt(k)}>{l}</Btn>)}</div>
      <div className="card-dark rounded-2xl overflow-hidden">{s.tx.filter(h => flt === 'all' || (flt === 'in' ? h.amount > 0 : h.amount < 0)).map(h => <Row key={h.id} h={h} />)}{!s.tx.length && <Empty>Операций пока нет</Empty>}</div></div>}
    {tab === 'store' && (BAR_ORDERS ? <Shop s={s} goOrders={() => setTab('orders')} /> : code ? <div className="max-w-lg mx-auto space-y-3"><ScreenHead title="Магазин" />{CodeCard}</div> : <StoreCodes s={s} onCode={c => { setCode(c); setSt({ status: 'pending', used: 0 }) }} />)}
    {BAR_ORDERS && tab === 'orders' && <Orders />}
    {tab === 'profile' && <ProfileScreen s={s} go={goTab}>
      <PushCard />
      <Card title="Дата рождения"><div className="space-y-2"><div className="text-[13px] text-mute">Поздравим вас в ваш день 🎂</div><div className="flex gap-2"><Input type="date" max={new Date().toISOString().slice(0, 10)} value={birth ?? s.birth ?? ''} onChange={e => setBirth(e.target.value)} />
        <Btn disabled={birth === null || birth === (s.birth ?? '')} onClick={() => api.setBirth(birth).then(() => { toast('Сохранено'); setBirth(null); load() }).catch(e => toast(e.message, false))}>Сохранить</Btn></div></div></Card>
    </ProfileScreen>}
  </Shell>
}
