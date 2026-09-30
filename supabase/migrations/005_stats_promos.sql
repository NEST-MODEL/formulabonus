drop function if exists admin_stats();
create function admin_stats(p_days int default 30) returns json language plpgsql security definer set search_path=public as $$
declare d interval := (p_days || ' days')::interval;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  return json_build_object(
   'renewals',(select count(*) from memberships m where m.starts_on >= current_date - p_days and exists(select 1 from memberships o where o.client_id=m.client_id and o.starts_on < m.starts_on)),
   'repeat',(select count(*) from redemptions where status='done' and created_at >= now()-d),
   'returned',(select count(distinct t.client_id) from bonus_transactions t where t.kind in ('redeem','accrual') and t.created_at >= now()-d and exists(select 1 from bonus_transactions o where o.client_id=t.client_id and o.kind='accrual' and o.created_at < t.created_at)),
   'revenue',(select coalesce(sum(price),0) from memberships where starts_on >= current_date - p_days) + (select coalesce(sum(r.price - x.bonus_used),0) from redemptions x join rewards r on r.id=x.reward_id where x.status='done' and x.created_at >= now()-d),
   'issued',(select coalesce(sum(amount),0) from bonus_transactions where amount > 0 and created_at >= now()-d),
   'redeemed',(select coalesce(-sum(amount),0) from bonus_transactions where kind='redeem' and created_at >= now()-d));
end $$;
alter table promos add column if not exists kind text default 'info', add column if not exists value text, add column if not exists ends_on date;
