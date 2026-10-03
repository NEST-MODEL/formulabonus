-- Годовой абонемент (+10 000, активация при первом использовании, 30 дней), реферал +2 000 только пригласившему
alter table bonus_transactions drop constraint if exists bonus_transactions_kind_check;
alter table bonus_transactions add constraint bonus_transactions_kind_check check (kind in ('accrual','referral','annual','redeem','expire','adjust'));
alter table bonus_transactions add column if not exists activation_pending boolean not null default false, add column if not exists activated_at timestamptz;
alter table memberships add column if not exists annual boolean not null default false;
create unique index if not exists uq_referral_bonus on bonus_transactions(ref_id) where kind = 'referral' and ref_id is not null;
create unique index if not exists uq_annual_bonus on bonus_transactions(ref_id) where kind = 'annual' and ref_id is not null;

drop function if exists _grant(uuid,int,text,text);
drop function if exists sell_membership(uuid,text,int,int);
-- партия Bonus: pending = ждёт активации (expires_at пуст), иначе действует 90 дней
create function _grant(p_client uuid, p_amt int, p_kind text, p_note text, p_ref uuid default null, p_pending boolean default false) returns void language plpgsql security definer set search_path=public as $$
begin
  insert into bonus_wallets(client_id,balance) values (p_client,p_amt) on conflict (client_id) do update set balance = bonus_wallets.balance + p_amt, updated_at = now();
  insert into bonus_transactions(client_id,kind,amount,remaining,expires_at,activation_pending,note,staff_id,ref_id)
    values (p_client,p_kind,p_amt,p_amt, case when p_pending then null else now() + interval '90 days' end, p_pending, p_note, auth.uid(), p_ref);
end $$;
revoke execute on function _grant(uuid,int,text,text,uuid,boolean) from public, anon, authenticated;

create function _expire_client(p_client uuid) returns int language plpgsql security definer set search_path=public as $$
declare b record; n int := 0;
begin
  for b in select id, remaining from bonus_transactions where client_id = p_client and remaining > 0 and expires_at is not null and expires_at <= now() for update loop
    update bonus_transactions set remaining = 0 where id = b.id;
    update bonus_wallets set balance = greatest(balance - b.remaining, 0), updated_at = now() where client_id = p_client;
    insert into bonus_transactions(client_id,kind,amount,note,ref_id) values (p_client,'expire',-b.remaining,'Срок действия бонусов истёк',b.id);
    n := n + 1;
  end loop; return n;
end $$;
revoke execute on function _expire_client(uuid) from public, anon, authenticated;
create function expire_my_bonus() returns int language plpgsql security definer set search_path=public as $$
begin return _expire_client(auth.uid()); end $$;
create or replace function expire_bonus() returns int language plpgsql security definer set search_path=public as $$
declare c uuid; n int := 0;
begin
  for c in select distinct client_id from bonus_transactions where remaining > 0 and expires_at is not null and expires_at <= now() loop n := n + _expire_client(c); end loop; return n;
end $$;

create or replace function confirm_redemption(p_code text) returns int language plpgsql security definer set search_path=public as $$
declare r redemptions; w rewards; v_cap int; v_left int; b record; v_take int;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  select * into r from redemptions where code = p_code and status = 'pending' and expires_at > now() for update;
  if not found then raise exception 'code invalid or expired'; end if;
  perform _expire_client(r.client_id);
  select * into w from rewards where id = r.reward_id;
  select least((w.price * w.max_bonus_pct) / 100, coalesce((select balance from bonus_wallets where client_id = r.client_id for update),0)) into v_cap;
  if v_cap > 0 then  -- первое использование: активируем ожидающие партии, 30 дней, один раз
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
  insert into bonus_transactions(client_id,kind,amount,note,staff_id,ref_id) values (r.client_id,'redeem',-v_cap,w.title,auth.uid(),r.id);
  update redemptions set status = 'done', bonus_used = v_cap, staff_id = auth.uid() where id = r.id;
  insert into audit_logs(actor_id,action,entity,entity_id,details) values (auth.uid(),'redeem','redemptions',r.id,jsonb_build_object('bonus',v_cap,'price',w.price));
  return v_cap;
end $$;

create function sell_membership(p_client uuid, p_plan text, p_price int, p_days int, p_annual boolean default false) returns int language plpgsql security definer set search_path=public as $$
declare v_start date; v_id uuid; v_acc int; v_ref referrals;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  if p_annual and exists(select 1 from memberships where client_id = p_client and annual and status = 'active' and ends_on > current_date + 300) then
    raise exception 'У клиента уже есть активный годовой абонемент'; end if;
  select greatest(current_date, coalesce(max(ends_on), current_date)) into v_start from memberships where client_id = p_client and status = 'active';
  update memberships set status = 'expired' where client_id = p_client and status = 'active';
  insert into memberships(client_id,plan,price,starts_on,ends_on,annual) values (p_client,p_plan,p_price,current_date,v_start + p_days,p_annual) returning id into v_id;
  if p_annual then v_acc := 10000; perform _grant(p_client, v_acc, 'annual', 'Годовой абонемент', v_id, true);
  else v_acc := floor(p_price * 0.05); perform _grant(p_client, v_acc, 'accrual', p_plan || ' · 5%', v_id, false); end if;
  select * into v_ref from referrals where referred_id = p_client and status = 'pending' for update;
  if found then  -- реферал: +2 000 только пригласившему, один раз; другу 0
    update referrals set status = 'confirmed', membership_id = v_id, confirmed_at = now() where id = v_ref.id;
    perform _grant(v_ref.referrer_id, 2000, 'referral', 'За приглашение друга', v_ref.id, false);
  end if;
  insert into audit_logs(actor_id,action,entity,entity_id,details) values (auth.uid(),'sell_membership','memberships',v_id,jsonb_build_object('client',p_client,'price',p_price,'annual',p_annual));
  return v_acc;
end $$;
