import { useEffect, useState } from 'react'
import { Bell, MessageCircle } from 'lucide-react'
import { api, Msg, Notif, Ticket } from './api'
import { maskPhone } from './lib'
import { act, Badge, Btn, Card, cx, Empty, Field, Input, Modal, PageHead, Table, Tabs, toast, useAsync } from './ui'

// Тема обращения → получатель определяется в базе (create_ticket): «Приложение» → DEV, остальное → ADMIN
const CATS: [string, string][] = [['bonus', 'Бонусы'], ['membership', 'Абонемент'], ['payment', 'Оплата'], ['visits', 'Посещения'], ['app', 'Приложение'], ['other', 'Другое']]
const CAT: Record<string, string> = { ...Object.fromEntries(CATS), password_reset: 'Восстановление пароля' }
const waLink = (phone: string) => { const d = phone.replace(/\D/g, '').replace(/^8/, '7'); return d.length >= 11 ? `https://wa.me/${d}` : '' }


const when = (t: string) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
/* Переписка по тикету (не живой чат: сообщения подгружаются при открытии и после отправки) */
function Thread({ t, staff, onChange }: { t: Ticket; staff: boolean; onChange: () => void }) {
  const [m, setM] = useState<Msg[] | null>(null), [text, setText] = useState(''), [busy, setBusy] = useState(false)
  const load = () => { api.messages(t.id).then(setM).catch(() => setM([])) }
  useEffect(load, [t.id]) // eslint-disable-line
  const send = () => { setBusy(true); api.reply(t.id, text).then(() => { setText(''); load(); onChange() }).catch(e => toast(e.message, false)).finally(() => setBusy(false)) }
  const closed = t.status === 'closed'
  const Bubble = ({ mine, who, body, at }: { mine: boolean; who: string; body: string; at: string }) =>
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}><div className={cx('max-w-[85%] rounded-xl px-3 py-2 border', mine ? 'bg-gold/10 border-gold/30' : 'bg-bg border-line')}>
      <div className="text-[11px] text-mute mb-0.5">{who} · {when(at)}</div><div className="text-[13px] whitespace-pre-wrap break-words">{body}</div></div></div>
  return <div className="space-y-3">
    <div className="space-y-2">
      <Bubble mine={!staff} who={staff ? (t.client_name ?? 'Клиент') : 'Вы'} body={t.description} at={t.created_at} />
      {m === null ? <Empty>Загрузка…</Empty> : m.map(x => <Bubble key={x.id} mine={x.from_staff === staff} who={x.from_staff ? (staff ? 'Вы' : 'Поддержка Formula') : (staff ? (t.client_name ?? 'Клиент') : 'Вы')} body={x.body} at={x.created_at} />)}
      {!staff && m !== null && !m.some(x => x.from_staff) && !closed && <div className="text-xs text-mute text-center">Ответ появится здесь, мы пришлём уведомление 🔔</div>}
    </div>
    {closed ? <div className="text-[13px] text-mute text-center border-t border-line pt-3">Обращение закрыто</div>
      : <div className="space-y-2 border-t border-line pt-3"><textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} rows={3} placeholder={staff ? 'Ответ клиенту…' : 'Дополнить обращение…'} className="w-full rounded-lg bg-bg border border-line px-3 py-2 outline-none focus:border-gold/60 placeholder:text-mute/60 resize-none" />
        <Btn className="w-full" disabled={busy || !text.trim()} onClick={send}>{staff ? 'Ответить клиенту' : 'Отправить'}</Btn></div>}
  </div>
}

/* ---------------- Клиент: Поддержка ---------------- */
export function Support() {
  const [cfg] = useAsync(api.setting), [cat, setCat] = useState(''), [text, setText] = useState(''), [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [err, setErr] = useState('')
  const wa = waLink(cfg?.whatsapp_phone ?? ''), [mine, loadMine] = useAsync(api.myTickets), [open, setOpen] = useState<Ticket | null>(null)
  const send = () => { setBusy(true); setErr(''); api.createTicket(cat, text).then(() => { setSent(true); setText(''); setCat(''); loadMine() }).catch(e => setErr(e.message)).finally(() => setBusy(false)) }
  const CST: Record<string, [string, any]> = { open: ['Ожидает ответа', 'gray'], in_progress: ['Есть ответ', 'gold'], resolved: ['Решено', 'green'], closed: ['Закрыто', 'gray'] }
  return <div className="max-w-xl space-y-3"><h1 className="text-2xl font-semibold tracking-tight">Поддержка</h1>
    {!!mine?.length && <Card title="Мои обращения" pad={false}>{mine.map(t => <button key={t.id} onClick={() => setOpen(t)} className="w-full text-left px-4 py-3 border-t first:border-t-0 border-line hover:bg-hover flex items-center justify-between gap-3">
      <span className="min-w-0"><div className="font-medium">{CAT[t.category] ?? t.category}</div><div className="text-xs text-mute truncate">{t.description}</div></span><Badge t={CST[t.status][1]}>{CST[t.status][0]}</Badge></button>)}</Card>}
    {open && <Modal drawer title={CAT[open.category] ?? 'Обращение'} onClose={() => { setOpen(null); loadMine() }}>
      <Thread t={open} staff={false} onChange={loadMine} />
      {open.status !== 'closed' && <Btn v="ghost" className="w-full" onClick={() => act(async () => { await api.setTicket(open.id, 'closed'); return 'Обращение закрыто' }, () => { setOpen(null); loadMine() })}>Вопрос решён — закрыть обращение</Btn>}</Modal>}
    <Card title="📝 Написать в поддержку">{sent ? <div className="space-y-3 py-2"><div className="font-medium text-emerald-400">Обращение отправлено</div><div className="text-[13px] text-mute">Спасибо! Ваш вопрос передан ответственному сотруднику.</div><Btn v="secondary" onClick={() => setSent(false)}>Новое обращение</Btn></div>
      : <div className="space-y-3"><div><div className="text-xs text-mute mb-1.5">Тема</div><div className="flex flex-wrap gap-1.5">{CATS.map(([k, l]) => <Btn key={k} v={cat === k ? 'primary' : 'secondary'} onClick={() => setCat(k)}>{l}</Btn>)}</div></div>
        <Field l="Описание"><textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} rows={5} placeholder="Опишите ваш вопрос или проблему..." className="w-full rounded-lg bg-bg border border-line px-3 py-2 outline-none focus:border-gold/60 placeholder:text-mute/60 resize-none" /></Field>
        {err && <div className="text-red-400 text-[13px]">{err}</div>}
        <Btn className="w-full !h-10" disabled={busy || !cat || text.trim().length < 3} onClick={send}>Отправить</Btn></div>}</Card>
    <Card title="📱 Срочный вопрос"><div className="space-y-3"><div className="text-[13px] text-mute">Если вам нужно быстро получить ответ, напишите менеджеру Формулы в WhatsApp.</div>
      {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="h-10 rounded-lg bg-gold text-black font-semibold flex items-center justify-center gap-2"><MessageCircle size={16} />Открыть WhatsApp</a> : <div className="text-[13px] text-mute">Номер WhatsApp скоро появится.</div>}</div></Card></div>
}

/* ---------------- Админ / DEV: обращения ---------------- */
const ST: Record<string, [string, any]> = { open: ['Новое', 'red'], in_progress: ['В работе', 'gold'], resolved: ['Решено', 'green'], closed: ['Закрыто', 'gray'] }
export function SupportAdmin({ role }: { role: string }) {
  const dev = role === 'dev', [type, setType] = useState(dev ? 'technical' : 'formula'), [st, setSt] = useState('open')
  const [l, load] = useAsync(() => api.tickets(type, st), 0, [type, st]), [n, loadN] = useAsync(() => api.ticketCounts(type), 0, [type]), [sel, setSel] = useState<Ticket | null>(null), [tmp, setTmp] = useState(''), [full, setFull] = useState(false)
  const reload = () => { load(); loadN() }
  const set = (t: Ticket, s: string) => act(async () => { await api.setTicket(t.id, s); return 'Статус обновлён' }, () => { setSel(null); reload() })
  return <div><PageHead title={dev && type === 'technical' ? '🛠️ Техническая поддержка' : 'Поддержка'} />
    {dev && <div className="mb-3"><Tabs cur={type} set={k => { setType(k); setSt('open') }} tabs={[['technical', 'Техника'], ['formula', 'Формула']]} /></div>}
    <div className="grid grid-cols-3 gap-px bg-line border border-line rounded-xl overflow-hidden mb-4">{([['open', 'Новые', n?.open], ['in_progress', 'В работе', n?.progress], ['closed', 'Закрытые', n?.closed]] as const).map(([k, l2, v]) =>
      <button key={k} onClick={() => setSt(k)} className={cx('bg-surface p-4 text-left hover:bg-hover', st === k && 'ring-1 ring-inset ring-gold/50')}><div className="text-xs text-mute">{l2}</div><div className="text-xl font-semibold mt-1">{v ?? '—'}</div></button>)}</div>
    <Card pad={false}><Table rows={l ?? []} onRow={t => { setSel(t); setTmp(''); setFull(false) }} empty="Обращений нет" cols={[
      { h: 'Тема', r: t => <b className="font-medium">{CAT[t.category] ?? t.category}</b> }, { h: 'Клиент', r: t => t.client_name ?? '—' }, { h: 'Телефон', r: t => maskPhone(t.phone), cls: 'hidden md:table-cell' },
      { h: 'Дата', r: t => new Date(t.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }), cls: 'hidden md:table-cell' },
      { h: 'Статус', r: t => <Badge t={ST[t.status][1]}>{t.status === 'open' ? '🔴 ' : ''}{ST[t.status][0]}</Badge> }]} /></Card>
    {type === 'formula' && <WhatsAppSetting />}
    {sel && <Modal drawer title={CAT[sel.category] ?? sel.category} onClose={() => setSel(null)}>
      <div className="border border-line rounded-lg divide-y divide-line text-[13px]">{[['Клиент', sel.client_name ?? 'Аккаунт не найден'], ['Телефон', full ? (sel.phone ?? '—') : maskPhone(sel.phone)], ['Дата', new Date(sel.created_at).toLocaleString('ru-RU')], ['Статус', ST[sel.status][0]]].map(([a, b]) => <div key={a} className="flex justify-between px-3 py-2"><span className="text-mute">{a}</span><b className="font-medium">{b}</b></div>)}</div>
      {!full && sel.phone && <Btn v="ghost" onClick={() => setFull(true)}>Показать номер для связи</Btn>}
      {sel.category === 'password_reset' && dev && <Card title="Восстановление доступа"><div className="space-y-2 text-[13px]">
        {tmp ? <><div>Временный пароль (показывается один раз):</div><div className="text-2xl font-semibold tracking-wider text-gold select-all">{tmp}</div><div className="text-mute">Сообщите его клиенту по телефону или в WhatsApp. При входе приложение попросит задать новый пароль.</div></>
          : <><div className="text-mute">Проверьте, что вам пишет владелец номера (позвоните ему). Затем выдайте временный пароль — старый перестанет работать, текущий пароль клиента никто не видит.</div>
            <Btn onClick={() => api.resetPassword(sel.id).then(setTmp).then(reload).catch(e => toast(e.message, false))}>Выдать временный пароль</Btn></>}</div></Card>}
      <Thread t={sel} staff onChange={reload} />
      <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">{sel.status === 'closed' ? <Btn v="secondary" onClick={() => set(sel, 'open')}>Открыть снова</Btn> : <>{sel.status !== 'resolved' && <Btn v="secondary" onClick={() => set(sel, 'resolved')}>Проблема решена</Btn>}<Btn v="ghost" onClick={() => set(sel, 'closed')}>Закрыть тикет</Btn></>}</div>
    </Modal>}</div>
}
function WhatsAppSetting() {
  const [c, load] = useAsync(api.setting), [v, setV] = useState<string | null>(null)
  return <div className="mt-6"><Card title="WhatsApp менеджера (кнопка «Срочный вопрос» у клиентов)"><div className="flex flex-wrap gap-2"><Input className="max-w-xs" placeholder="+7 7xx xxx xx xx" value={v ?? c?.whatsapp_phone ?? ''} onChange={e => setV(e.target.value)} />
    <Btn onClick={() => act(async () => { await api.saveSetting('whatsapp_phone', (v ?? c?.whatsapp_phone ?? '').trim()); return 'Сохранено' }, load)}>Сохранить</Btn></div></Card></div>
}

/* ---------------- Клиент: центр уведомлений ---------------- */
const day = (t: string) => { const d = new Date(t), n = new Date(); return d.toDateString() === n.toDateString() ? 'Сегодня' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) }
export function Bell2({ count, reload, go }: { count: number; reload: () => void; go: (tab: string) => void }) {
  const [open, setOpen] = useState(false), [l, setL] = useState<Notif[] | null>(null)
  const show = () => { setOpen(true); api.notifications().then(setL).catch(() => setL([])) }
  const click = (x: Notif) => { if (!x.is_read) api.markRead([x.id]).then(reload); const to = x.type === 'subscription_expiring' ? 'renew' : x.type === 'new_promotion' ? 'home' : x.type === 'referral_bonus' ? 'history' : x.type.startsWith('support') ? 'support' : ''; if (to) { setOpen(false); go(to) } else setL(ls => ls?.map(y => y.id === x.id ? { ...y, is_read: true } : y) ?? null) }
  return <><button onClick={show} className="relative h-8 w-8 grid place-items-center rounded-lg text-mute hover:text-white hover:bg-hover" aria-label="Уведомления"><Bell size={17} />{count > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-gold text-black text-[10px] font-semibold grid place-items-center">{count > 9 ? '9+' : count}</span>}</button>
    {open && <Modal drawer title="Уведомления" onClose={() => setOpen(false)}>
      {count > 0 && <Btn v="ghost" onClick={() => api.markRead().then(() => { reload(); setL(ls => ls?.map(y => ({ ...y, is_read: true })) ?? null) })}>Прочитать все</Btn>}
      {l === null ? <Empty>Загрузка…</Empty> : !l.length ? <Empty>Уведомлений пока нет</Empty> : <div className="-mx-4">{l.map((x, i) => <div key={x.id}>
        {(i === 0 || day(l[i - 1].created_at) !== day(x.created_at)) && <div className="px-4 pt-3 pb-1 text-xs text-mute">{day(x.created_at)}</div>}
        <button onClick={() => click(x)} className="w-full text-left px-4 py-3 border-t border-line hover:bg-hover flex gap-3"><span className={cx('mt-1.5 w-2 h-2 rounded-full shrink-0', x.is_read ? 'bg-transparent' : 'bg-red-500')} /><span><div className={cx(x.is_read ? 'text-mute' : 'font-medium')}>{x.title}</div><div className="text-[13px] text-mute">{x.message}{x.type === 'new_promotion' && <span className="text-gold"> Подробнее →</span>}</div></span></button></div>)}</div>}
    </Modal>}</>
}
