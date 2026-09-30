-- Короткий 4-значный код списания (уникален только среди активных)
alter table redemptions drop constraint if exists redemptions_code_key;
create unique index if not exists redemptions_pending_code on redemptions(code) where status = 'pending';
create or replace function create_redemption(p_reward uuid) returns text language plpgsql security definer set search_path=public as $$
declare v_code text; i int := 0;
begin
  if not exists (select 1 from rewards where id = p_reward and active) then raise exception 'reward not found'; end if;
  update redemptions set status = 'expired' where status = 'pending' and expires_at <= now();
  update redemptions set status = 'cancelled' where status = 'pending' and client_id = auth.uid();
  loop
    v_code := lpad(floor(random() * 10000)::int::text, 4, '0');
    begin
      insert into redemptions(client_id, reward_id, code) values (auth.uid(), p_reward, v_code); exit;
    exception when unique_violation then i := i + 1; if i > 50 then raise exception 'try later'; end if;
    end;
  end loop;
  return v_code;
end $$;
-- Акции
create table if not exists promos (id uuid primary key default gen_random_uuid(), title text not null, body text default '', active boolean default true, created_at timestamptz default now());
alter table promos enable row level security;
create policy p_promos_r on promos for select using (active or is_staff());
create policy p_promos_w on promos for all using (is_staff()) with check (is_staff());
