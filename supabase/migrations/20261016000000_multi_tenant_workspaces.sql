-- Multi-tenant conversion: workspaces, members, invites, per-workspace data with RLS,
-- the RPCs the live UI calls, FX tables, avatars bucket and feedback.
-- Runs after the original single-tenant migrations (20250101000000-06).

set check_function_bodies = off;

-- =====================================================================
-- 1. Workspaces, members, invites
-- =====================================================================
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references public.profiles(id) on delete set null,
  report_currency text not null default 'USD',
  billing_source_workspace_id uuid references public.workspaces(id) on delete set null,
  lead_seq int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'member',
  permission_keys text[] not null default '{}',
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.workspace_invites (workspace_id);

alter table public.profiles add column if not exists current_workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.profiles alter column is_active set default true;

-- =====================================================================
-- 2. Workspace-aware helpers (replace the single-tenant ones)
-- =====================================================================
create or replace function public.is_ws_member(_ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = _ws and m.user_id = auth.uid());
$$;

create or replace function public.ws_role(_ws uuid)
returns public.app_role language sql stable security definer set search_path = public as $$
  select m.role from public.workspace_members m where m.workspace_id = _ws and m.user_id = auth.uid();
$$;

create or replace function public.current_ws()
returns uuid language sql stable security definer set search_path = public as $$
  select p.current_workspace_id from public.profiles p
  where p.id = auth.uid()
    and exists (select 1 from public.workspace_members m where m.workspace_id = p.current_workspace_id and m.user_id = p.id);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.ws_role(public.current_ws()) in ('owner','admin'), false);
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.ws_role(public.current_ws()) = 'owner', false);
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_ws() is not null;
$$;

create or replace function public.ws_admin(_ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.ws_role(_ws) in ('owner','admin'), false);
$$;

create or replace function public.can(_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.user_permissions up
    where up.user_id = auth.uid() and up.workspace_id = public.current_ws()
      and up.permission_key = _key and up.enabled
  );
$$;

-- =====================================================================
-- 3. Remove the global seed rows (lookups are now seeded per workspace)
-- =====================================================================
delete from public.outreach_targets;
delete from public.stages;
delete from public.channels;
delete from public.countries;
delete from public.app_settings;
delete from public.user_permissions;

-- =====================================================================
-- 4. New columns the live UI uses
-- =====================================================================
alter table public.leads
  add column if not exists personalized_message text,
  add column if not exists message_angle text,
  add column if not exists outreach_template_id uuid;

alter table public.lead_contacts
  add column if not exists email_verified boolean not null default false;

alter table public.crm_records
  add column if not exists usd_value_at_close numeric,
  add column if not exists usd_mrr_at_close numeric,
  add column if not exists usd_rate_at_close numeric,
  add column if not exists usd_value_manual boolean not null default false,
  add column if not exists received_amount numeric,
  add column if not exists received_currency text;

create table public.outreach_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel_id uuid references public.channels(id) on delete set null,
  body text not null default '',
  order_index int not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.leads
  add constraint leads_outreach_template_id_fkey foreign key (outreach_template_id)
  references public.outreach_templates(id) on delete set null;

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null default auth.uid(),
  kind text not null default 'feedback',
  message text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- FX (global, not per workspace)
create table public.fx_rates (
  currency text primary key,
  per_usd numeric not null,
  updated_at timestamptz not null default now()
);
create table public.fx_rates_history (
  currency text not null,
  day date not null,
  per_usd numeric not null,
  primary key (currency, day)
);

alter table public.shortcuts add constraint shortcuts_user_id_action_key_key unique (user_id, action_key);

-- =====================================================================
-- 5. workspace_id on every data table
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'stages','channels','sender_accounts','countries','tags','outreach_targets','outreach_daily',
    'app_settings','user_permissions','permission_presets','followup_templates','import_mappings',
    'outreach_templates','leads','lead_contacts','lead_links','lead_tags','lead_followups',
    'lead_events','lead_tasks','crm_records','crm_contact_log'] loop
    execute format('alter table public.%I add column if not exists workspace_id uuid not null references public.workspaces(id) on delete cascade', t);
    execute format('create index if not exists %I on public.%I (workspace_id)', t || '_workspace_idx', t);
  end loop;
end $$;

-- app_settings: unique per workspace
alter table public.app_settings drop constraint if exists app_settings_key_key;
alter table public.app_settings add constraint app_settings_workspace_id_key_key unique (workspace_id, key);

-- user_permissions: unique per workspace
alter table public.user_permissions drop constraint if exists user_permissions_user_id_permission_key_key;
alter table public.user_permissions add constraint user_permissions_ws_user_key_key unique (workspace_id, user_id, permission_key);

-- lead codes are numbered per workspace
alter table public.leads drop constraint if exists leads_lead_code_key;
alter table public.leads alter column lead_code drop default;
alter table public.leads add constraint leads_workspace_id_lead_code_key unique (workspace_id, lead_code);

-- Fill workspace_id on insert: from the parent row when there is one, else the caller's workspace.
create or replace function public.fill_workspace_id()
returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new);
begin
  if new.workspace_id is null then
    if j ? 'lead_id' and (j->>'lead_id') is not null then
      select workspace_id into new.workspace_id from public.leads where id = (j->>'lead_id')::uuid;
    elsif j ? 'crm_record_id' and (j->>'crm_record_id') is not null then
      select workspace_id into new.workspace_id from public.crm_records where id = (j->>'crm_record_id')::uuid;
    end if;
    if new.workspace_id is null then
      new.workspace_id := public.current_ws();
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'stages','channels','sender_accounts','countries','tags','outreach_targets','outreach_daily',
    'app_settings','user_permissions','permission_presets','followup_templates','import_mappings',
    'outreach_templates','leads','lead_contacts','lead_links','lead_tags','lead_followups',
    'lead_events','lead_tasks','crm_records','crm_contact_log','feedback'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_fill_ws', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.fill_workspace_id()', t || '_fill_ws', t);
  end loop;
end $$;

-- per-workspace lead code
create or replace function public.assign_lead_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.lead_code is null or new.lead_code = '' then
    update public.workspaces set lead_seq = lead_seq + 1 where id = new.workspace_id returning lead_seq into n;
    new.lead_code := 'LEAD-' || lpad(coalesce(n, 1)::text, 4, '0');
  end if;
  return new;
end $$;
-- runs after leads_fill_ws (trigger names fire alphabetically: leads_fill_ws < leads_lead_code)
create trigger leads_lead_code before insert on public.leads for each row execute function public.assign_lead_code();

create trigger workspaces_touch before update on public.workspaces for each row execute function public.touch_updated_at();
create trigger workspace_members_touch before update on public.workspace_members for each row execute function public.touch_updated_at();
create trigger workspace_invites_touch before update on public.workspace_invites for each row execute function public.touch_updated_at();
create trigger outreach_templates_touch before update on public.outreach_templates for each row execute function public.touch_updated_at();

-- =====================================================================
-- 6. Workspace-scoped versions of the CRM functions
-- =====================================================================
create or replace function public.ensure_crm_record(_lead_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; st uuid; prob int; ws uuid;
begin
  select workspace_id into ws from public.leads where id = _lead_id;
  if ws is null then return null; end if;
  if auth.uid() is not null and not public.is_ws_member(ws) then
    raise exception 'not a member of this workspace';
  end if;
  select id into rid from public.crm_records where lead_id = _lead_id;
  if rid is not null then return rid; end if;
  select id, default_probability into st, prob from public.stages
   where board = 'crm' and workspace_id = ws and not is_archived order by order_index limit 1;
  insert into public.crm_records (workspace_id, lead_id, stage_id, priority, probability, owner_id)
  values (ws, _lead_id, st, 'medium', coalesce(prob, 10), auth.uid())
  returning id into rid;
  update public.leads set pushed_to_crm = true, pushed_to_crm_at = coalesce(pushed_to_crm_at, now()) where id = _lead_id;
  insert into public.lead_events (workspace_id, lead_id, event_type, meta, created_by)
  values (ws, _lead_id, 'pushed_to_crm', '{}'::jsonb, auth.uid());
  return rid;
end $$;

create or replace function public.set_crm_stage(_lead_id uuid, _kind text)
returns void language plpgsql security definer set search_path = public as $$
declare rid uuid; st uuid; prob int; ws uuid;
begin
  rid := public.ensure_crm_record(_lead_id);
  select workspace_id into ws from public.leads where id = _lead_id;
  if _kind = 'lost' then
    select id, default_probability into st, prob from public.stages
     where board = 'crm' and is_lost and workspace_id = ws order by order_index limit 1;
  else
    select id, default_probability into st, prob from public.stages
     where board = 'crm' and is_won and workspace_id = ws order by order_index limit 1;
  end if;
  if st is null or rid is null then return; end if;
  update public.crm_records
     set stage_id = st,
         probability = coalesce(prob, probability),
         closed_at = case when _kind = 'won' then coalesce(closed_at, now()) else closed_at end
   where id = rid;
end $$;

create or replace function public.remove_crm_record(_lead_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  select workspace_id into ws from public.leads where id = _lead_id;
  if ws is null then return; end if;
  if auth.uid() is not null and not public.is_ws_member(ws) then
    raise exception 'not a member of this workspace';
  end if;
  delete from public.crm_records where lead_id = _lead_id;
  update public.leads set pushed_to_crm = false, pushed_to_crm_at = null where id = _lead_id;
  insert into public.lead_events (workspace_id, lead_id, event_type, meta, created_by)
  values (ws, _lead_id, 'pulled_from_crm', '{}'::jsonb, auth.uid());
end $$;

-- cascaded deletes (lead removed) must not try to update the lead being deleted
create or replace function public.sync_next_followup()
returns trigger language plpgsql security definer set search_path = public as $$
declare lid uuid; d date;
begin
  if TG_OP = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  lid := coalesce(new.lead_id, old.lead_id);
  select min(scheduled_date) into d from public.lead_followups
   where lead_id = lid and status = 'pending' and scheduled_date is not null;
  update public.leads set next_followup_date = d where id = lid;
  if TG_OP <> 'DELETE' and new.status = 'sent' and (TG_OP = 'INSERT' or old.status is distinct from 'sent') then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by)
      values (lid, 'followup_sent', coalesce(new.sent_at, now()), jsonb_build_object('sequence', new.sequence_number, 'channel_id', new.channel_id), auth.uid());
    update public.leads set last_contacted_at = greatest(coalesce(last_contacted_at, to_timestamp(0)), coalesce(new.sent_at, now())) where id = lid;
  end if;
  return coalesce(new, old);
end $$;

-- lock the USD value of a deal when it closes
create or replace function public.crm_lock_usd()
returns trigger language plpgsql security definer set search_path = public as $$
declare rate numeric;
begin
  if new.usd_value_manual then return new; end if;
  if new.closed_at is not null and (TG_OP = 'INSERT' or old.closed_at is null
      or new.estimated_value is distinct from old.estimated_value
      or new.mrr_amount is distinct from old.mrr_amount
      or new.currency is distinct from old.currency) then
    if upper(coalesce(new.currency, 'USD')) = 'USD' then rate := 1;
    else select per_usd into rate from public.fx_rates where currency = upper(new.currency);
    end if;
    if rate is not null and rate > 0 then
      new.usd_rate_at_close := rate;
      new.usd_value_at_close := coalesce(new.estimated_value, 0) / rate;
      new.usd_mrr_at_close := coalesce(new.mrr_amount, 0) / rate;
    end if;
  elsif new.closed_at is null and TG_OP = 'UPDATE' and old.closed_at is not null then
    new.usd_rate_at_close := null;
    new.usd_value_at_close := null;
    new.usd_mrr_at_close := null;
  end if;
  return new;
end $$;
create trigger crm_records_lock_usd before insert or update on public.crm_records
  for each row execute function public.crm_lock_usd();

create or replace function public.revenue_summary()
returns table (
  pipeline_value numeric, weighted_pipeline numeric, won_this_month numeric,
  lost_value numeric, current_mrr numeric, avg_deal_size numeric,
  won_count bigint, lost_count bigint, open_retainer_mrr numeric
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can('crm.revenue') then
    raise exception 'permission denied for revenue';
  end if;
  return query
  with r as (
    select c.*, s.is_won, s.is_lost from public.crm_records c left join public.stages s on s.id = c.stage_id
    where c.workspace_id = public.current_ws()
  )
  select
    coalesce(sum(estimated_value) filter (where not coalesce(is_won,false) and not coalesce(is_lost,false)),0),
    coalesce(sum(estimated_value * coalesce(probability,0)/100.0) filter (where not coalesce(is_won,false) and not coalesce(is_lost,false)),0),
    coalesce(sum(estimated_value) filter (where is_won and closed_at >= date_trunc('month', now())),0),
    coalesce(sum(estimated_value) filter (where is_lost),0),
    coalesce(sum(mrr_amount) filter (where is_won and deal_type = 'retainer'),0),
    coalesce(avg(estimated_value) filter (where is_won),0),
    count(*) filter (where is_won),
    count(*) filter (where is_lost),
    coalesce(sum(mrr_amount) filter (where deal_type = 'retainer' and not coalesce(is_won,false) and not coalesce(is_lost,false)),0)
  from r;
end $$;

-- automatic outreach counts, per workspace (RLS applies through security_invoker)
drop view if exists public.outreach_auto;
create view public.outreach_auto with (security_invoker = on) as
select
  e.workspace_id,
  (e.occurred_at at time zone 'UTC')::date as day,
  c.id as channel_id,
  l.sender_account_id,
  e.created_by as user_id,
  count(*)::int as auto_count
from public.lead_events e
join public.leads l on l.id = e.lead_id
join public.channels c on c.workspace_id = e.workspace_id and c.kind = (case e.event_type
    when 'email_sent' then 'email'
    when 'linkedin_sent' then 'linkedin'
    when 'linkedin_connection_sent' then 'linkedin'
    when 'instagram_sent' then 'instagram'
  end)::public.channel_kind
where e.event_type in ('email_sent','linkedin_sent','linkedin_connection_sent','instagram_sent')
group by 1,2,3,4,5;
grant select on public.outreach_auto to authenticated, service_role;

-- =====================================================================
-- 7. Per-workspace lookup defaults
-- =====================================================================
create or replace function public.seed_workspace(_ws uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.stages (workspace_id, name, color, order_index, board, is_reply_stage, is_won, is_lost, default_probability) values
   (_ws,'New','#666666',1,'lead',false,false,false,0),
   (_ws,'Researching','#666666',2,'lead',false,false,false,0),
   (_ws,'Email Drafted','#666666',3,'lead',false,false,false,0),
   (_ws,'Contacted','#2563EB',4,'lead',false,false,false,0),
   (_ws,'Replied','#16A34A',5,'lead',true,false,false,0),
   (_ws,'Call Booked','#16A34A',6,'lead',false,false,false,0),
   (_ws,'Proposal Sent','#D97706',7,'lead',false,false,false,0),
   (_ws,'Client','#16A34A',8,'lead',false,true,false,0),
   (_ws,'Not Interested','#DC2626',9,'lead',false,false,true,0),
   (_ws,'Not A Priority','#D97706',10,'lead',false,false,false,0),
   (_ws,'New Reply','#2563EB',1,'crm',false,false,false,10),
   (_ws,'Qualified','#2563EB',2,'crm',false,false,false,25),
   (_ws,'Call Booked','#D97706',3,'crm',false,false,false,45),
   (_ws,'Proposal Sent','#D97706',4,'crm',false,false,false,65),
   (_ws,'Negotiation','#D97706',5,'crm',false,false,false,80),
   (_ws,'Won','#16A34A',6,'crm',false,true,false,100),
   (_ws,'Lost','#DC2626',7,'crm',false,false,true,0);

  insert into public.channels (workspace_id, name, kind, icon) values
   (_ws,'Email','email','mail'),(_ws,'LinkedIn','linkedin','linkedin'),(_ws,'Instagram','instagram','instagram');

  insert into public.countries (workspace_id, name, code, flag_emoji) values
   (_ws,'United States','US','🇺🇸'),(_ws,'United Kingdom','GB','🇬🇧'),(_ws,'Canada','CA','🇨🇦'),
   (_ws,'Australia','AU','🇦🇺'),(_ws,'India','IN','🇮🇳'),(_ws,'Germany','DE','🇩🇪'),
   (_ws,'France','FR','🇫🇷'),(_ws,'Netherlands','NL','🇳🇱'),(_ws,'United Arab Emirates','AE','🇦🇪'),(_ws,'Singapore','SG','🇸🇬');

  insert into public.outreach_targets (workspace_id, channel_id, daily_target)
  select _ws, id, case when kind = 'email' then 50 else 20 end from public.channels where workspace_id = _ws;

  insert into public.permission_presets (workspace_id, name, permission_keys, is_builtin) values
   (_ws, 'Full access', array[
     'module.lead_tracker','module.crm','lead.dashboard','lead.leads','lead.lead_create','lead.lead_edit',
     'lead.lead_delete','lead.outreach_tracker','lead.ledger','lead.archive','lead.import_export',
     'crm.records','crm.pipeline','crm.followups','crm.todos','crm.record_edit','crm.revenue',
     'settings.view','settings.stages','settings.accounts','settings.countries','settings.tags',
     'settings.targets','settings.shortcuts'], true),
   (_ws, 'Lead researcher', array[
     'module.lead_tracker','lead.dashboard','lead.leads','lead.lead_create','lead.lead_edit',
     'lead.outreach_tracker','lead.ledger','settings.shortcuts'], true),
   (_ws, 'Sales', array[
     'module.lead_tracker','module.crm','lead.dashboard','lead.leads','lead.lead_edit',
     'crm.records','crm.pipeline','crm.followups','crm.todos','crm.record_edit','settings.shortcuts'], true),
   (_ws, 'Read only', array[
     'module.lead_tracker','module.crm','lead.dashboard','lead.leads','crm.records','crm.pipeline'], true);
end $$;
revoke all on function public.seed_workspace(uuid) from public, anon, authenticated;

-- internal: make a workspace for a user and switch to it
create or replace function public.make_workspace(_uid uuid, _name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  insert into public.workspaces (name, owner_id) values (coalesce(nullif(trim(_name), ''), 'My workspace'), _uid)
  returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, _uid, 'owner');
  perform public.seed_workspace(ws);
  update public.profiles set current_workspace_id = ws where id = _uid;
  return ws;
end $$;
revoke all on function public.make_workspace(uuid, text) from public, anon, authenticated;

-- =====================================================================
-- 8. RPCs called by the UI
-- =====================================================================
create or replace function public.can_create_workspace()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null;
$$;

create or replace function public.create_workspace(_name text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if coalesce(trim(_name), '') = '' then raise exception 'Give your workspace a name'; end if;
  return public.make_workspace(auth.uid(), _name);
end $$;

create or replace function public.switch_workspace(_ws uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_ws_member(_ws) then raise exception 'You are not a member of that workspace'; end if;
  update public.profiles set current_workspace_id = _ws where id = auth.uid();
end $$;

create or replace function public.invite_preview(_token text)
returns table (email text, role text, workspace_name text, expired boolean, used boolean)
language sql stable security definer set search_path = public as $$
  select i.email, i.role::text, w.name,
         (i.expires_at < now()) as expired,
         (i.accepted_at is not null or i.revoked_at is not null) as used
  from public.workspace_invites i join public.workspaces w on w.id = i.workspace_id
  where i.token = _token;
$$;

create or replace function public.accept_invite(_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.workspace_invites%rowtype; uemail text; k text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from public.workspace_invites where token = _token for update;
  if inv.id is null then raise exception 'This invite link is not valid'; end if;
  if inv.revoked_at is not null then raise exception 'This invite was revoked'; end if;
  if inv.accepted_at is not null then raise exception 'This invite was already used'; end if;
  if inv.expires_at < now() then raise exception 'This invite has expired'; end if;
  select email into uemail from auth.users where id = auth.uid();
  if lower(coalesce(uemail, '')) <> lower(inv.email) then
    raise exception 'This invite was sent to %. Sign in with that email to accept it.', inv.email;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, auth.uid(), inv.role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;

  if inv.role = 'member' then
    foreach k in array inv.permission_keys loop
      insert into public.user_permissions (workspace_id, user_id, permission_key, enabled)
      values (inv.workspace_id, auth.uid(), k, true)
      on conflict (workspace_id, user_id, permission_key) do update set enabled = true;
    end loop;
  end if;

  update public.workspace_invites set accepted_at = now() where id = inv.id;
  update public.profiles set current_workspace_id = inv.workspace_id where id = auth.uid();
  return inv.workspace_id;
end $$;

-- Creates a lead with contacts and tags in one call. Runs as the caller, so RLS applies.
create or replace function public.create_lead(_lead jsonb, _contacts jsonb default '[]'::jsonb, _tag_ids uuid[] default '{}')
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  lid uuid; ws uuid; cols text; c jsonb; ccols text; i int := 0;
begin
  ws := public.current_ws();
  if ws is null then raise exception 'No workspace selected'; end if;
  _lead := (coalesce(_lead, '{}'::jsonb) - 'id' - 'workspace_id' - 'lead_code') || jsonb_build_object('workspace_id', ws);
  if coalesce(_lead->>'company_name', '') = '' then raise exception 'Company name is required'; end if;

  select string_agg(quote_ident(a.attname), ',') into cols
  from pg_attribute a
  where a.attrelid = 'public.leads'::regclass and a.attnum > 0 and not a.attisdropped
    and _lead ? a.attname;
  execute format('insert into public.leads (%s) select %s from jsonb_populate_record(null::public.leads, $1) returning id', cols, cols)
    using _lead into lid;

  for c in select * from jsonb_array_elements(coalesce(_contacts, '[]'::jsonb)) loop
    c := (c - 'id' - 'lead_id' - 'workspace_id') || jsonb_build_object('lead_id', lid, 'workspace_id', ws);
    if not (c ? 'order_index') then c := c || jsonb_build_object('order_index', i); end if;
    select string_agg(quote_ident(a.attname), ',') into ccols
    from pg_attribute a
    where a.attrelid = 'public.lead_contacts'::regclass and a.attnum > 0 and not a.attisdropped and c ? a.attname;
    execute format('insert into public.lead_contacts (%s) select %s from jsonb_populate_record(null::public.lead_contacts, $1)', ccols, ccols)
      using c;
    i := i + 1;
  end loop;

  if _tag_ids is not null and array_length(_tag_ids, 1) > 0 then
    insert into public.lead_tags (workspace_id, lead_id, tag_id)
    select ws, lid, t from unnest(_tag_ids) t
    where exists (select 1 from public.tags g where g.id = t and g.workspace_id = ws)
    on conflict do nothing;
  end if;
  return lid;
end $$;

grant execute on function public.can_create_workspace(), public.create_workspace(text), public.switch_workspace(uuid),
  public.invite_preview(text), public.accept_invite(text), public.create_lead(jsonb, jsonb, uuid[]),
  public.ensure_crm_record(uuid), public.set_crm_stage(uuid, text), public.remove_crm_record(uuid),
  public.revenue_summary() to authenticated;
grant execute on function public.invite_preview(text) to anon;

-- =====================================================================
-- 9. Sign-up: profile + a first workspace
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  nm := coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1));
  insert into public.profiles (id, email, full_name, avatar_url, role, is_active)
  values (new.id, new.email, nm, new.raw_user_meta_data->>'avatar_url', 'member', true)
  on conflict (id) do nothing;
  perform public.make_workspace(new.id, nm || '''s workspace');
  return new;
end $$;

-- =====================================================================
-- 10. RLS: drop every old policy, recreate workspace-scoped ones
-- =====================================================================
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['workspaces','workspace_members','workspace_invites','outreach_templates','feedback','fx_rates','fx_rates_history'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
grant select on public.fx_rates, public.fx_rates_history to anon;

-- profiles: yourself, plus people who share a workspace with you
create policy "profiles read" on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.workspace_members a join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy "profiles update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- workspaces
create policy "ws read" on public.workspaces for select to authenticated using (public.is_ws_member(id));
create policy "ws update" on public.workspaces for update to authenticated using (public.ws_admin(id)) with check (public.ws_admin(id));
create policy "ws delete" on public.workspaces for delete to authenticated using (public.ws_role(id) = 'owner');

-- members
create policy "members read" on public.workspace_members for select to authenticated using (public.is_ws_member(workspace_id));
create policy "members update" on public.workspace_members for update to authenticated
  using (public.ws_admin(workspace_id) and role <> 'owner') with check (public.ws_admin(workspace_id) and role <> 'owner');
create policy "members delete" on public.workspace_members for delete to authenticated
  using ((public.ws_admin(workspace_id) and role <> 'owner') or (user_id = auth.uid() and role <> 'owner'));

-- invites
create policy "invites read" on public.workspace_invites for select to authenticated using (public.ws_admin(workspace_id));
create policy "invites write" on public.workspace_invites for all to authenticated
  using (public.ws_admin(workspace_id)) with check (public.ws_admin(workspace_id));

-- permissions
create policy "perms read" on public.user_permissions for select to authenticated
  using (workspace_id = public.current_ws() and (user_id = auth.uid() or public.is_admin()));
create policy "perms write" on public.user_permissions for all to authenticated
  using (workspace_id = public.current_ws() and public.is_admin())
  with check (workspace_id = public.current_ws() and public.is_admin());

create policy "presets read" on public.permission_presets for select to authenticated using (workspace_id = public.current_ws());
create policy "presets write" on public.permission_presets for all to authenticated
  using (workspace_id = public.current_ws() and public.is_admin())
  with check (workspace_id = public.current_ws() and public.is_admin());

-- settings-style lookup tables: read for members, write with the matching permission
-- (the importer may also create missing stages / channels / accounts / countries / tags)
do $$
declare t text; k text;
begin
  for t, k in select * from (values
    ('stages','settings.stages'), ('channels','settings.accounts'), ('sender_accounts','settings.accounts'),
    ('countries','settings.countries'), ('tags','settings.tags'), ('outreach_targets','settings.targets')) v(t, k) loop
    execute format('create policy "ws read" on public.%I for select to authenticated using (workspace_id = public.current_ws())', t);
    execute format('create policy "ws write" on public.%I for all to authenticated using (workspace_id = public.current_ws() and (public.can(%L) or public.can(''lead.import_export'') or public.can(''lead.lead_create''))) with check (workspace_id = public.current_ws() and (public.can(%L) or public.can(''lead.import_export'') or public.can(''lead.lead_create'')))', t, k, k);
  end loop;
end $$;

-- tables any member can read and write inside their workspace
do $$
declare t text;
begin
  foreach t in array array['app_settings','followup_templates','import_mappings','outreach_templates'] loop
    execute format('create policy "ws all" on public.%I for all to authenticated using (workspace_id = public.current_ws()) with check (workspace_id = public.current_ws())', t);
  end loop;
end $$;

create policy "daily read" on public.outreach_daily for select to authenticated using (workspace_id = public.current_ws());
create policy "daily write" on public.outreach_daily for all to authenticated
  using (workspace_id = public.current_ws() and user_id = auth.uid())
  with check (workspace_id = public.current_ws() and user_id = auth.uid());

create policy "shortcuts own" on public.shortcuts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- leads
create policy "leads read" on public.leads for select to authenticated
  using (workspace_id = public.current_ws() and (public.can('lead.leads') or public.can('crm.records') or public.can('lead.dashboard')));
create policy "leads insert" on public.leads for insert to authenticated
  with check (workspace_id = public.current_ws() and (public.can('lead.lead_create') or public.can('lead.import_export')));
create policy "leads update" on public.leads for update to authenticated
  using (workspace_id = public.current_ws() and (public.can('lead.lead_edit') or public.can('crm.record_edit') or public.can('lead.import_export')))
  with check (workspace_id = public.current_ws());
create policy "leads delete" on public.leads for delete to authenticated
  using (workspace_id = public.current_ws() and (public.can('lead.lead_delete') or public.can('lead.import_export')));

do $$
declare t text;
begin
  foreach t in array array['lead_contacts','lead_links','lead_tags','lead_followups','lead_tasks'] loop
    execute format('create policy "ws read" on public.%I for select to authenticated using (workspace_id = public.current_ws() and (public.can(''lead.leads'') or public.can(''crm.records'') or public.can(''lead.dashboard'')))', t);
    execute format('create policy "ws write" on public.%I for all to authenticated using (workspace_id = public.current_ws() and (public.can(''lead.lead_edit'') or public.can(''crm.record_edit'') or public.can(''lead.lead_create'') or public.can(''lead.import_export'') or public.can(''crm.todos''))) with check (workspace_id = public.current_ws())', t);
  end loop;
end $$;

create policy "events read" on public.lead_events for select to authenticated
  using (workspace_id = public.current_ws());
create policy "events insert" on public.lead_events for insert to authenticated
  with check (workspace_id = public.current_ws());
create policy "events edit" on public.lead_events for update to authenticated
  using (workspace_id = public.current_ws() and (created_by = auth.uid() or public.is_admin()))
  with check (workspace_id = public.current_ws());
create policy "events delete" on public.lead_events for delete to authenticated
  using (workspace_id = public.current_ws() and (created_by = auth.uid() or public.is_admin()));

create policy "crm read" on public.crm_records for select to authenticated
  using (workspace_id = public.current_ws() and (public.can('crm.records') or public.can('lead.leads')));
create policy "crm write" on public.crm_records for all to authenticated
  using (workspace_id = public.current_ws() and (public.can('crm.record_edit') or public.can('lead.lead_edit')))
  with check (workspace_id = public.current_ws());
create policy "crm log read" on public.crm_contact_log for select to authenticated
  using (workspace_id = public.current_ws() and public.can('crm.records'));
create policy "crm log write" on public.crm_contact_log for all to authenticated
  using (workspace_id = public.current_ws() and public.can('crm.record_edit'))
  with check (workspace_id = public.current_ws());

create policy "feedback insert" on public.feedback for insert to authenticated with check (user_id = auth.uid());
create policy "feedback read own" on public.feedback for select to authenticated using (user_id = auth.uid());

create policy "fx read" on public.fx_rates for select using (true);
create policy "fx write" on public.fx_rates for all to authenticated using (true) with check (true);
create policy "fx hist read" on public.fx_rates_history for select using (true);
create policy "fx hist write" on public.fx_rates_history for all to authenticated using (true) with check (true);

-- =====================================================================
-- 11. Avatars bucket
-- =====================================================================
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- 12. Realtime
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['leads','lead_events','lead_followups','lead_contacts','lead_links','lead_tags','lead_tasks',
    'crm_records','crm_contact_log','outreach_daily','outreach_targets','stages','profiles','user_permissions',
    'permission_presets','followup_templates','workspace_members'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
