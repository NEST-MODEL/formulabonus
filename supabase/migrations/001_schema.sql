-- Formula Bonus: schema + RLS + RPC (Stage 1)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text, phone text unique,
  role text not null default 'client' check (role in ('client','staff','admin')),
  referral_code text unique default upper(substr(md5(random()::text),1,8)),
  referred_by uuid references profiles(id),
  created_at timestamptz default now());
create table memberships (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  plan text not null, price int not null, starts_on date not null, ends_on date not null,
  status text not null default 'active' check (status in ('active','expired','frozen')));
create table bonus_wallets (
  client_id uuid primary key references profiles(id) on delete cascade,
  balance int not null default 0 check (balance >= 0), updated_at timestamptz default now());
-- ledger: accrual rows are batches (remaining = not yet spent), others are movements
create table bonus_transactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id),
  kind text not null check (kind in ('accrual','referral','redeem','expire','adjust')),
  amount int not null, remaining int, expires_at timestamptz,
  note text, staff_id uuid references profiles(id), ref_id uuid,
  created_at timestamptz default now());
create index on bonus_transactions (client_id, expires_at) where remaining > 0;
create table rewards (
  id uuid primary key default gen_random_uuid(),
  title text not null, price int not null check (price > 0),
  max_bonus_pct int not null default 10 check (max_bonus_pct between 0 and 100),
  active boolean default true);
create table redemptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id), reward_id uuid not null references rewards(id),
  code text unique not null, status text not null default 'pending' check (status in ('pending','done','cancelled','expired')),
  bonus_used int default 0, staff_id uuid references profiles(id),
  created_at timestamptz default now(), expires_at timestamptz default now() + interval '30 minutes');
create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id), referred_id uuid not null unique references profiles(id),
  status text not null default 'pending' check (status in ('pending','confirmed')),
  membership_id uuid references memberships(id), confirmed_at timestamptz, created_at timestamptz default now());
create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid, action text not null, entity text, entity_id uuid, details jsonb, created_at timestamptz default now());

-- helpers
create function is_staff() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from profiles where id = auth.uid() and role in ('staff','admin')) $$;

-- RLS: clients read own data; staff read all; NO direct writes to ledger/wallets
alter table profiles enable row level security; alter table memberships enable row level security;
alter table bonus_wallets enable row level security; alter table bonus_transactions enable row level security;
alter table rewards enable row level security; alter table redemptions enable row level security;
alter table referrals enable row level security; alter table audit_logs enable row level security;
create policy p_profiles on profiles for select using (id = auth.uid() or is_staff());
create policy p_memb on memberships for select using (client_id = auth.uid() or is_staff());
create policy p_wallet on bonus_wallets for select using (client_id = auth.uid() or is_staff());
create policy p_tx on bonus_transactions for select using (client_id = auth.uid() or is_staff());
create policy p_rewards on rewards for select using (active or is_staff());
create policy p_red on redemptions for select using (client_id = auth.uid() or is_staff());
create policy p_ref on referrals for select using (referrer_id = auth.uid() or referred_id = auth.uid() or is_staff());
create policy p_audit on audit_logs for select using (is_staff());

-- client: create redemption code
create function create_redemption(p_reward uuid) returns text language plpgsql security definer set search_path=public as $$
declare v_code text := 'FB-' || upper(substr(md5(random()::text),1,6));
begin
  if not exists (select 1 from rewards where id = p_reward and active) then raise exception 'reward not found'; end if;
  insert into redemptions(client_id, reward_id, code) values (auth.uid(), p_reward, v_code);
  return v_code;
end $$;

-- staff: confirm redemption, FIFO by expiry, capped by max_bonus_pct and balance
create function confirm_redemption(p_code text) returns int language plpgsql security definer set search_path=public as $$
declare r redemptions; w rewards; v_cap int; v_left int; b record; v_take int;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  select * into r from redemptions where code = p_code and status = 'pending' and expires_at > now() for update;
  if not found then raise exception 'code invalid or expired'; end if;
  select * into w from rewards where id = r.reward_id;
  select least((w.price * w.max_bonus_pct) / 100, coalesce((select balance from bonus_wallets where client_id = r.client_id for update),0)) into v_cap;
  v_left := v_cap;
  for b in select id, remaining from bonus_transactions
           where client_id = r.client_id and remaining > 0 and expires_at > now()
           order by expires_at, created_at for update loop
    exit when v_left <= 0;
    v_take := least(b.remaining, v_left);
    update bonus_transactions set remaining = remaining - v_take where id = b.id;
    v_left := v_left - v_take;
  end loop;
  v_cap := v_cap - v_left;
  update bonus_wallets set balance = balance - v_cap, updated_at = now() where client_id = r.client_id;
  insert into bonus_transactions(client_id, kind, amount, note, staff_id, ref_id)
    values (r.client_id, 'redeem', -v_cap, w.title, auth.uid(), r.id);
  update redemptions set status = 'done', bonus_used = v_cap, staff_id = auth.uid() where id = r.id;
  insert into audit_logs(actor_id, action, entity, entity_id, details)
    values (auth.uid(), 'redeem', 'redemptions', r.id, jsonb_build_object('bonus', v_cap, 'price', w.price));
  return v_cap;
end $$;

-- staff: accrue bonus after confirmed purchase (expires in 90 days)
create function accrue_bonus(p_client uuid, p_purchase int, p_pct numeric default 5, p_note text default 'Покупка')
returns int language plpgsql security definer set search_path=public as $$
declare v_amt int := floor(p_purchase * p_pct / 100);
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  insert into bonus_wallets(client_id, balance) values (p_client, v_amt)
    on conflict (client_id) do update set balance = bonus_wallets.balance + v_amt, updated_at = now();
  insert into bonus_transactions(client_id, kind, amount, remaining, expires_at, note, staff_id)
    values (p_client, 'accrual', v_amt, v_amt, now() + interval '90 days', p_note, auth.uid());
  insert into audit_logs(actor_id, action, entity, entity_id, details)
    values (auth.uid(), 'accrue', 'bonus_transactions', p_client, jsonb_build_object('amount', v_amt, 'purchase', p_purchase));
  return v_amt;
end $$;

-- expiry job (schedule via pg_cron, Stage 5)
create function expire_bonus() returns int language plpgsql security definer set search_path=public as $$
declare b record; n int := 0;
begin
  for b in select id, client_id, remaining from bonus_transactions where remaining > 0 and expires_at <= now() for update loop
    update bonus_transactions set remaining = 0 where id = b.id;
    update bonus_wallets set balance = greatest(balance - b.remaining, 0) where client_id = b.client_id;
    insert into bonus_transactions(client_id, kind, amount, note, ref_id) values (b.client_id, 'expire', -b.remaining, 'Срок действия истёк', b.id);
    n := n + 1;
  end loop; return n;
end $$;
revoke execute on function expire_bonus() from public, anon, authenticated;
