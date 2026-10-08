-- 012: push-уведомления в шторку телефона (Web Push). Безопасно выполнять сразу:
-- пока не выполнен 013 и не развёрнута функция send-push, всё работает как раньше (только внутри приложения).

-- подписки устройств; читать/писать напрямую нельзя никому, только через функции ниже (и серверная функция с service role)
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null,
  created_at timestamptz not null default now());
create index push_subscriptions_user on push_subscriptions(user_id);
alter table push_subscriptions enable row level security;

create function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'bad endpoint'; end if;
  insert into push_subscriptions(user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
end $$;
create function delete_push_subscription(p_endpoint text) returns void language sql security definer set search_path=public as
$$ delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid() $$;

-- закрытые настройки (адрес функции и секрет). RLS без политик: клиенты и сотрудники их не видят.
create table private_config (key text primary key, value text not null);
alter table private_config enable row level security;

-- новое уведомление → запрос к функции send-push (через pg_net, асинхронно, после фиксации транзакции).
-- Любая ошибка здесь не мешает созданию уведомления.
create function _push_notification() returns trigger language plpgsql security definer set search_path=public as $$
declare v_url text; v_secret text;
begin
  if not exists(select 1 from push_subscriptions where user_id = new.user_id) then return new; end if;
  select value into v_url from private_config where key = 'push_url';
  select value into v_secret from private_config where key = 'push_secret';
  if v_url is null or v_secret is null then return new; end if;
  begin
    perform net.http_post(url := v_url, body := jsonb_build_object('notification_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret));
  exception when others then null;
  end;
  return new;
end $$;
revoke execute on function _push_notification() from public, anon, authenticated;
create trigger trg_push_notification after insert on notifications for each row execute function _push_notification();

-- Ежедневная проверка для всех клиентов (абонемент за 3–4 дня, день рождения), чтобы push приходил,
-- даже если клиент не открывал приложение. Логика та же, дубли по-прежнему невозможны.
create function _sync_user(p_user uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_today date := (now() at time zone 'Asia/Almaty')::date; m record; b date; y int; v_leap boolean;
begin
  for m in select id, ends_on from memberships where client_id = p_user and status = 'active' and ends_on - v_today between 3 and 4 loop
    perform _notify(p_user, 'subscription_expiring', '⚠️ Абонемент заканчивается',
      format('Ваш абонемент заканчивается через %s дня. Продлите абонемент, чтобы продолжить тренировки без перерыва.', m.ends_on - v_today),
      'sub_exp:' || m.id, jsonb_build_object('membership_id', m.id, 'ends_on', m.ends_on));
  end loop;
  select birth_date into b from profiles where id = p_user;
  if b is not null then
    y := extract(year from v_today); v_leap := (y % 4 = 0 and y % 100 <> 0) or y % 400 = 0;
    if to_char(b, 'MM-DD') = to_char(v_today, 'MM-DD') or (to_char(b, 'MM-DD') = '02-29' and not v_leap and to_char(v_today, 'MM-DD') = '02-28') then
      perform _notify(p_user, 'birthday', '🎂 С днём рождения!', 'Formula поздравляет вас с днём рождения! 🎉 Мы подготовили для вас подарок.',
        'birthday:' || y, jsonb_build_object('year', y));
    end if;
  end if;
end $$;
revoke execute on function _sync_user(uuid) from public, anon, authenticated;
create or replace function sync_my_notifications() returns void language plpgsql security definer set search_path=public as $$
begin if auth.uid() is not null then perform _sync_user(auth.uid()); end if; end $$;
create function sync_all_notifications() returns int language plpgsql security definer set search_path=public as $$
declare v_today date := (now() at time zone 'Asia/Almaty')::date; u uuid; n int := 0;
begin
  for u in select distinct client_id from memberships where status = 'active' and ends_on - v_today between 3 and 4
           union select id from profiles where role = 'client' and birth_date is not null and to_char(birth_date, 'MM-DD') in (to_char(v_today, 'MM-DD'), '02-29') loop
    perform _sync_user(u); n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function sync_all_notifications() from public, anon, authenticated;
