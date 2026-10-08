-- Checkout: Kaspi по ссылке (ручное подтверждение), наличные, резерв бонусов, идемпотентные операции
alter table orders drop constraint if exists orders_status_check, drop constraint if exists orders_pay_method_check;
alter table orders add constraint orders_status_check check (status in ('awaiting_payment','new','preparing','ready','done','cancelled'));
alter table orders add constraint orders_pay_method_check check (pay_method in ('cash','kaspi','bonus'));
alter table orders alter column status set default 'awaiting_payment';
alter table orders add column if not exists payment_status text not null default 'awaiting_payment', add column if not exists cash_amount int not null default 0,
  add column if not exists kaspi_payment_url text, add column if not exists confirmed_at timestamptz, add column if not exists confirmed_by uuid references profiles(id), add column if not exists client_paid_at timestamptz;
update orders set payment_status = case when paid then 'paid' when status = 'cancelled' then 'cancelled' when kaspi_claimed then 'awaiting_confirmation' when pay_method = 'kaspi' then 'awaiting_payment' else 'cash_pending' end, cash_amount = total - bonus_planned;
update orders set status = 'awaiting_payment' where not paid and status = 'new';
alter table orders add constraint orders_payment_status_check check (payment_status in ('awaiting_payment','awaiting_confirmation','cash_pending','bonus_pending','paid','cancelled'));
insert into settings values ('kaspi_payment_url','') on conflict do nothing;

-- резерв: бонусы неоплаченных активных заказов недоступны для других трат
create function _reserved(p_client uuid) returns int language sql stable security definer set search_path=public as $$
  select coalesce(sum(bonus_planned),0)::int from orders where client_id = p_client and not paid and status <> 'cancelled' $$;
revoke execute on function _reserved(uuid) from public, anon, authenticated;
create or replace function _avail(p_client uuid) returns int language sql stable security definer set search_path=public as $$
  select greatest(coalesce(sum(remaining),0)::int - _reserved(p_client), 0) from bonus_transactions where client_id = p_client and remaining > 0 and (expires_at is null or expires_at > now()) $$;

drop function if exists create_order(jsonb,text,boolean,text);
create function create_order(p_items jsonb, p_method text, p_bonus int, p_comment text default '') returns json language plpgsql security definer set search_path=public as $$
declare it jsonb; r rewards; v_total int := 0; v_cap int := 0; v_bonus int; v_cash int; v_id uuid; v_num bigint; v_name text; n int; v_method text; v_pay text; v_url text;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  if p_method not in ('cash','kaspi') then raise exception 'bad method'; end if;
  if coalesce((select value from settings where key = 'bar_open'),'1') = '0' then raise exception 'Бар сейчас не принимает заказы'; end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then raise exception 'bad items'; end if;
  if (select count(*) from orders where client_id = auth.uid() and status in ('awaiting_payment','new','preparing','ready')) >= 3 then raise exception 'Слишком много активных заказов'; end if;
  select full_name into v_name from profiles where id = auth.uid();
  insert into orders(client_id,client_name,pay_method,comment) values (auth.uid(), coalesce(v_name,'Клиент'), p_method, left(coalesce(p_comment,''),200)) returning id, num into v_id, v_num;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into r from rewards where id = (it->>'id')::uuid and active; if not found then raise exception 'Товар недоступен'; end if;
    n := least(greatest((it->>'qty')::int,1),20);
    insert into order_items(order_id,reward_id,title,price,qty,pct) values (v_id,r.id,r.title,r.price,n,r.max_bonus_pct);
    v_total := v_total + r.price * n; v_cap := v_cap + (r.price * n * r.max_bonus_pct) / 100;
  end loop;
  v_bonus := least(greatest(coalesce(p_bonus,0),0), v_cap, _avail(auth.uid()));
  v_cash := v_total - v_bonus;
  v_method := case when v_cash = 0 then 'bonus' else p_method end;
  v_pay := case when v_cash = 0 then 'bonus_pending' when v_method = 'kaspi' then 'awaiting_payment' else 'cash_pending' end;
  select nullif(value,'') into v_url from settings where key = 'kaspi_payment_url';
  update orders set total = v_total, bonus_planned = v_bonus, cash_amount = v_cash, pay_method = v_method, payment_status = v_pay,
    kaspi_payment_url = case when v_method = 'kaspi' then v_url end where id = v_id;
  return json_build_object('id',v_id,'num',v_num,'total',v_total,'bonus',v_bonus,'cash',v_cash);
end $$;

-- подтверждение оплаты сотрудником: бонусы списываются ОДИН раз (повтор безопасен)
create or replace function bar_confirm_payment(p_order uuid) returns json language plpgsql security definer set search_path=public as $$
declare o orders; v_used int := 0;
begin
  if not is_bar() then raise exception 'forbidden'; end if;
  select * into o from orders where id = p_order for update; if not found then raise exception 'Заказ не найден'; end if;
  if o.paid then return json_build_object('bonus',o.bonus_used,'to_pay',o.total - o.bonus_used,'already',true); end if;
  if o.status = 'cancelled' then raise exception 'Заказ отменён'; end if;
  if o.bonus_planned > 0 then v_used := _spend(o.client_id, o.bonus_planned, 'Заказ #' || o.num, o.id); end if;
  update orders set paid = true, paid_at = now(), confirmed_at = now(), confirmed_by = auth.uid(), bonus_used = v_used, cash_amount = o.total - v_used,
    payment_status = 'paid', status = case when status = 'awaiting_payment' then 'new' else status end, staff_id = auth.uid(), updated_at = now() where id = p_order;
  insert into audit_logs(actor_id,action,entity,entity_id,details) values (auth.uid(),'order_paid','orders',p_order,jsonb_build_object('bonus',v_used,'total',o.total));
  return json_build_object('bonus',v_used,'to_pay',o.total - v_used,'already',false);
end $$;
create or replace function bar_set_status(p_order uuid, p_status text) returns void language plpgsql security definer set search_path=public as $$
declare o orders;
begin
  if not is_bar() then raise exception 'forbidden'; end if;
  if p_status not in ('preparing','ready','done','cancelled') then raise exception 'bad status'; end if;
  select * into o from orders where id = p_order for update; if not found then raise exception 'Заказ не найден'; end if;
  if o.status = p_status then return; end if;
  if o.status in ('done','cancelled') then raise exception 'Заказ уже закрыт'; end if;
  if p_status = 'preparing' and o.status <> 'new' then raise exception 'Сначала подтвердите оплату'; end if;
  if p_status = 'ready' and o.status <> 'preparing' then raise exception 'Заказ ещё не готовится'; end if;
  if p_status = 'done' and (o.status <> 'ready' or not o.paid) then raise exception 'Заказ не готов к выдаче'; end if;
  if p_status = 'cancelled' and o.paid and o.bonus_used > 0 then perform _grant(o.client_id, o.bonus_used, 'adjust', 'Возврат бонусов: заказ #' || o.num || ' отменён', o.id, false); end if;
  update orders set status = p_status, payment_status = case when p_status = 'cancelled' and not o.paid then 'cancelled' else payment_status end, staff_id = auth.uid(), updated_at = now() where id = p_order;
end $$;
create or replace function order_claim_paid(p_order uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update orders set kaspi_claimed = true, client_paid_at = coalesce(client_paid_at, now()), payment_status = 'awaiting_confirmation', updated_at = now()
   where id = p_order and client_id = auth.uid() and pay_method = 'kaspi' and not paid and status = 'awaiting_payment';
  if not found then
    if exists(select 1 from orders where id = p_order and client_id = auth.uid() and kaspi_claimed) then return; end if;
    raise exception 'Нельзя отметить оплату';
  end if;
end $$;
create or replace function cancel_my_order(p_order uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update orders set status = 'cancelled', payment_status = 'cancelled', updated_at = now() where id = p_order and client_id = auth.uid() and status = 'awaiting_payment' and not paid and not kaspi_claimed;
  if not found then
    if exists(select 1 from orders where id = p_order and client_id = auth.uid() and status = 'cancelled') then return; end if;
    raise exception 'Заказ уже нельзя отменить';
  end if;
end $$;
-- коды (товар/продление) тоже не трогают зарезервированные бонусы
create or replace function confirm_redemption(p_code text) returns int language plpgsql security definer set search_path=public as $$
declare r redemptions; w rewards; pl plans; v_title text; v_price int; v_pct int; v_cap int; v_left int; b record; v_take int;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  select * into r from redemptions where code = p_code and status = 'pending' and expires_at > now() for update;
  if not found then raise exception 'code invalid or expired'; end if;
  perform _expire_client(r.client_id);
  if r.plan_id is not null then select * into pl from plans where id = r.plan_id; v_title := 'Продление: ' || pl.name; v_price := pl.price; v_pct := pl.max_bonus_pct;
  else select * into w from rewards where id = r.reward_id; v_title := w.title; v_price := w.price; v_pct := w.max_bonus_pct; end if;
  select least((v_price * v_pct) / 100, greatest(coalesce((select balance from bonus_wallets where client_id = r.client_id for update),0) - _reserved(r.client_id), 0)) into v_cap;
  if v_cap > 0 then
    update bonus_transactions set expires_at = now() + interval '30 days', activation_pending = false, activated_at = now() where client_id = r.client_id and activation_pending and remaining > 0;
  end if;
  v_left := v_cap;
  for b in select id, remaining from bonus_transactions where client_id = r.client_id and remaining > 0 and expires_at > now() order by expires_at, created_at for update loop
    exit when v_left <= 0; v_take := least(b.remaining, v_left);
    update bonus_transactions set remaining = remaining - v_take where id = b.id; v_left := v_left - v_take;
  end loop;
  v_cap := v_cap - v_left;
  update bonus_wallets set balance = balance - v_cap, updated_at = now() where client_id = r.client_id;
  if v_cap > 0 then insert into bonus_transactions(client_id,kind,amount,note,staff_id,ref_id) values (r.client_id,'redeem',-v_cap,v_title,auth.uid(),r.id); end if;
  update redemptions set status = 'done', bonus_used = v_cap, staff_id = auth.uid() where id = r.id;
  if r.plan_id is not null then perform _sell(r.client_id, pl.name, pl.price, pl.days, pl.annual, pl.id); end if;
  insert into audit_logs(actor_id,action,entity,entity_id,details) values (auth.uid(),case when r.plan_id is not null then 'renewal' else 'redeem' end,'redemptions',r.id,jsonb_build_object('bonus',v_cap,'price',v_price));
  return v_cap;
end $$;
