import { createPortal } from 'react-dom'
import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LogOut, Menu, X, type LucideIcon } from 'lucide-react'
import { logout } from './lib'
export const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ')
export const num = (v: string) => v.replace(/\D/g, '')
export function useAsync<T>(f: () => Promise<T>, every = 0, deps: any[] = []) {
  const [d, setD] = useState<T | null>(null), load = useCallback(() => { f().then(setD).catch(() => {}) }, deps) // eslint-disable-line
  useEffect(() => { load(); if (!every) return; const t = setInterval(load, every); return () => clearInterval(t) }, [load, every])
  return [d, load] as const
}
/* toast */
let push: (t: { ok: boolean; m: string }) => void = () => {}
export const toast = (m: string, ok = true) => push({ ok, m })
export const act = (f: () => Promise<string>, after?: () => void) => f().then(m => { toast(m); after?.() }).catch(e => toast(e.message, false))
export function Toasts() {
  const [t, setT] = useState<{ ok: boolean; m: string } | null>(null)
  useEffect(() => { push = x => { setT(x); setTimeout(() => setT(null), 3200) } }, [])
  return t ? <div className={cx('fixed bottom-20 md:bottom-6 right-4 z-[60] rounded-lg border px-4 py-2.5 text-[13px] bg-surface', t.ok ? 'border-gold/40' : 'border-red-500/40 text-red-400')}>{t.m}</div> : null
}
export function csv(name: string, head: string[], rows: (string | number)[][]) {
  const b = new Blob(['\ufeff' + [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv' }), a = document.createElement('a')
  a.href = URL.createObjectURL(b); a.download = name + '.csv'; a.click()
}
/* primitives */
export const Btn = ({ v = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { v?: 'primary' | 'secondary' | 'danger' | 'ghost' }) =>
  <button {...p} className={cx('h-8 px-3 rounded-lg text-[13px] font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-40 whitespace-nowrap',
    v === 'primary' && 'bg-gold text-black hover:brightness-95', v === 'secondary' && 'bg-surface border border-line hover:bg-hover', v === 'danger' && 'bg-red-500/10 text-red-400 border border-red-500/30', v === 'ghost' && 'text-mute hover:text-white hover:bg-hover', className)} />
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx('h-9 w-full rounded-lg bg-bg border border-line px-3 outline-none focus:border-gold/60 placeholder:text-mute/60', className)} />
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx('h-9 rounded-lg bg-bg border border-line px-2.5 outline-none focus:border-gold/60', className)} />
export const Field = ({ l, children }: { l: string; children: ReactNode }) => <label className="block space-y-1.5"><span className="text-xs text-mute">{l}</span>{children}</label>
const tones = { gray: 'bg-white/5 text-mute', gold: 'bg-gold/10 text-gold', green: 'bg-emerald-500/10 text-emerald-400', red: 'bg-red-500/10 text-red-400' }
export const Badge = ({ t = 'gray', children }: { t?: keyof typeof tones; children: ReactNode }) => <span className={cx('inline-flex items-center h-5 px-2 rounded-md text-xs font-medium', tones[t])}>{children}</span>
export const Card = ({ title, action, children, pad = true }: { title?: string; action?: ReactNode; children: ReactNode; pad?: boolean }) =>
  <section className="bg-surface border border-line rounded-xl">{title && <div className="flex items-center justify-between px-4 h-11 border-b border-line"><h2 className="font-medium text-[15px]">{title}</h2>{action}</div>}<div className={pad ? 'p-4' : ''}>{children}</div></section>
export const Empty = ({ children }: { children: ReactNode }) => <div className="py-10 text-center text-mute text-[13px]">{children}</div>
export const PageHead = ({ title, children }: { title: string; children?: ReactNode }) => <div className="flex flex-wrap items-center justify-between gap-3 mb-5"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><div className="flex flex-wrap gap-2 items-center">{children}</div></div>
/* Окна и «назад»: каждое открытое окно — отдельная запись в истории, поэтому свайп от края / кнопка «Назад»
   закрывают окно, а не приложение. Окна рисуются в document.body (portal) — так их не прячут анимированные блоки. */
type Entry = { id: string; close: () => void; popped: boolean }
const modalStack: Entry[] = []
let navListener = false
const installNav = () => {
  if (navListener || typeof window === 'undefined') return; navListener = true
  addEventListener('popstate', e => {
    const st = (e.state ?? {}) as { fb?: string; id?: string }
    const top = modalStack[modalStack.length - 1]
    if (top && st.id !== top.id) { top.popped = true; top.close(); return }   // «назад» при открытом окне — закрываем его
    if (!top && st.fb === 'modal') history.back()                              // устаревшая запись закрытого окна — пропускаем
  })
}
export function Modal({ title, onClose, children, drawer }: { title: string; onClose: () => void; children: ReactNode; drawer?: boolean }) {
  const close = useRef(onClose); close.current = onClose
  useEffect(() => {
    installNav()
    const me: Entry = { id: Math.random().toString(36).slice(2), close: () => close.current(), popped: false }
    modalStack.push(me); try { history.pushState({ ...(history.state ?? {}), fb: 'modal', id: me.id }, '') } catch { /* ignore */ }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && modalStack[modalStack.length - 1] === me) close.current() }
    addEventListener('keydown', esc)
    return () => {
      removeEventListener('keydown', esc); const i = modalStack.indexOf(me); if (i >= 0) modalStack.splice(i, 1)
      if (!me.popped && history.state?.id === me.id) history.back()            // закрыли кнопкой — убираем свою запись
    }
  }, [])
  return createPortal(<div data-modal className="fixed inset-0 z-[70] flex bg-black/70 backdrop-blur-[2px] fb-fade" onMouseDown={onClose}><div onMouseDown={e => e.stopPropagation()} className={cx('bg-surface border-line overflow-y-auto overscroll-contain', drawer ? 'ml-auto h-full w-full max-w-lg border-l fb-slide pb-[env(safe-area-inset-bottom)]' : 'm-auto w-full max-w-md max-h-[90vh] border rounded-2xl fb-pop')}>
    <div className="flex items-center justify-between px-4 h-12 border-b border-line sticky top-0 bg-surface z-10 pt-[env(safe-area-inset-top)] box-content"><div className="font-medium">{title}</div><Btn v="ghost" className="!px-2" onClick={onClose} aria-label="Закрыть"><X size={16} /></Btn></div><div className="p-4 space-y-4">{children}</div></div></div>, document.body)
}
export function Confirm({ title, text, yes = 'Удалить', onYes, onClose }: { title: string; text: string; yes?: string; onYes: () => Promise<any>; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  return <Modal title={title} onClose={onClose}><div className="text-[13px] text-mute">{text}</div><div className="flex justify-end gap-2"><Btn v="secondary" onClick={onClose}>Отмена</Btn><Btn v="danger" disabled={busy} onClick={() => { setBusy(true); onYes().finally(() => { setBusy(false); onClose() }) }}>{yes}</Btn></div></Modal>
}
export function Tabs({ tabs, cur, set }: { tabs: [string, string][]; cur: string; set: (k: string) => void }) {
  return <div className="flex gap-1 border-b border-line">{tabs.map(([k, l]) => <button key={k} onClick={() => set(k)} className={cx('px-3 h-9 text-[13px] -mb-px border-b-2', cur === k ? 'border-gold text-white' : 'border-transparent text-mute hover:text-white')}>{l}</button>)}</div>
}
export type Col<T> = { h: string; r: (x: T) => ReactNode; cls?: string }
export function Table<T>({ cols, rows, onRow, size = 10, empty = 'Нет данных' }: { cols: Col<T>[]; rows: T[]; onRow?: (x: T) => void; size?: number; empty?: string }) {
  const [p, setP] = useState(0), pages = Math.max(1, Math.ceil(rows.length / size)), pg = Math.min(p, pages - 1)
  return <div><div className="overflow-x-auto"><table className="w-full"><thead><tr className="text-xs text-mute text-left">{cols.map(c => <th key={c.h} className={cx('font-normal px-4 h-9', c.cls)}>{c.h}</th>)}</tr></thead>
    <tbody>{rows.slice(pg * size, (pg + 1) * size).map((x, i) => <tr key={i} onClick={() => onRow?.(x)} className={cx('border-t border-line hover:bg-hover', onRow && 'cursor-pointer')}>{cols.map(c => <td key={c.h} className={cx('px-4 h-11', c.cls)}>{c.r(x)}</td>)}</tr>)}</tbody></table></div>
    {!rows.length && <Empty>{empty}</Empty>}
    {rows.length > size && <div className="flex items-center justify-between px-4 h-10 border-t border-line text-xs text-mute"><span>{pg * size + 1}–{Math.min(rows.length, (pg + 1) * size)} из {rows.length}</span><div className="flex gap-1"><Btn v="ghost" className="!px-1.5 !h-7" disabled={pg === 0} onClick={() => setP(pg - 1)}><ChevronLeft size={14} /></Btn><Btn v="ghost" className="!px-1.5 !h-7" disabled={pg >= pages - 1} onClick={() => setP(pg + 1)}><ChevronRight size={14} /></Btn></div></div>}</div>
}
/* PWA install */
let deferred: any = null; const subs = new Set<() => void>()
if (typeof window !== 'undefined') { addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; subs.forEach(f => f()) }); addEventListener('appinstalled', () => { deferred = null; subs.forEach(f => f()) }) }
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export function Install({ compact }: { compact?: boolean }) {
  const [, tick] = useState(0), [help, setHelp] = useState(false)
  useEffect(() => { const f = () => tick(x => x + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  if (standalone() || (!deferred && !isIOS())) return null
  return <><Btn v="secondary" className={compact ? '!px-2.5' : 'w-full'} onClick={async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; tick(x => x + 1) } else setHelp(true) }}>📲 {compact ? 'Установить' : 'Установить Formula Bonus'}</Btn>
    {help && <Modal title="Установка на iPhone / iPad" onClose={() => setHelp(false)}><ol className="space-y-2 text-[13px] list-decimal pl-5"><li>Откройте сайт в Safari.</li><li>Нажмите «Поделиться» (квадрат со стрелкой).</li><li>Выберите «На экран “Домой”» → «Добавить».</li></ol><div className="text-mute text-xs">Поделиться → На экран «Домой» → Добавить</div></Modal>}</>
}
/* layout */
export const Logo = () => <div className="flex items-center gap-2"><svg width="22" height="19" viewBox="0 0 30 26"><path d="M8 0h22l-3 6H14l-1 4h11l-3 6H11l-3 10H2z" fill="#FFD21C" /></svg><span className="font-semibold tracking-tight">Formula <span className="text-gold">Bonus</span></span></div>
export function Shell({ items, cur, set, who, bottom, extra, children }: { items: [string, string, LucideIcon][]; cur: string; set: (k: string) => void; who: string; bottom?: boolean; extra?: ReactNode; children: ReactNode }) {
  // bottom = клиентский режим: на телефоне без верхней панели (у экранов свои заголовки), снизу — панель вкладок
  const [open, setOpen] = useState(false)
  const Side = ({ cb }: { cb?: () => void }) => <><div className="px-2 h-9 flex items-center justify-between mb-3"><Logo />{extra}</div><nav className="space-y-0.5">{items.map(([k, l, I]) => <button key={k} onClick={() => { set(k); cb?.() }} className={cx('flex items-center gap-2.5 h-8 px-2.5 rounded-lg text-[13px] w-full', cur === k ? 'bg-gold/10 text-gold' : 'text-mute hover:text-white hover:bg-hover')}><I size={16} />{l}</button>)}</nav>
    <div className="mt-auto pb-3"><Install /></div><div className="border-t border-line pt-3 flex items-center justify-between px-1"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-hover border border-line grid place-items-center text-xs">{who[0].toUpperCase()}</div><span className="text-[13px]">{who}</span></div><Btn v="ghost" className="!px-2" onClick={() => logout()} title="Выйти"><LogOut size={15} /></Btn></div></>
  return <div className="min-h-screen">
    <aside className={cx('hidden fixed inset-y-0 left-0 w-56 bg-side border-r border-line p-3 flex-col', bottom ? 'md:flex' : 'lg:flex')}><Side /></aside>
    {!bottom && <header className="flex items-center justify-between h-12 px-4 border-b border-line sticky top-0 bg-bg z-30 lg:hidden"><Logo /><div className="flex items-center gap-1">{extra}<Install compact />{bottom ? <Btn v="ghost" className="!px-2" onClick={() => logout()}><LogOut size={16} /></Btn> : <Btn v="ghost" className="!px-2" onClick={() => setOpen(true)}><Menu size={18} /></Btn>}</div></header>}
    {open && <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setOpen(false)}><aside onClick={e => e.stopPropagation()} className="w-56 h-full bg-side border-r border-line p-3 flex flex-col"><Side cb={() => setOpen(false)} /></aside></div>}
    <main className={cx('p-4 md:p-6 max-w-[1200px]', bottom ? 'md:ml-56 pt-[max(1rem,env(safe-area-inset-top))] pb-28 md:pb-6' : 'lg:ml-56')}>{children}</main>
    {bottom && <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2 bg-gradient-to-t from-bg via-bg/95 to-transparent">
      <div className="grid rounded-2xl border border-line bg-[#111]/95 backdrop-blur px-1 py-1.5" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>{items.map(([k, l, I]) => <button key={k} onClick={() => set(k)} className={cx('press flex flex-col items-center gap-1 py-1 text-[10px] font-medium', cur === k ? 'text-gold' : 'text-mute')}>
        <span className={cx('grid place-items-center h-7 w-11 rounded-xl', cur === k && 'bg-gold/15')}><I size={18} /></span>{l}</button>)}</div></nav>}
  </div>
}
