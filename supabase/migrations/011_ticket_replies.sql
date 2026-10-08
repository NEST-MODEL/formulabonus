-- 011: переписка в обращениях (тикеты, не живой чат). Сообщения пишутся только через функции.
create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  from_staff boolean not null,
  body text not null,
  created_at timestamptz not null default now());
create index ticket_messages_ticket on ticket_messages(ticket_id, created_at);
alter table ticket_messages enable row level security;
-- видит тот, кто видит сам тикет (клиент — свои, admin — «Формула», dev — все)
create policy p_tmsg_r on ticket_messages for select using (exists(select 1 from support_tickets t where t.id = ticket_id and (t.user_id = auth.uid() or is_dev() or (is_admin() and t.type = 'formula'))));

create function _can_staff(t support_tickets) returns boolean language sql stable security definer set search_path=public as
$$ select is_dev() or (is_admin() and t.type = 'formula') $$;
revoke execute on function _can_staff(support_tickets) from public, anon, authenticated;

-- Ответ в тикет: сотрудник → клиенту уведомление и статус «В работе»; клиент → тикет снова «Новый» у сотрудника
create function reply_ticket(p_ticket uuid, p_body text) returns void language plpgsql security definer set search_path=public as $$
declare t support_tickets; v_staff boolean;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  if length(trim(coalesce(p_body,''))) = 0 then raise exception 'Напишите сообщение'; end if;
  select * into t from support_tickets where id = p_ticket for update; if not found then raise exception 'not found'; end if;
  v_staff := _can_staff(t);
  if not v_staff and t.user_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if t.status = 'closed' then raise exception 'Обращение закрыто'; end if;
  if not v_staff and (select count(*) from ticket_messages where ticket_id = p_ticket and author_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then raise exception 'Слишком много сообщений, попробуйте позже'; end if;
  insert into ticket_messages(ticket_id, author_id, from_staff, body) values (p_ticket, auth.uid(), v_staff, left(trim(p_body), 2000));
  update support_tickets set status = case when v_staff then 'in_progress' else 'open' end, updated_at = now() where id = p_ticket;
  if v_staff and t.user_id is not null then
    perform _notify(t.user_id, 'support_reply', '💬 Ответ поддержки', 'Вам ответили по обращению. Откройте «Поддержка», чтобы посмотреть.', 'reply:' || p_ticket || ':' || extract(epoch from now())::bigint, jsonb_build_object('ticket_id', p_ticket));
  end if;
end $$;

-- Закрыть: сотрудник или сам клиент («проблема решена»)
create or replace function set_ticket_status(p_id uuid, p_status text) returns void language plpgsql security definer set search_path=public as $$
declare t support_tickets;
begin
  if p_status not in ('open','in_progress','resolved','closed') then raise exception 'bad status'; end if;
  select * into t from support_tickets where id = p_id for update; if not found then raise exception 'not found'; end if;
  if _can_staff(t) then null;
  elsif t.user_id = auth.uid() and p_status = 'closed' then null;
  else raise exception 'forbidden'; end if;
  update support_tickets set status = p_status, updated_at = now() where id = p_id;
  if p_status in ('resolved','closed') and _can_staff(t) and t.user_id is not null and t.status not in ('resolved','closed') then
    perform _notify(t.user_id, 'support_closed', '✅ Обращение закрыто', 'Ваш вопрос решён. Если проблема осталась — напишите новое обращение.', 'closed:' || p_id || ':' || extract(epoch from now())::bigint, jsonb_build_object('ticket_id', p_id));
  end if;
end $$;
