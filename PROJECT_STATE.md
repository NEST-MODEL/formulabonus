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

## Что работает (Этап 4, demo удалён)
- Регистрация/вход (почта+пароль+имя+телефон+код друга). Первый пользователь = admin, остальные = client (триггер handle_new_user, миграция 003).
- Клиент: баланс, сгорающие Bonus, абонемент, Formula Store, код списания со статусом, история, реферальный код.
- Админ: Dashboard (реальные KPI через admin_stats, списки «абонемент/Bonus заканчиваются», сгорание), Списание по коду, Клиенты (поиск, продажа/продление абонемента sell_membership с +5% и реферальными бонусами 3000/1000, начисление за покупку), Магазин (добавить/скрыть), Рефералы, Транзакции.
- Всё пишется в БД через RPC + RLS. Деплой: .github/workflows/deploy.yml.

## Осталось
Акции (promos), QR-код, pg_cron для expire_bonus (сейчас кнопка в Dashboard), PWA-иконки PNG, назначение сотрудников из UI (пока SQL: update profiles set role='staff'), профиль клиента.

## Следующий шаг
Применить миграции 001→003 на живом Supabase, прогнать сквозной тест, исправить найденное.

## Env
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.

## Известные баги
- Миграции не проверены на живом Supabase. Confirm email должен быть выключен.
