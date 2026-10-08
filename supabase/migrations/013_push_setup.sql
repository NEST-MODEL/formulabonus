-- 013: включение отправки push. Выполнять ПОСЛЕ развёртывания функции send-push (см. README → «Push-уведомления»).
-- Если строка create extension выдаст ошибку прав — включите pg_net и pg_cron в Dashboard → Database → Extensions и выполните остальное.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- адрес функции вашего проекта и случайный секрет (секрет потом скопируйте в Edge Function Secrets как PUSH_SECRET)
insert into private_config values ('push_url', 'https://renfywrwwnlftcdotxxs.supabase.co/functions/v1/send-push')
  on conflict (key) do update set value = excluded.value;
insert into private_config values ('push_secret', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (key) do nothing;
select value as "СКОПИРУЙТЕ ЭТО В PUSH_SECRET" from private_config where key = 'push_secret';

-- каждый день в 09:00 по Шымкенту (04:00 UTC): напоминания об абонементе, дни рождения, сгорание бонусов
select cron.schedule('formula-daily', '0 4 * * *', $$ select sync_all_notifications(); select expire_bonus(); $$);
