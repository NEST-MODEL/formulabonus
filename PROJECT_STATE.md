# PROJECT_STATE — Formula Bonus
Сайт: https://nest-model.github.io/formulabonus/ (репо NEST-MODEL/formulabonus, деплой GitHub Actions → Pages). Стек: React+TS+Vite+Tailwind, Supabase (Auth+Postgres+RPC+RLS), PWA. Секреты в GitHub: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (publishable key).

## Готово (в коде, build ок)
- Вход/регистрация (имя, телефон, почта, пароль, код друга). Первый пользователь = admin, остальные client. Staff: `update profiles set role='staff' ...`.
- src/ui.tsx — дизайн-система (Btn, Input, Select, Badge, Card, Table+пагинация, Modal/Drawer, Tabs, Toast, Shell, CSV). Чёрно-жёлтый, Inter, Lucide.
- src/admin.tsx — Обзор (KPI, графики, «Требует внимания»), Списание (4-значный код), Клиенты (таблица + drawer: абонемент/начисление/история/рефералы), Магазин (CRUD), Акции, Рефералы, Операции (фильтры, CSV).
- src/client.tsx — Главная, История, Магазин (код 4 цифры), Профиль; src/api.ts — все вызовы Supabase; src/App.tsx — auth + роутинг по роли.
- supabase/migrations 001–005 (схема, RLS, RPC, seed, 4-значные коды, акции, admin_stats(p_days)). Все применять по порядку в SQL Editor. Confirm email в Supabase выключен.

## Готово: годовой абонемент / 30 дней / реферал 2 000 / PWA (build ок)
- Миграция `006_annual_referral.sql` (применить в Supabase после 004, 005). Протестирована на локальном Postgres 16: годовой = ровно +10 000 (партия annual, pending), повторная продажа блокируется, реферал +2 000 только пригласившему (друг 0, повторно не начисляется), первое списание активирует партию на 30 дней (дата активации и конца сохраняются), второе списание срок не продлевает, просроченный остаток сгорает (`expire_my_bonus`, запись «сгорание» в истории).
- UI клиента: «N бонусов», «Бонусы активируются при первом использовании», «Действуют до: DD.MM.YYYY · Осталось: XX дн.», список партий «Мои бонусы», подписи в истории, реферал «+2 000 бонусов за приглашение друга». Админ: выбор «Обычный / Годовой (+10 000 Bonus)» в drawer клиента (для годового 5% не начисляется).
- PWA: public/manifest.json (start_url/scope `/formulabonus/`, standalone), иконки PNG 192/512/maskable/apple-touch, sw.js (scope-aware), регистрация через BASE_URL, vite base `/formulabonus/`, кнопка «📲 Установить Formula Bonus» (Android — beforeinstallprompt, iOS — инструкция, скрыта в standalone).

## Осталось
Применить миграции 004–006 в Supabase, залить zip в репо (не потерять `.github/workflows/deploy.yml`), проверить установку PWA на телефоне. Не сделано: QR (реферальная ссылка), остатки товаров, добавление клиента админом, pg_cron для сгорания, назначение сотрудников из UI.

## Заметки / риски
- Бизнес-риск: лимит списания 10–15% цены товара/абонемента → 10 000 Bonus за 30 дней почти не потратить; решение — поставить товарам больший % Bonus в «Магазине».
- Не сделано: QR (идея — QR реферальной ссылки), остатки товаров, добавление клиента админом, pg_cron для сгорания, назначение сотрудников из UI.
