-- Удаление товара, категории, спорт-бар: заказы, роль бармена, настройки (Kaspi, бар открыт/закрыт)
create function is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id = auth.uid() and role = 'admin') $$;
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('client','staff','bartender','admin'));
create function is_bar() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id = auth.uid() and role in ('bartender','staff','admin')) $$;
create function set_role(p_user uuid, p_role text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'Нельзя менять свою роль'; end if;
  if p_role not in ('client','staff','bartender','admin') then raise exception 'bad role'; end if;
  update profiles set role = p_role where id = p_user;
  insert into audit_logs(actor_id,action,entity,entity_id,details) values (auth.uid(),'set_role','profiles',p_user,jsonb_build_object('role',p_role));
end $$;

create function delete_reward(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  update redemptions set status = 'cancelled' where reward_id = p_id and status = 'pending';
  update redemptions set reward_id = null where reward_id = p_id;
  delete from rewards where id = p_id;
  insert into audit_logs(actor_id,action,entity,entity_id) values (auth.uid(),'delete_reward','rewards',p_id);
end $$;

create table categories (id uuid primary key default gen_random_uuid(), name text not null, sort int not null default 0, active boolean not null default true);
alter table rewards add column if not exists category_id uuid references categories(id) on delete set null, add column if not exists description text;
alter table categories enable row level security;
create policy p_cat_r on categories for select using (active or is_staff());
create policy p_cat_w on categories for all using (is_staff()) with check (is_staff());
insert into categories(name,sort) values ('Напитки',1),('Кофе',2),('Спортпит',3),('Шоколад и снеки',4);

create table settings (key text primary key, value text not null default '');
alter table settings enable row level security;
create policy p_set_r on settings for select using (auth.uid() is not null);
create policy p_set_w on settings for all using (is_admin() or (is_bar() and key = 'bar_open')) with check (is_admin() or (is_bar() and key = 'bar_open'));
insert into settings values ('bar_open','1'),('kaspi_phone',''),('kaspi_name','');

create table orders (
  id uuid primary key default gen_random_uuid(), num bigint generated always as identity,
  client_id uuid not null references profiles(id), client_name text not null,
  status text not null default 'new' check (status in ('new','preparing','ready','done','cancelled')),
  pay_method text not null check (pay_method in ('cash','kaspi')),
  paid boolean not null default false, paid_at timestamptz, kaspi_claimed boolean not null default false,
  total int not null default 0, bonus_planned int not null default 0, bonus_used int not null default 0,
  comment text, staff_id uuid references profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  reward_id uuid references rewards(id) on delete set null, title text not null, price int not null, qty int not null check (qty between 1 and 20), pct int not null default 0);
create index on orders(status, created_at);
alter table orders enable row level security; alter table order_items enable row level security;
create policy p_ord on orders for select using (client_id = auth.uid() or is_bar());
create policy p_ordi on order_items for select using (exists(select 1 from orders o where o.id = order_id and (o.client_id = auth.uid() or is_bar())));

create function _avail(p_client uuid) returns int language sql stable security definer set search_path=public as $$
  select coalesce(sum(remaining),0)::int from bonus_transactions where client_id = p_client and remaining > 0 and (expires_at is null or expires_at > now()) $$;
revoke execute on function _avail(uuid) from public, anon, authenticated;
create function _spend(p_client uuid, p_amt int, p_note text, p_ref uuid) returns int language plpgsql security definer set search_path=public as $$
declare v_cap int; v_left int; b record; v_take int;
begin
  perform _expire_client(p_client);
  select least(p_amt, coalesce((select balance from bonus_wallets where client_id = p_client for update),0)) into v_cap;
  if v_cap <= 0 then return 0; end if;
  update bonus_transactions set expires_at = now() + interval '30 days', activation_pending = false, activated_at = now() where client_id = p_client and activation_pending and remaining > 0;
  v_left := v_cap;
  for b in select id, remaining from bonus_transactions where client_id = p_client and remaining > 0 and expires_at > now() order by expires_at, created_at for update loop
    exit when v_left <= 0; v_take := least(b.remaining, v_left);
    update bonus_transactions set remaining = remaining - v_take where id = b.id; v_left := v_left - v_take;
  end loop;
  v_cap := v_cap - v_left;
  update bonus_wallets set balance = balance - v_cap, updated_at = now() where client_id = p_client;
  if v_cap > 0 then insert into bonus_transactions(client_id,kind,amount,note,staff_id,ref_id) values (p_client,'redeem',-v_cap,p_note,auth.uid(),p_ref); end if;
  return v_cap;
end $$;
revoke execute on function _spend(uuid,int,text,uuid) from public, anon, authenticated;

create function create_order(p_items jsonb, p_method text, p_use_bonus boolean, p_comment text default '') returns json language plpgsql security definer set search_path=public as $$
declare it jsonb; r rewards; v_total int := 0; v_cap int := 0; v_bonus int; v_id uuid; v_num bigint; v_name text; n int;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  if p_method not in ('cash','kaspi') then raise exception 'bad method'; end if;
  if coalesce((select value from settings where key = 'bar_open'),'1') = '0' then raise exception 'Бар сейчас не принимает заказы'; end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then raise exception 'bad items'; end if;
  if (select count(*) from orders where client_id = auth.uid() and status in ('new','preparing','ready')) >= 3 then raise exception 'Слишком много активных заказов'; end if;
  select full_name into v_name from profiles where id = auth.uid();
  insert into orders(client_id,client_name,pay_method,comment) values (auth.uid(), coalesce(v_name,'Клиент'), p_method, left(coalesce(p_comment,''),200)) returning id, num into v_id, v_num;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into r from rewards where id = (it->>'id')::uuid and active; if not found then raise exception 'Товар недоступен'; end if;
    n := least(greatest((it->>'qty')::int,1),20);
    insert into order_items(order_id,reward_id,title,price,qty,pct) values (v_id,r.id,r.title,r.price,n,r.max_bonus_pct);
    v_total := v_total + r.price * n; v_cap := v_cap + (r.price * n * r.max_bonus_pct) / 100;
  end loop;
  v_bonus := case when p_use_bonus then least(v_cap, _avail(auth.uid())) else 0 end;
  update orders set total = v_total, bonus_planned = v_bonus where id = v_id;
  return json_build_object('id',v_id,'num',v_num,'total',v_total,'bonus',v_bonus);
end $$;

create function bar_confirm_payment(p_order uuid) returns json language plpgsql security definer set search_path=public as $$
declare o orders; v_used int := 0;
begin
  if not is_bar() then raise exception 'forbidden'; end if;
  select * into o from orders where id = p_order for update; if not found then raise exception 'Заказ не найден'; end if;
  if o.status = 'cancelled' then raise exception 'Заказ отменён'; end if;
  if o.paid then raise exception 'Заказ уже оплачен'; end if;
  if o.bonus_planned > 0 then v_used := _spend(o.client_id, o.bonus_planned, 'Заказ #' || o.num, o.id); end if;
  update orders set paid = true, paid_at = now(), bonus_used = v_used, staff_id = auth.uid(), updated_at = now() where id = p_order;
  insert into audit_logs(actor_id,action,entity,entity_id,details) values (auth.uid(),'order_paid','orders',p_order,jsonb_build_object('bonus',v_used,'total',o.total));
  return json_build_object('bonus',v_used,'to_pay',o.total - v_used);
end $$;
create function bar_set_status(p_order uuid, p_status text) returns void language plpgsql security definer set search_path=public as $$
declare o orders;
begin
  if not is_bar() then raise exception 'forbidden'; end if;
  if p_status not in ('preparing','ready','done','cancelled') then raise exception 'bad status'; end if;
  select * into o from orders where id = p_order for update; if not found then raise exception 'Заказ не найден'; end if;
  if o.status in ('done','cancelled') then raise exception 'Заказ уже закрыт'; end if;
  if p_status = 'done' and not o.paid then raise exception 'Сначала примите оплату'; end if;
  if p_status = 'cancelled' and o.paid and o.bonus_used > 0 then perform _grant(o.client_id, o.bonus_used, 'adjust', 'Возврат бонусов: заказ #' || o.num || ' отменён', o.id, false); end if;
  update orders set status = p_status, staff_id = auth.uid(), updated_at = now() where id = p_order;
end $$;
create function order_claim_paid(p_order uuid) returns void language plpgsql security definer set search_path=public as $$
begin update orders set kaspi_claimed = true, updated_at = now() where id = p_order and client_id = auth.uid() and pay_method = 'kaspi' and not paid and status in ('new','preparing','ready');
  if not found then raise exception 'Нельзя отметить оплату'; end if; end $$;
create function cancel_my_order(p_order uuid) returns void language plpgsql security definer set search_path=public as $$
begin update orders set status = 'cancelled', updated_at = now() where id = p_order and client_id = auth.uid() and status = 'new' and not paid;
  if not found then raise exception 'Заказ уже нельзя отменить'; end if; end $$;
