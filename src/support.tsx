import { useState } from 'react'
import { Bell, MessageCircle } from 'lucide-react'
import { api, Notif, Ticket } from './api'
import { maskPhone } from './lib'
import { act, Badge, Btn, Card, cx, Empty, Field, Input, Modal, PageHead, Table, Tabs, toast, useAsync } from './ui'

// Тема обращения → получатель определяется в базе (create_ticket): «Приложение» → DEV, остальное → ADMIN
const CATS: [string, string][] = [['bonus', 'Бонусы'], ['membership', 'Абонемент'], ['payment', 'Оплата'], ['visits', 'Посещения'], ['app', 'Приложение'], ['other', 'Другое']]
const CAT: Record<string, string> = { ...Object.fromEntries(CATS), password_reset: 'Восстановление пароля' }
const waLink = (phone: string) => { const d = phone.replace(/\D/g, '').replace(/^8/, '7'); return d.length >= 11 ? `https://wa.me/${d}` : '' }

/* ---------------- Клиент: Поддержка ---------------- */
export function Support() {
  const [cfg] = useAsync(api.setting), [cat, setCat] = useState(''), [text, setText] = useState(''), [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [err, setErr] = useState('')
  const wa = waLink(cfg?.whatsapp_phone ?? '')
  const send = () => { setBusy(true); setErr(''); api.createTicket(cat, text).then(() => { setSent(true); setText(''); setCat('') }).catch(e => setErr(e.message)).finally(() => setBusy(false)) }
  return <div className="max-w-xl space-y-3"><h1 className="text-2xl font-semibold tracking-tight">Поддержка</h1>
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
      <div className="text-[13px] whitespace-pre-wrap rounded-lg bg-bg border border-line p-3">{sel.description}</div>
      {sel.category === 'password_reset' && dev && <Card title="Восстановление доступа"><div className="space-y-2 text-[13px]">
        {tmp ? <><div>Временный пароль (показывается один раз):</div><div className="text-2xl font-semibold tracking-wider text-gold select-all">{tmp}</div><div className="text-mute">Сообщите его клиенту по телефону или в WhatsApp. При входе приложение попросит задать новый пароль.</div></>
          : <><div className="text-mute">Проверьте, что вам пишет владелец номера (позвоните ему). Затем выдайте временный пароль — старый перестанет работать, текущий пароль клиента никто не видит.</div>
            <Btn onClick={() => api.resetPassword(sel.id).then(setTmp).then(reload).catch(e => toast(e.message, false))}>Выдать временный пароль</Btn></>}</div></Card>}
      <div className="flex flex-wrap gap-1.5">{sel.status !== 'in_progress' && <Btn v="secondary" onClick={() => set(sel, 'in_progress')}>В работу</Btn>}{sel.status !== 'resolved' && <Btn onClick={() => set(sel, 'resolved')}>Решено</Btn>}{sel.status !== 'closed' && <Btn v="ghost" onClick={() => set(sel, 'closed')}>Закрыть</Btn>}</div>
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
  const click = (x: Notif) => { if (!x.is_read) api.markRead([x.id]).then(reload); const to = x.type === 'subscription_expiring' ? 'renew' : x.type === 'new_promotion' ? 'home' : x.type === 'referral_bonus' ? 'history' : ''; if (to) { setOpen(false); go(to) } else setL(ls => ls?.map(y => y.id === x.id ? { ...y, is_read: true } : y) ?? null) }
  return <><button onClick={show} className="relative h-8 w-8 grid place-items-center rounded-lg text-mute hover:text-white hover:bg-hover" aria-label="Уведомления"><Bell size={17} />{count > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-gold text-black text-[10px] font-semibold grid place-items-center">{count > 9 ? '9+' : count}</span>}</button>
    {open && <Modal drawer title="Уведомления" onClose={() => setOpen(false)}>
      {count > 0 && <Btn v="ghost" onClick={() => api.markRead().then(() => { reload(); setL(ls => ls?.map(y => ({ ...y, is_read: true })) ?? null) })}>Прочитать все</Btn>}
      {l === null ? <Empty>Загрузка…</Empty> : !l.length ? <Empty>Уведомлений пока нет</Empty> : <div className="-mx-4">{l.map((x, i) => <div key={x.id}>
        {(i === 0 || day(l[i - 1].created_at) !== day(x.created_at)) && <div className="px-4 pt-3 pb-1 text-xs text-mute">{day(x.created_at)}</div>}
        <button onClick={() => click(x)} className="w-full text-left px-4 py-3 border-t border-line hover:bg-hover flex gap-3"><span className={cx('mt-1.5 w-2 h-2 rounded-full shrink-0', x.is_read ? 'bg-transparent' : 'bg-red-500')} /><span><div className={cx(x.is_read ? 'text-mute' : 'font-medium')}>{x.title}</div><div className="text-[13px] text-mute">{x.message}{x.type === 'new_promotion' && <span className="text-gold"> Подробнее →</span>}</div></span></button></div>)}</div>}
    </Modal>}</>
}
