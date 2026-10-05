-- Тарифы абонементов: выбор срока продления, цена подставляется из тарифа
create table if not exists plans (
  id uuid primary key default gen_random_uuid(), name text not null, days int not null check (days > 0), price int not null check (price > 0),
  annual boolean not null default false, max_bonus_pct int not null default 10 check (max_bonus_pct between 0 and 100), active boolean not null default true, sort int not null default 0);
alter table plans enable row level security;
create policy p_plans_r on plans for select using (active or is_staff());
create policy p_plans_w on plans for all using (is_staff()) with check (is_staff());
-- ЦЕНЫ-ЗАГЛУШКИ: поменяйте в админке (Магазин → Тарифы абонементов)
insert into plans(name,days,price,annual,sort) values ('1 месяц',30,12000,false,1),('3 месяца',90,30000,false,2),('6 месяцев',180,54000,false,3),('Годовой',365,96000,true,4);
alter table memberships add column if not exists plan_id uuid references plans(id);
alter table redemptions alter column reward_id drop not null;
alter table redemptions add column if not exists plan_id uuid references plans(id);
update rewards set active = false where title = 'Продление абонемента';

create function _sell(p_client uuid, p_plan text, p_price int, p_days int, p_annual boolean, p_plan_id uuid) returns int language plpgsql security definer set search_path=public as $$
declare v_start date; v_id uuid; v_acc int; v_ref referrals;
begin
  if p_annual and exists(select 1 from memberships where client_id = p_client and annual and status = 'active' and ends_on > current_date + 300) then
    raise exception 'У клиента уже действует годовой абонемент'; end if;
  select greatest(current_date, coalesce(max(ends_on), current_date)) into v_start from memberships where client_id = p_client and status = 'active';
  update memberships set status = 'expired' where client_id = p_client and status = 'active';
  insert into memberships(client_id,plan,price,starts_on,ends_on,annual,plan_id) values (p_client,p_plan,p_price,current_date,v_start + p_days,p_annual,p_plan_id) returning id into v_id;
  if p_annual then v_acc := 10000; perform _grant(p_client, v_acc, 'annual', 'Годовой абонемент', v_id, true);
  else v_acc := floor(p_price * 0.05); perform _grant(p_client, v_acc, 'accrual', p_plan || ' · 5%', v_id, false); end if;
  select * into v_ref from referrals where referred_id = p_client and status = 'pending' for update;
  if found then
    update referrals set status = 'confirmed', membership_id = v_id, confirmed_at = now() where id = v_ref.id;
    perform _grant(v_ref.referrer_id, 2000, 'referral', 'За приглашение друга', v_ref.id, false);
  end if;
  insert into audit_logs(actor_id,action,entity,entity_id,details) values (auth.uid(),'sell_membership','memberships',v_id,jsonb_build_object('client',p_client,'price',p_price,'annual',p_annual));
  return v_acc;
end $$;
revoke execute on function _sell(uuid,text,int,int,boolean,uuid) from public, anon, authenticated;
create or replace function sell_membership(p_client uuid, p_plan text, p_price int, p_days int, p_annual boolean default false) returns int language plpgsql security definer set search_path=public as $$
begin if not is_staff() then raise exception 'forbidden'; end if; return _sell(p_client, p_plan, p_price, p_days, p_annual, null); end $$;
create function sell_plan(p_client uuid, p_plan uuid, p_price int default null) returns int language plpgsql security definer set search_path=public as $$
declare pl plans;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  select * into pl from plans where id = p_plan; if not found then raise exception 'plan not found'; end if;
  return _sell(p_client, pl.name, coalesce(p_price, pl.price), pl.days, pl.annual, pl.id);
end $$;

create function create_renewal(p_plan uuid) returns text language plpgsql security definer set search_path=public as $$
declare v_code text; i int := 0; pl plans;
begin
  select * into pl from plans where id = p_plan and active; if not found then raise exception 'plan not found'; end if;
  if pl.annual and exists(select 1 from memberships where client_id = auth.uid() and annual and status = 'active' and ends_on > current_date + 300) then
    raise exception 'У вас уже действует годовой абонемент'; end if;
  update redemptions set status = 'expired' where status = 'pending' and expires_at <= now();
  update redemptions set status = 'cancelled' where status = 'pending' and client_id = auth.uid();
  loop
    v_code := lpad(floor(random() * 10000)::int::text, 4, '0');
    begin insert into redemptions(client_id, plan_id, code) values (auth.uid(), p_plan, v_code); exit;
    exception when unique_violation then i := i + 1; if i > 50 then raise exception 'try later'; end if; end;
  end loop;
  return v_code;
end $$;

-- по коду: либо выдача товара за Bonus, либо продление тарифа (Bonus-скидка + оформление абонемента)
create or replace function confirm_redemption(p_code text) returns int language plpgsql security definer set search_path=public as $$
declare r redemptions; w rewards; pl plans; v_title text; v_price int; v_pct int; v_cap int; v_left int; b record; v_take int;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  select * into r from redemptions where code = p_code and status = 'pending' and expires_at > now() for update;
  if not found then raise exception 'code invalid or expired'; end if;
  perform _expire_client(r.client_id);
  if r.plan_id is not null then select * into pl from plans where id = r.plan_id; v_title := 'Продление: ' || pl.name; v_price := pl.price; v_pct := pl.max_bonus_pct;
  else select * into w from rewards where id = r.reward_id; v_title := w.title; v_price := w.price; v_pct := w.max_bonus_pct; end if;
  select least((v_price * v_pct) / 100, coalesce((select balance from bonus_wallets where client_id = r.client_id for update),0)) into v_cap;
  if v_cap > 0 then
    update bonus_transactions set expires_at = now() + interval '30 days', activation_pending = false, activated_at = now() where client_id = r.client_id and activation_pending and remaining > 0;
  end if;
  v_left := v_cap;
  for b in select id, remaining from bonus_transactions where client_id = r.client_id and remaining > 0 and expires_at > now() order by expires_at, created_at for update loop
    exit when v_left <= 0;
    v_take := least(b.remaining, v_left);
    update bonus_transactions set remaining = remaining - v_take where id = b.id;
    v_left := v_left - v_take;
  end loop;
  v_cap := v_cap - v_left;
  update bonus_wallets set balance = balance - v_cap, updated_at = now() where client_id = r.client_id;
  if v_cap > 0 then insert into bonus_transactions(client_id,kind,amount,note,staff_id,ref_id) values (r.client_id,'redeem',-v_cap,v_title,auth.uid(),r.id); end if;
  update redemptions set status = 'done', bonus_used = v_cap, staff_id = auth.uid() where id = r.id;
  if r.plan_id is not null then perform _sell(r.client_id, pl.name, pl.price, pl.days, pl.annual, pl.id); end if;
  insert into audit_logs(actor_id,action,entity,entity_id,details) values (auth.uid(),case when r.plan_id is not null then 'renewal' else 'redeem' end,'redemptions',r.id,jsonb_build_object('bonus',v_cap,'price',v_price));
  return v_cap;
end $$;
