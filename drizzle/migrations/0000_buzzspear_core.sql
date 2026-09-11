-- ===== ENUMS =====
create type public.app_role as enum ('owner','admin','member');
create type public.stage_board as enum ('lead','crm');
create type public.channel_kind as enum ('email','linkedin','instagram','other');
create type public.account_status as enum ('active','warming','paused');

-- ===== PROFILES =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role public.app_role not null default 'member',
  is_active boolean not null default false,
  theme text not null default 'light',
  default_module text,
  default_lead_view text default 'table',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, permission_key)
);
grant select, insert, update, delete on public.user_permissions to authenticated;
grant all on public.user_permissions to service_role;
alter table public.user_permissions enable row level security;

-- ===== HELPERS =====
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role in ('owner','admin'));
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role = 'owner');
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active);
$$;

create or replace function public.can(_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.user_permissions up
    join public.profiles p on p.id = up.user_id
    where up.user_id = auth.uid() and up.permission_key = _key and up.enabled and p.is_active
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ===== PROFILE POLICIES =====
create policy "profiles self select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.is_active_user());
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "profiles admin insert" on public.profiles for insert to authenticated
  with check (public.is_admin());
create policy "profiles admin delete" on public.profiles for delete to authenticated
  using (public.is_admin());

create policy "perms select" on public.user_permissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "perms admin write" on public.user_permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===== SIGNUP TRIGGER =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  existing_count int;
  pre_profile public.profiles%rowtype;
  k text;
  all_keys text[] := array[
    'module.lead_tracker','module.crm','lead.dashboard','lead.leads','lead.lead_create',
    'lead.lead_edit','lead.lead_delete','lead.outreach_tracker','lead.ledger','lead.archive',
    'lead.import_export','crm.records','crm.pipeline','crm.followups','crm.record_edit',
    'crm.revenue','settings.view','settings.stages','settings.accounts','settings.countries',
    'settings.tags','settings.targets','settings.shortcuts','settings.users'];
begin
  select count(*) into existing_count from public.profiles;
  -- invited placeholder profile with matching email?
  select * into pre_profile from public.profiles where lower(email) = lower(new.email) and id <> new.id limit 1;

  if existing_count = 0 then
    insert into public.profiles (id, email, full_name, role, is_active)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'owner', true);
    foreach k in array all_keys loop
      insert into public.user_permissions (user_id, permission_key, enabled) values (new.id, k, true)
      on conflict do nothing;
    end loop;
  elsif pre_profile.id is not null then
    -- adopt the invited profile: move permissions to the real auth id
    insert into public.profiles (id, email, full_name, role, is_active)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', pre_profile.full_name, new.email), pre_profile.role, true);
    update public.user_permissions set user_id = new.id where user_id = pre_profile.id;
    delete from public.profiles where id = pre_profile.id;
  else
    insert into public.profiles (id, email, full_name, role, is_active)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'member', false);
  end if;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger perms_touch before update on public.user_permissions for each row execute function public.touch_updated_at();

-- ===== CONFIG TABLES =====
create table public.stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#666666',
  order_index int not null default 0,
  board public.stage_board not null,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  is_reply_stage boolean not null default false,
  is_archived boolean not null default false,
  default_probability int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.channel_kind not null default 'other',
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.sender_accounts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels(id) on delete cascade,
  label text not null,
  identifier text,
  status public.account_status not null default 'active',
  warmup_started_at date,
  warmup_ready_date date,
  warmup_reminder_date date,
  daily_send_limit int,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.countries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  flag_emoji text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#2563EB',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.outreach_targets (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  daily_target int not null default 0,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.outreach_daily (
  id uuid primary key default gen_random_uuid(),
  day date not null default current_date,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  manual_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (day, user_id, channel_id)
);
create table public.shortcuts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  action_key text not null,
  binding text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['stages','channels','sender_accounts','countries','tags','outreach_targets','outreach_daily','shortcuts','app_settings'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t||'_touch', t);
    execute format('create policy "read active" on public.%I for select to authenticated using (public.is_active_user())', t);
  end loop;
end $$;

create policy "stages write" on public.stages for all to authenticated using (public.can('settings.stages')) with check (public.can('settings.stages'));
create policy "channels write" on public.channels for all to authenticated using (public.can('settings.accounts')) with check (public.can('settings.accounts'));
create policy "sender write" on public.sender_accounts for all to authenticated using (public.can('settings.accounts')) with check (public.can('settings.accounts'));
create policy "countries write" on public.countries for all to authenticated using (public.can('settings.countries')) with check (public.can('settings.countries'));
create policy "tags write" on public.tags for all to authenticated using (public.can('settings.tags')) with check (public.can('settings.tags'));
create policy "targets write" on public.outreach_targets for all to authenticated using (public.can('settings.targets')) with check (public.can('settings.targets'));
create policy "daily write" on public.outreach_daily for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "shortcuts write" on public.shortcuts for all to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "app_settings write" on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ===== SEED WORKSPACE CONFIG =====
insert into public.stages (name, color, order_index, board, is_reply_stage, is_won, is_lost, default_probability) values
 ('New','#666666',1,'lead',false,false,false,0),
 ('Researching','#666666',2,'lead',false,false,false,0),
 ('Email Drafted','#666666',3,'lead',false,false,false,0),
 ('Contacted','#2563EB',4,'lead',false,false,false,0),
 ('Replied','#16A34A',5,'lead',true,false,false,0),
 ('Call Booked','#16A34A',6,'lead',false,false,false,0),
 ('Proposal Sent','#D97706',7,'lead',false,false,false,0),
 ('Client','#16A34A',8,'lead',false,true,false,0),
 ('Not Interested','#DC2626',9,'lead',false,false,true,0),
 ('Not A Priority','#D97706',10,'lead',false,false,false,0),
 ('New Reply','#2563EB',1,'crm',false,false,false,10),
 ('Qualified','#2563EB',2,'crm',false,false,false,25),
 ('Call Booked','#D97706',3,'crm',false,false,false,45),
 ('Proposal Sent','#D97706',4,'crm',false,false,false,65),
 ('Negotiation','#D97706',5,'crm',false,false,false,80),
 ('Won','#16A34A',6,'crm',false,true,false,100),
 ('Lost','#DC2626',7,'crm',false,false,true,0);

insert into public.channels (name, kind, icon) values
 ('Email','email','mail'),('LinkedIn','linkedin','linkedin'),('Instagram','instagram','instagram');

insert into public.countries (name, code, flag_emoji) values
 ('United States','US','🇺🇸'),('United Kingdom','GB','🇬🇧'),('Canada','CA','🇨🇦'),
 ('Australia','AU','🇦🇺'),('India','IN','🇮🇳'),('Germany','DE','🇩🇪'),
 ('France','FR','🇫🇷'),('Netherlands','NL','🇳🇱'),('United Arab Emirates','AE','🇦🇪'),('Singapore','SG','🇸🇬');

insert into public.outreach_targets (channel_id, daily_target)
select id, case when kind = 'email' then 50 when kind = 'linkedin' then 20 else 20 end from public.channels;