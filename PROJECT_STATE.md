# PROJECT_STATE — Formula Bonus

## Этапы 1–3 — готовы (build без ошибок)
- Vite + React + TS + Tailwind, сборка без ошибок (`npm run build`).
- UI на demo-данных (без БД): переключатель «Клиент (телефон) / Сотрудник (ПК)».
  - Клиент: баланс, action-карточки (сгорание, продление, реферал), Formula Store с лимитом Bonus, выдача кода, история.
  - Админ: KPI-заглушки + поле быстрого списания (пока не подключено).
- Supabase-схема: `supabase/migrations/001_schema.sql` (таблицы, RLS, RPC).

## Структура
- src/App.tsx (Client, Admin), src/demo.ts, src/lib.ts (supabase client, kzt, maxBonus), src/index.css
- supabase/migrations/001_schema.sql
- tailwind.config.js (цвета ink/chalk/volt/amber/mint; шрифты Unbounded + Manrope)

## Supabase schema
Таблицы: profiles, memberships, bonus_wallets, bonus_transactions (ledger, accrual-строки = партии с remaining/expires_at), rewards, redemptions, referrals, audit_logs.
RPC (security definer): create_redemption(reward), confirm_redemption(code) — FIFO по сроку, лимит max_bonus_pct, accrue_bonus(client, purchase, pct), expire_bonus() (только для cron).
RLS: клиент читает своё, staff читает всё, прямых записей в ledger/wallet нет.

## Env (без секретов)
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (см. .env.example). Без них приложение работает на demo-данных.

## Что работает (Этапы 2–3)
- src/api.ts: два режима. Без env — demo на localStorage (полный флоу: код → списание на «ПК» → баланс/история; FIFO по сроку; начисление 5%). С env — реальный Supabase (Auth, RLS, RPC create_redemption / confirm_redemption).
- Клиент: код списания, статус «ждём → списано», обновление каждые 3 с. Админ: поиск кода, превью (клиент, баланс, сумма Bonus, доплата), «Списать», начисление (demo).
- Вход по почте/паролю; роль staff/admin → админка, иначе клиент.
- PWA (manifest + sw.js), .github/workflows/deploy.yml (GitHub Pages), supabase/migrations/002_seed.sql (триггер профиля, магазин, demo-данные).

## Осталось
Этап 4: админ-разделы (клиенты, магазин CRUD, рефералы, акции, транзакции, списки «заканчивается/сгорает»), начисление через БД (accrue_bonus по выбору клиента).
Этап 5: confirm_referral RPC, pg_cron для expire_bonus, реальные KPI, QR-код, профиль.

## Следующий шаг
Этап 4: поиск клиента по телефону/имени в админке + accrue_bonus через RPC.

## Env
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (GitHub → Settings → Secrets → Actions). Без них — demo-режим.

## Известные баги / заметки
- Аналитика в админке — заглушки. Рефералы: RPC нет. QR-кода нет (крупный текстовый код).
- Миграции 001 и 002 ещё не применены к живому проекту Supabase.
