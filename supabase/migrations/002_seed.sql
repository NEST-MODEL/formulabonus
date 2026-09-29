-- 1) авто-создание профиля при регистрации
create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  insert into bonus_wallets(client_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- 2) магазин
insert into rewards(title, price, max_bonus_pct) values
 ('Шоколадка',700,15),('Протеиновый батончик',1200,15),('Вода 0.75 л',500,10),('Продление абонемента',22000,10);

-- 3) DEMO: создайте в Authentication → Users двух пользователей
--    client@formula.demo и staff@formula.demo (пароль любой, Auto Confirm), затем выполните этот блок:
do $$
declare c uuid := (select id from auth.users where email='client@formula.demo');
        s uuid := (select id from auth.users where email='staff@formula.demo');
begin
  if s is not null then update profiles set role='staff', full_name='Сотрудник' where id=s; end if;
  if c is not null then
    update profiles set full_name='Айдана К.' where id=c;
    insert into memberships(client_id,plan,price,starts_on,ends_on) values (c,'Абонемент 12 месяцев',22000,current_date-358,current_date+7);
    insert into bonus_wallets(client_id,balance) values (c,2300) on conflict (client_id) do update set balance=2300;
    insert into bonus_transactions(client_id,kind,amount,remaining,expires_at,note) values
      (c,'accrual',1200,1200,now()+interval '9 days','Бонус за друга'),
      (c,'accrual',1100,1100,now()+interval '80 days','Покупка абонемента · 5%');
  end if;
end $$;
