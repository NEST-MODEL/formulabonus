# Formula Bonus
1. Supabase → SQL Editor: выполнить по порядку `supabase/migrations/001_schema.sql`, `002_seed.sql`, `003_product.sql`.
2. Supabase → Authentication → Providers → Email: выключить «Confirm email».
3. `.env` (см. `.env.example`): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY. `npm i && npm run dev`.
4. Первый зарегистрированный пользователь автоматически становится админом, остальные — клиентами.
5. Деплой: push в `main` → GitHub Actions → Pages (Settings → Pages → Source: GitHub Actions); секреты в Settings → Secrets → Actions.
