-- 010: роль dev, вход по телефону, восстановление доступа, поддержка, уведомления, день рождения.
-- Существующие аккаунты, роли, сессии и данные НЕ меняются.

-- ===== Роли: добавляем dev (права уровня admin) =====
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('client','staff','bartender','admin','dev'));
alter table profiles add column if not exists birth_date date,
  add column if not exists must_change_password boolean not null default false;

-- Все существующие RLS-политики используют эти функции, поэтому dev автоматически получает права admin
create or replace function is_staff() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from profiles where id = auth.uid() and role in ('staff','admin','dev')) $$;
create or replace function is_admin() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from profiles where id = auth.uid() and role in ('admin','dev')) $$;
create or replace function is_bar() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from profiles where id = auth.uid() and role in ('bartender','staff','admin','dev')) $$;
create function is_dev() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from profiles where id = auth.uid() and role = 'dev') $$;

create or replace function set_role(p_user uuid, p_role text) returns void language plpgsql security definer set search_path=public as $$
declare v_cur text;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'Нельзя менять свою роль'; end if;
  if p_role not in ('client','staff','bartender','admin','dev') then raise exception 'bad role'; end if;
  select role into v_cur from profiles where id = p_user;
  if (p_role = 'dev' or v_cur = 'dev') and not is_dev() then raise exception 'Роль разработчика назначает только разработчик'; end if;
  update profiles set role = p_role where id = p_user;
  insert into audit_logs(actor_id,action,entity,entity_id,details) values (auth.uid(),'set_role','profiles',p_user,jsonb_build_object('role',p_role));
end $$;

-- ===== Регистрация: телефон хранится в одном формате; «первый = админ» только пока нет ни admin, ни dev =====
create function norm_phone(p text) returns text language sql immutable as $$
  select case when length(d) = 11 and left(d,1) in ('7','8') then '+7' || substr(d,2)
              when length(d) = 10 then '+7' || d else nullif(d,'') end
  from (select regexp_replace(coalesce(p,''), '\D', '', 'g') as d) x $$;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare v_ref uuid; v_first boolean;
begin
  select not exists(select 1 from profiles where role in ('admin','dev')) into v_first;
  select id into v_ref from profiles where referral_code = upper(nullif(new.raw_user_meta_data->>'ref',''));
  insert into profiles(id, full_name, phone, role, referred_by) values (new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
    norm_phone(new.raw_user_meta_data->>'phone'), case when v_first then 'admin' else 'client' end, v_ref)
  on conflict (id) do nothing;
  insert into bonus_wallets(client_id) values (new.id) on conflict do nothing;
  if v_ref is not null then insert into referrals(referrer_id, referred_id) values (v_ref, new.id); end if;
  return new;
end $$;

-- ===== Поддержка =====
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  type text not null check (type in ('formula','technical')),
  category text not null,
  description text not null default '',
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  client_name text, phone text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index support_tickets_type_status on support_tickets(type, status, created_at desc);
create index support_tickets_user on support_tickets(user_id);
alter table support_tickets enable row level security;
-- клиент: только свои; admin: обращения по Формуле; dev: все (включая технические)
create policy p_tickets_r on support_tickets for select using (user_id = auth.uid() or is_dev() or (is_admin() and type = 'formula'));
-- записи в таблицу только через функции ниже (прямых insert/update нет ни у кого)

create function create_ticket(p_category text, p_description text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; p profiles;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  if p_category not in ('bonus','membership','payment','visits','app','other') then raise exception 'bad category'; end if;
  if length(trim(coalesce(p_description,''))) < 3 then raise exception 'Опишите вопрос'; end if;
  if (select count(*) from support_tickets where user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then raise exception 'Слишком много обращений за сутки'; end if;
  select * into p from profiles where id = auth.uid();
  insert into support_tickets(user_id, type, category, description, client_name, phone)
    values (auth.uid(), case when p_category = 'app' then 'technical' else 'formula' end, p_category, left(trim(p_description), 2000), p.full_name, p.phone)
    returning id into v_id;
  return v_id;
end $$;

-- «Забыли пароль?»: доступно без входа, ответ всегда одинаковый (не раскрывает, есть ли аккаунт). Пароль не передаётся.
create function request_password_reset(p_phone text) returns void language plpgsql security definer set search_path=public as $$
declare v_phone text := norm_phone(p_phone); p profiles;
begin
  if v_phone is null or length(v_phone) <> 12 then raise exception 'Введите номер телефона'; end if;
  if (select count(*) from support_tickets where category = 'password_reset' and phone = v_phone and created_at > now() - interval '1 day') >= 3 then return; end if;
  if (select count(*) from support_tickets where category = 'password_reset' and created_at > now() - interval '10 minutes') >= 30 then return; end if;
  select * into p from profiles where norm_phone(phone) = v_phone order by created_at limit 1;
  insert into support_tickets(user_id, type, category, description, client_name, phone)
    values (p.id, 'technical', 'password_reset', 'Запрос на восстановление доступа', p.full_name, v_phone);
end $$;

create function set_ticket_status(p_id uuid, p_status text) returns void language plpgsql security definer set search_path=public as $$
declare t support_tickets;
begin
  if p_status not in ('open','in_progress','resolved','closed') then raise exception 'bad status'; end if;
  select * into t from support_tickets where id = p_id for update; if not found then raise exception 'not found'; end if;
  if not (is_dev() or (is_admin() and t.type = 'formula')) then raise exception 'forbidden'; end if;
  update support_tickets set status = p_status, updated_at = now() where id = p_id;
end $$;

-- DEV выдаёт временный пароль по заявке: в базе хранится только bcrypt-хеш, пароль нигде не сохраняется и не логируется.
-- Клиент обязан сменить его при первом входе (must_change_password).
create function dev_reset_password(p_ticket uuid) returns text language plpgsql security definer set search_path=public, extensions as $$
declare t support_tickets; v_uid uuid; v_tmp text;
begin
  if not is_dev() then raise exception 'forbidden'; end if;
  select * into t from support_tickets where id = p_ticket for update; if not found then raise exception 'not found'; end if;
  v_uid := coalesce(t.user_id, (select id from profiles where norm_phone(phone) = t.phone order by created_at limit 1));
  if v_uid is null then raise exception 'Аккаунт с этим номером не найден'; end if;
  v_tmp := substr(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=0OIl1', 'abcdefgh'), 1, 10);
  update auth.users set encrypted_password = extensions.crypt(v_tmp, extensions.gen_salt('bf', 10)), updated_at = now() where id = v_uid;
  update profiles set must_change_password = true where id = v_uid;
  update support_tickets set status = 'in_progress', updated_at = now() where id = p_ticket;
  insert into audit_logs(actor_id, action, entity, entity_id) values (auth.uid(), 'password_reset', 'profiles', v_uid);
  return v_tmp;
end $$;

create function password_changed() returns void language sql security definer set search_path=public as
$$ update profiles set must_change_password = false where id = auth.uid() $$;

insert into settings values ('whatsapp_phone', '') on conflict do nothing;

-- ===== Уведомления =====
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null, title text not null, message text not null default '',
  is_read boolean not null default false, metadata jsonb not null default '{}',
  dedupe_key text, created_at timestamptz not null default now(),
  unique (user_id, dedupe_key));
create index notifications_user_created on notifications(user_id, created_at desc);
create index notifications_user_unread on notifications(user_id) where not is_read;
alter table notifications enable row level security;
create policy p_notif_r on notifications for select using (user_id = auth.uid());

-- одна запись на (пользователь, ключ): повторные вызовы ничего не дублируют
create function _notify(p_user uuid, p_type text, p_title text, p_msg text, p_key text, p_meta jsonb default '{}') returns void
language sql security definer set search_path=public as $$
  insert into notifications(user_id, type, title, message, dedupe_key, metadata) values (p_user, p_type, p_title, p_msg, p_key, p_meta)
  on conflict (user_id, dedupe_key) do nothing $$;
revoke execute on function _notify(uuid,text,text,text,text,jsonb) from public, anon, authenticated;

-- Вызывается приложением клиента один раз при открытии: абонемент (за 3–4 дня) и день рождения
create function sync_my_notifications() returns void language plpgsql security definer set search_path=public as $$
declare v_today date := (now() at time zone 'Asia/Almaty')::date; m record; b date; y int; v_leap boolean;
begin
  if auth.uid() is null then return; end if;
  for m in select id, ends_on from memberships where client_id = auth.uid() and status = 'active' and ends_on - v_today between 3 and 4 loop
    perform _notify(auth.uid(), 'subscription_expiring', '⚠️ Абонемент заканчивается',
      format('Ваш абонемент заканчивается через %s дня. Продлите абонемент, чтобы продолжить тренировки без перерыва.', m.ends_on - v_today),
      'sub_exp:' || m.id, jsonb_build_object('membership_id', m.id, 'ends_on', m.ends_on));
  end loop;
  select birth_date into b from profiles where id = auth.uid();
  if b is not null then
    y := extract(year from v_today); v_leap := (y % 4 = 0 and y % 100 <> 0) or y % 400 = 0;
    if to_char(b, 'MM-DD') = to_char(v_today, 'MM-DD') or (to_char(b, 'MM-DD') = '02-29' and not v_leap and to_char(v_today, 'MM-DD') = '02-28') then
      perform _notify(auth.uid(), 'birthday', '🎂 С днём рождения!', 'Formula поздравляет вас с днём рождения! 🎉 Мы подготовили для вас подарок.',
        'birthday:' || y, jsonb_build_object('year', y));
    end if;
  end if;
end $$;

create function mark_notifications_read(p_ids uuid[] default null) returns void language sql security definer set search_path=public as $$
  update notifications set is_read = true where user_id = auth.uid() and not is_read and (p_ids is null or id = any(p_ids)) $$;

create function set_my_birth_date(p_date date) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  if p_date is not null and (p_date < date '1900-01-01' or p_date > current_date) then raise exception 'Проверьте дату'; end if;
  update profiles set birth_date = p_date where id = auth.uid();
end $$;

-- Новая акция → уведомление всем клиентам (один раз на акцию)
create function notify_promo(p_promo uuid) returns int language plpgsql security definer set search_path=public as $$
declare pr promos; n int;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into pr from promos where id = p_promo and active; if not found then raise exception 'Акция не найдена или скрыта'; end if;
  insert into notifications(user_id, type, title, message, dedupe_key, metadata)
    select p.id, 'new_promotion', '🔥 Новая акция Formula', 'Для участников клуба доступно новое специальное предложение: ' || pr.title || '.', 'promo:' || pr.id, jsonb_build_object('promo_id', pr.id)
    from profiles p where p.role = 'client'
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics n = row_count; return n;
end $$;

-- Начислены бонусы за друга → уведомление
create function _notify_tx() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.kind = 'referral' and new.amount > 0 then
    perform _notify(new.client_id, 'referral_bonus', '🎁 Вам начислено ' || replace(to_char(new.amount, 'FM999,999,999'), ',', ' ') || ' бонусов', 'За приглашение друга.', 'tx:' || new.id);
  end if;
  return new;
end $$;
revoke execute on function _notify_tx() from public, anon, authenticated;
create trigger trg_notify_tx after insert on bonus_transactions for each row execute function _notify_tx();

-- ===== КАК НАЗНАЧИТЬ СЕБЕ РОЛЬ DEV (выполнить отдельно, подставив свою почту или телефон) =====
-- update profiles set role = 'dev' where id = (select id from auth.users where email = 'ВАША_ПОЧТА');
