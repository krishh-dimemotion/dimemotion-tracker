CREATE OR REPLACE FUNCTION public.set_crm_stage(_lead_id uuid, _kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  rid uuid;
  st uuid;
  prob int;
begin
  rid := public.ensure_crm_record(_lead_id);
  if _kind = 'lost' then
    select id, default_probability into st, prob from public.stages
      where board = 'crm' and is_lost order by order_index limit 1;
  else
    select id, default_probability into st, prob from public.stages
      where board = 'crm' and is_won order by order_index limit 1;
  end if;
  if st is null or rid is null then return; end if;
  update public.crm_records
     set stage_id = st,
         probability = coalesce(prob, probability),
         closed_at = case when _kind = 'won' then coalesce(closed_at, now()) else closed_at end
   where id = rid;
end $function$;

CREATE OR REPLACE FUNCTION public.leads_after_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  is_reply boolean := false;
  old_stage text;
  new_stage text;
  new_stage_name text;
  new_is_lost boolean := false;
  new_is_won boolean := false;
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
  end if;

  -- lost / won leads are kept in the CRM pipeline in the matching column
  if new.stage_id is not null then
    select name, is_lost, is_won into new_stage_name, new_is_lost, new_is_won
      from public.stages where id = new.stage_id;
  end if;

  if (new.stage_id is distinct from old.stage_id or new.status is distinct from old.status)
     and (coalesce(new_is_lost, false)
          or coalesce(new_stage_name, '') ilike 'not %'
          or new.status = 'lost') then
    perform public.set_crm_stage(new.id, 'lost');
  elsif (new.stage_id is distinct from old.stage_id or new.status is distinct from old.status
         or (new.client_closed and not old.client_closed))
        and (coalesce(new_is_won, false) or new.status = 'won' or (new.client_closed and not old.client_closed)) then
    perform public.set_crm_stage(new.id, 'won');
  end if;

  return new;
end $function$;