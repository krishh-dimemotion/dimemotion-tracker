-- create CRM record helper
create or replace function public.ensure_crm_record(_lead_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; st uuid; prob int;
begin
  select id into rid from public.crm_records where lead_id = _lead_id;
  if rid is not null then return rid; end if;
  select id, default_probability into st, prob from public.stages where board = 'crm' order by order_index limit 1;
  insert into public.crm_records (lead_id, stage_id, priority, probability, owner_id)
  values (_lead_id, st, 'medium', coalesce(prob,10), auth.uid())
  returning id into rid;
  update public.leads set pushed_to_crm = true, pushed_to_crm_at = coalesce(pushed_to_crm_at, now()) where id = _lead_id;
  insert into public.lead_events (lead_id, event_type, meta, created_by)
  values (_lead_id, 'pushed_to_crm', '{}'::jsonb, auth.uid());
  return rid;
end $$;
grant execute on function public.ensure_crm_record(uuid) to authenticated;

-- log lead changes + auto CRM on reply
create or replace function public.leads_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare is_reply boolean := false;
begin
  if TG_OP = 'INSERT' then
    insert into public.lead_events (lead_id, event_type, meta, created_by)
    values (new.id, 'lead_created', jsonb_build_object('company', new.company_name), auth.uid());
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    insert into public.lead_events (lead_id, event_type, meta, created_by)
    values (new.id, 'stage_changed', jsonb_build_object('stage_id', new.stage_id), auth.uid());
  end if;
  if new.status is distinct from old.status then
    insert into public.lead_events (lead_id, event_type, meta, created_by)
    values (new.id, 'status_changed', jsonb_build_object('status', new.status), auth.uid());
  end if;
  if new.archived is distinct from old.archived then
    insert into public.lead_events (lead_id, event_type, meta, created_by)
    values (new.id, case when new.archived then 'archived' else 'restored' end, '{}'::jsonb, auth.uid());
  end if;

  -- boolean tracked fields
  if new.email_sent and not old.email_sent then
    insert into public.lead_events (lead_id, event_type, occurred_at, meta, created_by) values (new.id,'email_sent', coalesce(new.email_sent_at, now()), '{}'::jsonb, auth.uid());
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

  -- CRM creation on reply
  if (new.email_replied and not old.email_replied)
     or (new.linkedin_replied and not old.linkedin_replied)
     or (new.instagram_replied and not old.instagram_replied) then
    is_reply := true;
  end if;
  if new.stage_id is distinct from old.stage_id and new.stage_id is not null then
    if exists (select 1 from public.stages s where s.id = new.stage_id and s.is_reply_stage) then
      is_reply := true;
    end if;
  end if;
  if is_reply then
    perform public.ensure_crm_record(new.id);
  end if;
  return new;
end $$;

create trigger leads_after_insert after insert on public.leads for each row execute function public.leads_after_change();
create trigger leads_after_update after update on public.leads for each row execute function public.leads_after_change();

-- keep next_followup_date in sync with earliest pending followup
create or replace function public.sync_next_followup()
returns trigger language plpgsql security definer set search_path = public as $$
declare lid uuid; d date;
begin
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

create trigger followups_sync after insert or update or delete on public.lead_followups
  for each row execute function public.sync_next_followup();

-- crm contact log updates last_contacted_at
create or replace function public.sync_crm_contact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.crm_records set last_contacted_at = greatest(coalesce(last_contacted_at, to_timestamp(0)), new.contacted_at)
   where id = new.crm_record_id;
  return new;
end $$;
create trigger crm_log_sync after insert on public.crm_contact_log for each row execute function public.sync_crm_contact();