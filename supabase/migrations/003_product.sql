-- Регистрация: первый пользователь = admin, остальные = client; реферальный код из формы
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare v_ref uuid; v_first boolean;
begin
  select not exists(select 1 from profiles where role='admin') into v_first;
  select id into v_ref from profiles where referral_code = upper(nullif(new.raw_user_meta_data->>'ref',''));
  insert into profiles(id, full_name, phone, role, referred_by) values (new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
    nullif(new.raw_user_meta_data->>'phone',''), case when v_first then 'admin' else 'client' end, v_ref)
  on conflict (id) do nothing;
  insert into bonus_wallets(client_id) values (new.id) on conflict do nothing;
  if v_ref is not null then insert into referrals(referrer_id, referred_id) values (v_ref, new.id); end if;
  return new;
end $$;

create function _grant(p_client uuid, p_amt int, p_kind text, p_note text) returns void language plpgsql security definer set search_path=public as $$
begin
  insert into bonus_wallets(client_id,balance) values (p_client,p_amt)
    on conflict (client_id) do update set balance = bonus_wallets.balance + p_amt, updated_at = now();
  insert into bonus_transactions(client_id,kind,amount,remaining,expires_at,note,staff_id)
    values (p_client,p_kind,p_amt,p_amt,now()+interval '90 days',p_note,auth.uid());
end $$;
revoke execute on function _grant(uuid,int,text,text) from public, anon, authenticated;

-- Продажа/продление абонемента: +5% Bonus, при первом абонементе по коду друга — реферальные бонусы (3000 / 1000)
create function sell_membership(p_client uuid, p_plan text, p_price int, p_days int) returns int language plpgsql security definer set search_path=public as $$
declare v_start date; v_id uuid; v_acc int := floor(p_price * 0.05); v_ref referrals;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  select greatest(current_date, coalesce(max(ends_on), current_date)) into v_start from memberships where client_id = p_client and status = 'active';
  update memberships set status = 'expired' where client_id = p_client and status = 'active';
  insert into memberships(client_id,plan,price,starts_on,ends_on) values (p_client,p_plan,p_price,current_date,v_start + p_days) returning id into v_id;
  perform _grant(p_client, v_acc, 'accrual', p_plan || ' · 5%');
  select * into v_ref from referrals where referred_id = p_client and status = 'pending' for update;
  if found then
    update referrals set status='confirmed', membership_id=v_id, confirmed_at=now() where id = v_ref.id;
    perform _grant(v_ref.referrer_id, 3000, 'referral', 'Друг купил абонемент');
    perform _grant(p_client, 1000, 'referral', 'Бонус за приход по коду друга');
  end if;
  insert into audit_logs(actor_id,action,entity,entity_id,details) values (auth.uid(),'sell_membership','memberships',v_id,jsonb_build_object('client',p_client,'price',p_price));
  return v_acc;
end $$;

create function admin_stats() returns json language plpgsql security definer set search_path=public as $$
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  return json_build_object(
   'renewals',(select count(*) from memberships m where m.starts_on >= current_date-30 and exists(select 1 from memberships o where o.client_id=m.client_id and o.starts_on < m.starts_on)),
   'repeat',(select count(*) from redemptions where status='done' and created_at >= now()-interval '30 days'),
   'referrals',(select count(*) from referrals where status='confirmed'),
   'returned',(select count(distinct t.client_id) from bonus_transactions t where t.kind in ('redeem','accrual') and t.created_at >= now()-interval '30 days' and exists(select 1 from bonus_transactions o where o.client_id=t.client_id and o.kind='accrual' and o.created_at < t.created_at)),
   'revenue',(select coalesce(sum(price),0) from memberships where starts_on >= current_date-30) + (select coalesce(sum(r.price - d.bonus_used),0) from redemptions d join rewards r on r.id=d.reward_id where d.status='done' and d.created_at >= now()-interval '30 days'),
   'issued',(select coalesce(sum(amount),0) from bonus_transactions where amount > 0 and created_at >= now()-interval '30 days'),
   'redeemed',(select coalesce(-sum(amount),0) from bonus_transactions where kind='redeem' and created_at >= now()-interval '30 days'));
end $$;

create function run_expiry() returns int language plpgsql security definer set search_path=public as $$
begin if not is_staff() then raise exception 'forbidden'; end if; return expire_bonus(); end $$;

create policy p_rewards_w on rewards for all using (is_staff()) with check (is_staff());
