-- 1. Tasks / to-dos
create table if not exists public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  title text not null,
  notes text,
  due_date date,
  assignee_id uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.lead_tasks to authenticated;
grant all on public.lead_tasks to service_role;

alter table public.lead_tasks enable row level security;

drop policy if exists "tasks read" on public.lead_tasks;
create policy "tasks read" on public.lead_tasks for select to authenticated
  using (public.can('lead.leads') or public.can('crm.records'));

drop policy if exists "tasks write" on public.lead_tasks;
create policy "tasks write" on public.lead_tasks for all to authenticated
  using (public.can('lead.lead_edit') or public.can('crm.record_edit'))
  with check (public.can('lead.lead_edit') or public.can('crm.record_edit'));

create index if not exists lead_tasks_lead_idx on public.lead_tasks(lead_id);
create index if not exists lead_tasks_due_idx on public.lead_tasks(due_date);

drop trigger if exists lead_tasks_touch on public.lead_tasks;
create trigger lead_tasks_touch before update on public.lead_tasks
  for each row execute function public.touch_updated_at();

alter publication supabase_realtime add table public.lead_tasks;

-- 2. New permission key for the to-do page
insert into public.user_permissions (user_id, permission_key, enabled)
select up.user_id, 'crm.todos', up.enabled
from public.user_permissions up
where up.permission_key = 'crm.records'
on conflict do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  existing_count int;
  pre_profile public.profiles%rowtype;
  k text;
  all_keys text[] := array[
    'module.lead_tracker','module.crm','lead.dashboard','lead.leads','lead.lead_create',
    'lead.lead_edit','lead.lead_delete','lead.outreach_tracker','lead.ledger','lead.archive',
    'lead.import_export','crm.records','crm.pipeline','crm.followups','crm.todos','crm.record_edit',
    'crm.revenue','settings.view','settings.stages','settings.accounts','settings.countries',
    'settings.tags','settings.targets','settings.shortcuts','settings.users'];
begin
  select count(*) into existing_count from public.profiles;
  select * into pre_profile from public.profiles where lower(email) = lower(new.email) and id <> new.id limit 1;

  if existing_count = 0 then
    insert into public.profiles (id, email, full_name, role, is_active)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'owner', true);
    foreach k in array all_keys loop
      insert into public.user_permissions (user_id, permission_key, enabled) values (new.id, k, true)
      on conflict do nothing;
    end loop;
  elsif pre_profile.id is not null then
    insert into public.profiles (id, email, full_name, role, is_active)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', pre_profile.full_name, new.email), pre_profile.role, true);
    update public.user_permissions set user_id = new.id where user_id = pre_profile.id;
    delete from public.profiles where id = pre_profile.id;
  else
    insert into public.profiles (id, email, full_name, role, is_active)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'member', false);
  end if;
  return new;
end; $function$;

-- 3. Pull a lead back out of the CRM
create or replace function public.remove_crm_record(_lead_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  delete from public.crm_records where lead_id = _lead_id;
  update public.leads set pushed_to_crm = false, pushed_to_crm_at = null where id = _lead_id;
  insert into public.lead_events (lead_id, event_type, meta, created_by)
  values (_lead_id, 'pulled_from_crm', '{}'::jsonb, auth.uid());
end $function$;

grant execute on function public.remove_crm_record(uuid) to authenticated;

-- 4. Only positive replies auto-push to the CRM
create or replace function public.leads_after_change()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  is_reply boolean := false;
  old_stage text;
  new_stage text;
begin
  if TG_OP = 'INSERT' then
    insert into public.lead_events (lead_id, event_type, meta, created_by)
    values (new.id, 'lead_created', jsonb_build_object('company', new.company_name), auth.uid());
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    select name into old_stage from public.stages where id = old.stage_id;
    select name into new_stage from public.stages where id = new.stage_id;
    insert into public.lead_events (lead_id, event_type, meta, created_by)
    values (new.id, 'stage_changed', jsonb_build_object(
      'stage_id', new.stage_id, 'from', old_stage, 'to', new_stage), auth.uid());
  end if;
  if new.status is distinct from old.status then
    insert into public.lead_events (lead_id, event_type, meta, created_by)
    values (new.id, 'status_changed', jsonb_build_object('status', new.status, 'from', old.status, 'to', new.status), auth.uid());
  end if;
  if new.priority is distinct from old.priority then
    insert into public.lead_events (lead_id, event_type, meta, created_by)
    values (new.id, 'priority_changed', jsonb_build_object('from', old.priority, 'to', new.priority), auth.uid());
  end if;
  if new.reply_sentiment is distinct from old.reply_sentiment then
    insert into public.lead_events (lead_id, event_type, meta, created_by)
    values (new.id, 'sentiment_changed', jsonb_build_object('from', old.reply_sentiment, 'to', new.reply_sentiment), auth.uid());
  end if;
  if new.archived is distinct from old.archived then
    insert into public.lead_events (lead_id, event_type, meta, created_by)
    values (new.id, case when new.archived then 'archived' else 'restored' end, '{}'::jsonb, auth.uid());
  end if;

  if new.email_sent and not old.email_sent then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by)
      values (new.id,'email_sent', coalesce(new.email_sent_at, now()),
        jsonb_build_object('sender_account_id', new.sender_account_id), auth.uid());
  end if;
  if new.email_viewed and not old.email_viewed then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by) values (new.id,'email_viewed', coalesce(new.email_viewed_at, now()), '{}'::jsonb, auth.uid());
  end if;
  if new.email_replied and not old.email_replied then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by) values (new.id,'email_replied', coalesce(new.email_replied_at, now()), '{}'::jsonb, auth.uid());
  end if;
  if new.loom_sent and not old.loom_sent then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by) values (new.id,'loom_sent', coalesce(new.loom_sent_at, now()), '{}'::jsonb, auth.uid());
  end if;
  if new.loom_watched and not old.loom_watched then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by) values (new.id,'loom_watched', coalesce(new.loom_watched_at, now()), '{}'::jsonb, auth.uid());
  end if;
  if new.linkedin_connection_sent and not old.linkedin_connection_sent then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by) values (new.id,'linkedin_connection_sent', coalesce(new.linkedin_connection_sent_at, now()), '{}'::jsonb, auth.uid());
  end if;
  if new.linkedin_sent and not old.linkedin_sent then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by) values (new.id,'linkedin_sent', coalesce(new.linkedin_sent_at, now()), '{}'::jsonb, auth.uid());
  end if;
  if new.linkedin_replied and not old.linkedin_replied then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by) values (new.id,'linkedin_replied', coalesce(new.linkedin_replied_at, now()), '{}'::jsonb, auth.uid());
  end if;
  if new.instagram_sent and not old.instagram_sent then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by) values (new.id,'instagram_sent', coalesce(new.instagram_sent_at, now()), '{}'::jsonb, auth.uid());
  end if;
  if new.instagram_replied and not old.instagram_replied then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by) values (new.id,'instagram_replied', coalesce(new.instagram_replied_at, now()), '{}'::jsonb, auth.uid());
  end if;
  if new.meeting_booked and not old.meeting_booked then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by) values (new.id,'meeting_booked', coalesce(new.meeting_booked_at, now()), '{}'::jsonb, auth.uid());
  end if;
  if new.client_closed and not old.client_closed then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by) values (new.id,'client_closed', coalesce(new.client_closed_at, now()), '{}'::jsonb, auth.uid());
  end if;

  -- a reply only matters for the CRM when the sentiment is positive
  if new.reply_sentiment = 'positive' then
    if (new.email_replied and not old.email_replied)
       or (new.linkedin_replied and not old.linkedin_replied)
       or (new.instagram_replied and not old.instagram_replied)
       or (new.reply_sentiment is distinct from old.reply_sentiment) then
      is_reply := true;
    end if;
    if new.stage_id is distinct from old.stage_id and new.stage_id is not null
       and exists (select 1 from public.stages s where s.id = new.stage_id and s.is_reply_stage) then
      is_reply := true;
    end if;
    if is_reply then
      perform public.ensure_crm_record(new.id);
    end if;
  elsif old.reply_sentiment = 'positive'
        and new.reply_sentiment is distinct from old.reply_sentiment
        and new.pushed_to_crm then
    perform public.remove_crm_record(new.id);
  end if;

  return new;
end $function$;

-- 5. Clean up records whose lead is not a positive reply
do $$
declare l uuid;
begin
  for l in
    select r.lead_id from public.crm_records r
    join public.leads x on x.id = r.lead_id
    where x.reply_sentiment is distinct from 'positive'
  loop
    delete from public.crm_records where lead_id = l;
    update public.leads set pushed_to_crm = false, pushed_to_crm_at = null where id = l;
  end loop;
end $$;