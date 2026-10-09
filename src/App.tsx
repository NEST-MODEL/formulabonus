import { useEffect, useState } from 'react'
import { api } from './api'
import { fmtPhone, lostSession, logout, markSession, supabase } from './lib'
import Admin from './admin'
import Client from './client'
import { BarApp } from './bar'
import { Btn, Input, Logo, Toasts } from './ui'

const PhoneInput = ({ value, set }: { value: string; set: (v: string) => void }) =>
  <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 (___) ___-__-__" value={value} onFocus={() => { if (!value) set('+7') }} onChange={e => set(fmtPhone(e.target.value))} />
const Label = ({ t }: { t: string }) => <div className="text-xs text-mute -mb-1.5">{t}</div>

// Ссылка-приглашение вида …/formulabonus/?ref=КОД: открывает регистрацию с подставленным кодом друга
const readRef = () => { try { const q = new URLSearchParams(location.search).get('ref'); if (q) { sessionStorage.setItem('fb-ref', q.toUpperCase().slice(0, 16)); history.replaceState(null, '', import.meta.env.BASE_URL) } return sessionStorage.getItem('fb-ref') ?? '' } catch { return '' } }
function Auth() {
  const invited = useState(readRef)[0]
  const [mode, setMode] = useState<'login' | 'reg' | 'forgot' | 'sent' | 'email'>(invited ? 'reg' : 'login'), [f, setF] = useState({ name: '', phone: '', email: '', pass: '', ref: invited })
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), lost = lostSession()
  const u = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value }), go = (m: typeof mode) => { setMode(m); setErr('') }
  const run = (p: Promise<any>, next?: typeof mode) => { setBusy(true); setErr(''); p.then(() => next && setMode(next)).catch(e => setErr(e.message)).finally(() => setBusy(false)) }
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (busy) return
    if (mode === 'login') run(api.signInPhone(f.phone, f.pass)); else if (mode === 'email') run(api.signIn(f.email, f.pass))
    else if (mode === 'reg') run(api.signUp(f.name, f.phone, f.pass, f.ref)); else if (mode === 'forgot') run(api.requestReset(f.phone), 'sent') }
  const title = { login: 'Вход в Formula', email: 'Вход по почте', reg: 'Добро пожаловать в Formula 👋', forgot: 'Восстановление доступа', sent: 'Запрос отправлен' }[mode]
  return <div className="min-h-screen grid lg:grid-cols-2">
    <div className="p-8 lg:p-16 flex flex-col justify-center gap-5 lg:border-r border-line"><Logo />
      <h1 className="text-3xl lg:text-5xl font-semibold tracking-tight leading-[1.1]">Твои тренировки<br />приносят <span className="text-gold">бонусы</span></h1>
      <p className="text-mute max-w-md text-[15px]">Копи Bonus за абонементы и покупки в клубе и обменивай их на скидки и подарки.</p></div>
    <div className="p-6 lg:p-16 flex items-center"><form onSubmit={submit} className="w-full max-w-sm mx-auto space-y-3">
      {lost && (mode === 'login' || mode === 'email') && <div className="rounded-lg border border-gold/40 bg-gold/5 px-3 py-2.5 text-[13px]"><b className="text-gold">НЕ БЕСПОКОЙТЕСЬ!</b> Наше приложение было обновлено, ваша сессия была завершена для безопасности ваших данных, пожалуйста войдите повторно ❤️</div>}
      <div className="text-lg font-semibold">{title}</div>
      {mode === 'reg' && invited && <div className="rounded-lg border border-gold/40 bg-gold/5 px-3 py-2 text-[13px]">🎁 Вас пригласил друг — код <b className="text-gold">{invited}</b> уже подставлен</div>}
      {mode === 'sent' ? <><div className="text-[13px] text-mute">Мы передали запрос на восстановление доступа ответственному сотруднику. Ожидайте связи.</div><Btn type="button" className="w-full !h-10" onClick={() => go('login')}>Вернуться ко входу</Btn></> : <>
        {mode === 'reg' && <><Label t="Имя" /><Input autoComplete="given-name" placeholder="Алексей" value={f.name} onChange={u('name')} /></>}
        {mode === 'email' ? <><Label t="Почта" /><Input type="email" autoComplete="email" value={f.email} onChange={u('email')} /></> : <><Label t={mode === 'forgot' ? 'Введите номер телефона' : 'Номер телефона'} /><PhoneInput value={f.phone} set={v => setF({ ...f, phone: v })} /></>}
        {mode !== 'forgot' && <><Label t="Пароль" /><Input type="password" autoComplete={mode === 'reg' ? 'new-password' : 'current-password'} placeholder="••••••••" value={f.pass} onChange={u('pass')} /></>}
        {mode === 'reg' && <Input className="uppercase" placeholder="Код друга (необязательно)" value={f.ref} onChange={u('ref')} />}
        {err && <div className="text-red-400 text-[13px]">{err}</div>}
        <Btn type="submit" className="w-full !h-10" disabled={busy}>{busy ? 'Подождите…' : { login: 'Войти', email: 'Войти', reg: 'Зарегистрироваться', forgot: 'Отправить запрос' }[mode]}</Btn>
        {mode === 'login' && <Btn type="button" v="ghost" className="w-full" onClick={() => go('forgot')}>Забыли пароль?</Btn>}
        <div className="border-t border-line pt-3 space-y-1">
          {mode !== 'reg' && <Btn type="button" v="ghost" className="w-full" onClick={() => go('reg')}>Нет аккаунта? Зарегистрироваться</Btn>}
          {mode !== 'login' && <Btn type="button" v="ghost" className="w-full" onClick={() => go('login')}>Войти по номеру телефона</Btn>}
          {mode === 'login' && <Btn type="button" v="ghost" className="w-full text-xs" onClick={() => go('email')}>Регистрировались по почте? Войти по почте</Btn>}
        </div></>}
    </form></div></div>
}
function ChangePassword({ done }: { done: () => void }) {
  const [p, setP] = useState(''), [p2, setP2] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const save = (e: React.FormEvent) => { e.preventDefault(); if (p !== p2) return setErr('Пароли не совпадают'); setBusy(true); api.setPassword(p).then(done).catch(x => setErr(x.message)).finally(() => setBusy(false)) }
  return <div className="min-h-screen grid place-items-center p-6"><form onSubmit={save} className="w-full max-w-sm space-y-3"><Logo />
    <div className="text-lg font-semibold pt-2">Задайте новый пароль</div><div className="text-[13px] text-mute">Вы вошли по временному паролю. Придумайте свой — временный перестанет действовать.</div>
    <Input type="password" autoComplete="new-password" placeholder="Новый пароль (мин. 6)" value={p} onChange={e => setP(e.target.value)} /><Input type="password" autoComplete="new-password" placeholder="Повторите пароль" value={p2} onChange={e => setP2(e.target.value)} />
    {err && <div className="text-red-400 text-[13px]">{err}</div>}<Btn type="submit" className="w-full !h-10" disabled={busy}>Сохранить</Btn><Btn type="button" v="ghost" className="w-full" onClick={() => logout()}>Выйти</Btn></form></div>
}
export default function App() {
  const [me, setMe] = useState<{ role: string; mustChange: boolean } | null | undefined>(undefined)
  const load = () => { api.me().then(m => { if (m) markSession(); setMe(m) }).catch(() => setMe(null)) }
  useEffect(() => { if (!supabase) return; load(); const { data } = supabase.auth.onAuthStateChange(ev => { if (ev !== 'TOKEN_REFRESHED') load() }); return () => data.subscription.unsubscribe() }, [])
  const role = me?.role
  const body = !supabase ? <div className="max-w-md mx-auto mt-20 p-6 border border-line rounded-xl">Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.</div>
    : me === undefined ? <div className="p-8 text-center text-mute">Загрузка…</div> : me === null ? <Auth /> : me.mustChange ? <ChangePassword done={load} />
    : role === 'client' ? <Client /> : role === 'bartender' ? <BarApp /> : <Admin who={role === 'dev' ? 'Разработчик' : 'Админ'} role={role!} />
  return <>{body}<Toasts /></>
}
