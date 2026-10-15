-- The owner account (krish@dimemotion.com) is the app's permanent login.
-- Its email and password cannot be changed, it cannot be deleted or banned,
-- and its workspace membership cannot be removed or demoted.
create or replace function public.lock_owner_login() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'This account is locked and cannot be deleted'; end if;
  if new.email is distinct from old.email or new.encrypted_password is distinct from old.encrypted_password
     or new.banned_until is distinct from old.banned_until or new.deleted_at is distinct from old.deleted_at then
    raise exception 'This account is locked: email and password cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists lock_owner_login on auth.users;
create trigger lock_owner_login before update or delete on auth.users
  for each row when (old.id = '3e03edbb-d7a3-44fc-ae20-2e0cf8a5dc28') execute function public.lock_owner_login();

create or replace function public.lock_owner_membership() returns trigger language plpgsql as $$
begin
  if old.user_id = '3e03edbb-d7a3-44fc-ae20-2e0cf8a5dc28' and (tg_op = 'DELETE' or new.role is distinct from old.role) then
    raise exception 'The owner account cannot be removed or demoted';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists lock_owner_membership on public.workspace_members;
create trigger lock_owner_membership before update or delete on public.workspace_members
  for each row execute function public.lock_owner_membership();

-- Seed the permanent owner account from the schema itself, so it exists on any
-- fresh database and is owned by nobody who can later remove it. Idempotent.
do $$
declare uid uuid := '3e03edbb-d7a3-44fc-ae20-2e0cf8a5dc28';
begin
  if not exists (select 1 from auth.users where id = uid) then
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'krish@dimemotion.com', crypt('krish@1234', gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Krish Kumar","onboarded":true}'::jsonb);
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', 'krish@dimemotion.com'),
      'email', now(), now());
  end if;
end $$;
