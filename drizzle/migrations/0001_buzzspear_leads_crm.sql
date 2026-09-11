create sequence public.lead_code_seq start 1;

create or replace function public.next_lead_code()
returns text language sql volatile as $$
  select 'LEAD-' || lpad(nextval('public.lead_code_seq')::text, 4, '0');
$$;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_code text unique not null default public.next_lead_code(),
  company_name text not null,
  primary_contact text,
  country_id uuid references public.countries(id) on delete set null,
  stage_id uuid references public.stages(id) on delete set null,
  status text not null default 'no_reply',
  priority text default 'medium',
  channel_id uuid references public.channels(id) on delete set null,
  sender_account_id uuid references public.sender_accounts(id) on delete set null,
  date_added date not null default current_date,
  website_url text, company_linkedin_url text, instagram_url text, youtube_url text,
  research_notes text, additional_notes text,
  email_sent boolean not null default false, email_sent_at timestamptz,
  email_viewed boolean not null default false, email_viewed_at timestamptz,
  email_replied boolean not null default false, email_replied_at timestamptz,
  reply_sentiment text,
  loom_url text,
  loom_sent boolean not null default false, loom_sent_at timestamptz,
  loom_watched boolean not null default false, loom_watched_at timestamptz,
  loom_watch_percent int,
  linkedin_sent boolean not null default false, linkedin_sent_at timestamptz,
  linkedin_replied boolean not null default false, linkedin_replied_at timestamptz,
  instagram_sent boolean not null default false, instagram_sent_at timestamptz,
  instagram_replied boolean not null default false, instagram_replied_at timestamptz,
  meeting_booked boolean not null default false, meeting_booked_at timestamptz,
  client_closed boolean not null default false, client_closed_at timestamptz,
  last_contacted_at timestamptz,
  next_followup_date date,
  pushed_to_crm boolean not null default false, pushed_to_crm_at timestamptz,
  archived boolean not null default false, archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lead_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  person_name text, job_title text, email text, emails jsonb not null default '[]'::jsonb,
  linkedin_url text, instagram_url text, phone text,
  is_primary boolean not null default false, order_index int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.lead_links (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  label text, url text, order_index int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.lead_tags (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (lead_id, tag_id)
);
create table public.lead_followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  sequence_number int not null default 1,
  scheduled_date date,
  sent_at timestamptz,
  channel_id uuid references public.channels(id) on delete set null,
  notes text,
  status text not null default 'pending',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.crm_records (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  stage_id uuid references public.stages(id) on delete set null,
  priority text not null default 'medium',
  estimated_value numeric default 0,
  currency text not null default 'USD',
  deal_type text not null default 'one_time',
  mrr_amount numeric default 0,
  contract_months int,
  probability int default 10,
  last_contacted_at timestamptz,
  next_followup_date date,
  expected_close_date date,
  closed_at timestamptz,
  owner_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.crm_contact_log (
  id uuid primary key default gen_random_uuid(),
  crm_record_id uuid not null references public.crm_records(id) on delete cascade,
  contacted_at timestamptz not null default now(),
  channel_id uuid references public.channels(id) on delete set null,
  direction text not null default 'outbound',
  summary text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index on public.leads (stage_id);
create index on public.leads (country_id);
create index on public.leads (status);
create index on public.leads (next_followup_date);
create index on public.leads (date_added);
create index on public.leads (archived);
create index on public.leads (pushed_to_crm);
create index on public.leads (company_name);
create index on public.lead_events (lead_id, occurred_at desc);
create index on public.lead_events (event_type, occurred_at);
create index on public.lead_followups (lead_id, sequence_number);
create index on public.crm_records (stage_id);
create index on public.crm_records (next_followup_date);

do $$
declare t text;
begin
  foreach t in array array['leads','lead_contacts','lead_links','lead_tags','lead_followups','lead_events','crm_records','crm_contact_log'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t||'_touch', t);
  end loop;
end $$;

-- lead policies
create policy "leads read" on public.leads for select to authenticated using (public.can('lead.leads') or public.can('crm.records'));
create policy "leads insert" on public.leads for insert to authenticated with check (public.can('lead.lead_create'));
create policy "leads update" on public.leads for update to authenticated using (public.can('lead.lead_edit') or public.can('crm.record_edit')) with check (public.can('lead.lead_edit') or public.can('crm.record_edit'));
create policy "leads delete" on public.leads for delete to authenticated using (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['lead_contacts','lead_links','lead_tags','lead_followups'] loop
    execute format('create policy "child read" on public.%I for select to authenticated using (public.can(''lead.leads'') or public.can(''crm.records''))', t);
    execute format('create policy "child write" on public.%I for all to authenticated using (public.can(''lead.lead_edit'') or public.can(''crm.record_edit'')) with check (public.can(''lead.lead_edit'') or public.can(''crm.record_edit''))', t);
  end loop;
end $$;

create policy "events read" on public.lead_events for select to authenticated using (public.can('lead.leads') or public.can('crm.records'));
create policy "events insert" on public.lead_events for insert to authenticated with check (public.is_active_user());

create policy "crm read" on public.crm_records for select to authenticated using (public.can('crm.records'));
create policy "crm write" on public.crm_records for all to authenticated using (public.can('crm.record_edit')) with check (public.can('crm.record_edit'));
create policy "crm log read" on public.crm_contact_log for select to authenticated using (public.can('crm.records'));
create policy "crm log write" on public.crm_contact_log for all to authenticated using (public.can('crm.record_edit')) with check (public.can('crm.record_edit'));

-- ===== REVENUE-GATED VIEW =====
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
grant execute on function public.revenue_summary() to authenticated;