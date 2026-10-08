import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
createRoot(document.getElementById('root')!).render(<App />)

// Обновление PWA: проверяем новую версию при открытии/возврате в приложение и раз в 30 мин.
// Когда новая версия активировалась — одна аккуратная перезагрузка (не во время ввода и не при открытом окне).
function safeReload() {
  const k = 'fb-sw-reload'
  try { if (Date.now() - +(sessionStorage.getItem(k) || 0) < 15000) return } catch { /* ignore */ }
  const go = () => {
    const a = document.activeElement, busy = (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || document.querySelector('[data-modal]')
    if (busy && document.visibilityState === 'visible') { setTimeout(go, 3000); return }
    try { sessionStorage.setItem(k, String(Date.now())) } catch { /* ignore */ }
    location.reload()
  }
  go()
}
if ('serviceWorker' in navigator) window.addEventListener('load', () => {
  const B = import.meta.env.BASE_URL, hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) safeReload() })
  navigator.serviceWorker.register(B + 'sw.js', { scope: B, updateViaCache: 'none' }).then(reg => {
    const check = () => { reg.update().catch(() => {}) }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    setInterval(check, 30 * 60 * 1000)
  }).catch(() => {})
})
