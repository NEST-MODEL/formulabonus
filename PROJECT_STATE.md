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

## Этап 6 — redesign (готово, build ок)
- Дизайн-система src/ui.tsx (Btn, Input, Select, Badge, Card, Table+pagination, Modal/Drawer, Tabs, Toast, Shell, CSV). Inter, Lucide, radius 8–12px, токены в tailwind.config.js.
- src/admin.tsx: Обзор (KPI, графики из реальных транзакций, «Требует внимания», период 7/30/90), Списание (4-значный код), Клиенты (таблица, поиск, фильтр, drawer с абонементом/Bonus/рефералами, CSV), Магазин (таблица + modal), Акции (тип/размер/срок), Рефералы (статистика + таблица), Операции (фильтры + CSV).
- src/client.tsx: мобильный клиент (нижнее меню), блок «Пригласи друга» со статусами друзей, акции.
- Миграции: 004 (коды, акции), 005 (admin_stats(p_days), поля акций).

## Осталось
Колонка «Остаток» в магазине (нет данных), «Использования» акций (нет данных), добавление клиента админом (нужен service role/Edge Function), QR, pg_cron для сгорания, назначение сотрудников из UI.

## Следующий шаг
Применить 004 и 005, сквозной тест.
