# Formula Bonus
1. Supabase → SQL Editor: выполнить по порядку `supabase/migrations/001_schema.sql`, `002_seed.sql`, `003_product.sql`, `004_codes_promos.sql`, `005_stats_promos.sql`, `006_annual_referral.sql`, `007_plans.sql`, `008_shop_orders.sql`, `009_kaspi_checkout.sql`, `010_auth_support_notifications.sql`, `011_ticket_replies.sql`, `012_push.sql`, `013_push_setup.sql`, `014_referral_screen.sql`.
2. Supabase → Authentication → Providers → Email: выключить «Confirm email».
3. `.env` (см. `.env.example`): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY. `npm i && npm run dev`.
4. Первый зарегистрированный пользователь автоматически становится админом, остальные — клиентами.
5. Деплой: push в `main` → GitHub Actions → Pages (Settings → Pages → Source: GitHub Actions); секреты в Settings → Secrets → Actions.

## Push-уведомления (в шторку телефона)
1. SQL Editor: выполнить `supabase/migrations/012_push.sql`.
2. В папке проекта: `npx web-push generate-vapid-keys` → появятся Public Key и Private Key.
3. GitHub → Settings → Secrets → Actions: `VITE_VAPID_PUBLIC_KEY` = Public Key.
4. Supabase → Edge Functions → Deploy a new function → Via Editor: имя `send-push`, вставить `supabase/functions/send-push/index.ts`, Deploy. В настройках функции выключить «Verify JWT» (функция проверяет свой секрет).
5. SQL Editor: выполнить `supabase/migrations/013_push_setup.sql` и скопировать показанный секрет.
6. Supabase → Edge Functions → Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:ваша@почта`), `PUSH_SECRET` (секрет из шага 5).
7. git push → после деплоя на телефоне: Профиль → «Включить уведомления».
