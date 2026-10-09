-- 014: экран «Друзья». Реферальный бонус +2 000 — только пригласившему, после ПЕРВОЙ подтверждённой покупки друга
-- (оформление абонемента/продление сотрудником или начисление за покупку в клубе). Другу 0.

-- Единая проверка реферала. Повтор невозможен: referrals.referred_id уникален, статус меняется pending→confirmed один раз
-- (строка блокируется for update), а уникальный индекс uq_referral_bonus не даст второй бонус по той же связи.
create function _confirm_referral(p_client uuid, p_membership uuid default null) returns void language plpgsql security definer set search_path=public as $$
declare v_ref referrals;
begin
  select * into v_ref from referrals where referred_id = p_client and status = 'pending' for update;
  if not found or v_ref.referrer_id = p_client then return; end if;
  update referrals set status = 'confirmed', membership_id = coalesce(p_membership, membership_id), confirmed_at = now() where id = v_ref.id;
  perform _grant(v_ref.referrer_id, 2000, 'referral', 'За приглашение друга', v_ref.id, false);
end $$;
revoke execute on function _confirm_referral(uuid, uuid) from public, anon, authenticated;

create or replace function _sell(p_client uuid, p_plan text, p_price int, p_days int, p_annual boolean, p_plan_id uuid) returns int language plpgsql security definer set search_path=public as $$
declare v_start date; v_id uuid; v_acc int;
begin
  if p_annual and exists(select 1 from memberships where client_id = p_client and annual and status = 'active' and ends_on > current_date + 300) then
    raise exception 'У клиента уже действует годовой абонемент'; end if;
  select greatest(current_date, coalesce(max(ends_on), current_date)) into v_start from memberships where client_id = p_client and status = 'active';
  update memberships set status = 'expired' where client_id = p_client and status = 'active';
  insert into memberships(client_id,plan,price,starts_on,ends_on,annual,plan_id) values (p_client,p_plan,p_price,current_date,v_start + p_days,p_annual,p_plan_id) returning id into v_id;
  if p_annual then v_acc := 10000; perform _grant(p_client, v_acc, 'annual', 'Годовой абонемент', v_id, true);
  else v_acc := floor(p_price * 0.05); perform _grant(p_client, v_acc, 'accrual', p_plan || ' · 5%', v_id, false); end if;
  perform _confirm_referral(p_client, v_id);
  insert into audit_logs(actor_id,action,entity,entity_id,details) values (auth.uid(),'sell_membership','memberships',v_id,jsonb_build_object('client',p_client,'price',p_price,'annual',p_annual));
  return v_acc;
end $$;

-- начисление за покупку в клубе — тоже подтверждённая покупка
create or replace function accrue_bonus(p_client uuid, p_purchase int, p_pct numeric default 5, p_note text default 'Покупка')
returns int language plpgsql security definer set search_path=public as $$
declare v_amt int := floor(p_purchase * p_pct / 100);
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  if p_purchase <= 0 then raise exception 'Сумма покупки должна быть больше нуля'; end if;
  perform _grant(p_client, v_amt, 'accrual', p_note, null, false);
  perform _confirm_referral(p_client, null);
  insert into audit_logs(actor_id, action, entity, entity_id, details) values (auth.uid(), 'accrue', 'bonus_transactions', p_client, jsonb_build_object('amount', v_amt, 'purchase', p_purchase));
  return v_amt;
end $$;

-- Мои приглашённые друзья: только имя и первая буква фамилии (без телефонов), статус и сумма начисленных бонусов
create function my_referrals() returns json language sql stable security definer set search_path=public as $$
  select json_build_object(
    'earned', (select coalesce(sum(amount),0) from bonus_transactions where client_id = auth.uid() and kind = 'referral' and amount > 0),
    'friends', coalesce((select json_agg(json_build_object(
        'name', trim(split_part(coalesce(p.full_name,'Друг'), ' ', 1) || coalesce(' ' || nullif(left(split_part(p.full_name, ' ', 2), 1), '') || '.', '')),
        'status', r.status, 'created_at', r.created_at, 'confirmed_at', r.confirmed_at) order by r.created_at desc)
      from referrals r join profiles p on p.id = r.referred_id where r.referrer_id = auth.uid()), '[]'::json)) $$;
