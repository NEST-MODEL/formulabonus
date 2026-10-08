import { useEffect, useState } from 'react'
import { api } from './api'
import { supabase } from './lib'
import Admin from './admin'
import Client from './client'
import { BarApp } from './bar'
import { Btn, Input, Logo, Toasts } from './ui'

function Auth() {
  const [reg, setReg] = useState(false), [f, setF] = useState({ name: '', phone: '', email: '', pass: '', ref: '' }), [err, setErr] = useState('')
  const u = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  const go = () => (reg ? api.signUp(f.name, f.phone, f.email, f.pass, f.ref) : api.signIn(f.email, f.pass)).catch(e => setErr(e.message))
  return <div className="min-h-screen grid lg:grid-cols-2">
    <div className="p-8 lg:p-16 flex flex-col justify-center gap-5 lg:border-r border-line"><Logo />
      <h1 className="text-3xl lg:text-5xl font-semibold tracking-tight leading-[1.1]">Твои тренировки<br />приносят <span className="text-gold">бонусы</span></h1>
      <p className="text-mute max-w-md text-[15px]">Копи Bonus за абонементы и покупки в клубе и обменивай их на скидки и подарки.</p></div>
    <div className="p-6 lg:p-16 flex items-center"><div className="w-full max-w-sm mx-auto space-y-3">
      <div className="text-lg font-semibold">{reg ? 'Регистрация' : 'Вход'}</div>
      {reg && <><Input placeholder="Имя" value={f.name} onChange={u('name')} /><Input placeholder="Телефон" value={f.phone} onChange={u('phone')} /></>}
      <Input placeholder="Почта" value={f.email} onChange={u('email')} /><Input type="password" placeholder="Пароль (мин. 6)" value={f.pass} onChange={u('pass')} />
      {reg && <Input className="uppercase" placeholder="Код друга (необязательно)" value={f.ref} onChange={u('ref')} />}
      {err && <div className="text-red-400 text-[13px]">{err}</div>}<Btn className="w-full !h-9" onClick={go}>{reg ? 'Зарегистрироваться' : 'Войти'}</Btn>
      <Btn v="ghost" className="w-full" onClick={() => { setReg(!reg); setErr('') }}>{reg ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}</Btn></div></div></div>
}
export default function App() {
  const [role, setRole] = useState<string | null | undefined>(undefined)
  useEffect(() => { if (!supabase) return; const f = () => { api.role().then(setRole) }; f(); const { data } = supabase.auth.onAuthStateChange(f); return () => data.subscription.unsubscribe() }, [])
  const body = !supabase ? <div className="max-w-md mx-auto mt-20 p-6 border border-line rounded-xl">Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.</div>
    : role === undefined ? <div className="p-8 text-center text-mute">Загрузка…</div> : role === null ? <Auth /> : role === 'client' ? <Client /> : role === 'bartender' ? <BarApp /> : <Admin who="Админ" />
  return <>{body}<Toasts /></>
}
