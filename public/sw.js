// Версия подставляется при каждой сборке (vite.config.ts → swVersion), поэтому браузер всегда видит новую версию.
const V = 'fb-__BUILD__', SCOPE = self.registration.scope
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(V).then(c => c.addAll([SCOPE, SCOPE + 'manifest.json', SCOPE + 'icon-192.png'])).catch(() => {})) })
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith('fb-') && x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())))
self.addEventListener('fetch', e => {
  const r = e.request
  if (r.method !== 'GET' || !r.url.startsWith(SCOPE)) return
  const put = (k, x) => { if (x.ok && x.type === 'basic') { const c = x.clone(); caches.open(V).then(h => h.put(k, c)) } return x }
  // Страница — всегда с сети (кэш только если офлайн): новая версия подхватывается сразу
  if (r.mode === 'navigate') { e.respondWith(fetch(r.url, { cache: 'no-cache' }).then(x => put(SCOPE, x)).catch(() => caches.match(SCOPE))); return }
  // Хэшированные Vite-ассеты неизменяемы — из кэша
  if (r.url.includes('/assets/')) { e.respondWith(caches.match(r).then(m => m || fetch(r).then(x => put(r, x)))); return }
  e.respondWith(fetch(r).then(x => put(r, x)).catch(() => caches.match(r)))
})

// Push-уведомления в шторку телефона
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {} } catch { d = { title: 'Formula Bonus', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Formula Bonus', {
    body: d.body || '', tag: d.tag, icon: SCOPE + 'icon-192.png', badge: SCOPE + 'icon-192.png', data: { url: SCOPE + (d.tab ? '?tab=' + d.tab : '') } }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || SCOPE
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const w = ws.find(x => x.url.startsWith(SCOPE))
    if (w) { w.postMessage({ type: 'open-tab', url }); return w.focus() }
    return self.clients.openWindow(url)
  }))
})
