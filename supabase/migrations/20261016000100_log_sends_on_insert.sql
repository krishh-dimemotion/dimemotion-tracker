-- Leads created already marked as sent / replied (rapid entry, bookmarklet, import) log the
-- matching events, so the Outreach tracker and Ledger count them like later updates do.
create or replace function public.leads_log_insert_flags()
returns trigger language plpgsql security definer set search_path = public as $$
declare f text; flags text[] := array[
  'email_sent','email_viewed','email_replied','loom_sent','loom_watched','linkedin_connection_sent',
  'linkedin_sent','linkedin_replied','instagram_sent','instagram_replied','meeting_booked','client_closed'];
  j jsonb := to_jsonb(new);
begin
  foreach f in array flags loop
    if coalesce((j->>f)::boolean, false) then
      insert into public.lead_events (workspace_id, lead_id, event_type, occurred_at, meta, created_by)
      values (new.workspace_id, new.id, f, coalesce((j->>(f || '_at'))::timestamptz, now()),
              case when f = 'email_sent' then jsonb_build_object('sender_account_id', new.sender_account_id) else '{}'::jsonb end,
              coalesce(auth.uid(), new.created_by));
    end if;
  end loop;
  if new.reply_sentiment = 'positive' and (new.email_replied or new.linkedin_replied or new.instagram_replied) then
    perform public.ensure_crm_record(new.id);
  end if;
  return new;
end $$;

create trigger leads_log_insert_flags after insert on public.leads
  for each row execute function public.leads_log_insert_flags();
