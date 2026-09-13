-- 1. New lead columns
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS linkedin_connection_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linkedin_connection_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS contacted_channel_id uuid REFERENCES public.channels(id),
  ADD COLUMN IF NOT EXISTS reply_channel_id uuid REFERENCES public.channels(id);

-- 2. Permission presets
CREATE TABLE IF NOT EXISTS public.permission_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  permission_keys text[] NOT NULL DEFAULT '{}',
  is_builtin boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permission_presets TO authenticated;
GRANT ALL ON public.permission_presets TO service_role;
ALTER TABLE public.permission_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "presets readable" ON public.permission_presets;
CREATE POLICY "presets readable" ON public.permission_presets FOR SELECT TO authenticated USING (public.is_active_user());
DROP POLICY IF EXISTS "presets manageable" ON public.permission_presets;
CREATE POLICY "presets manageable" ON public.permission_presets FOR ALL TO authenticated
  USING (public.can('settings.users')) WITH CHECK (public.can('settings.users'));
DROP TRIGGER IF EXISTS permission_presets_touch ON public.permission_presets;
CREATE TRIGGER permission_presets_touch BEFORE UPDATE ON public.permission_presets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Follow-up templates
CREATE TABLE IF NOT EXISTS public.followup_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  steps jsonb NOT NULL DEFAULT '[]',
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_templates TO authenticated;
GRANT ALL ON public.followup_templates TO service_role;
ALTER TABLE public.followup_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "templates readable" ON public.followup_templates;
CREATE POLICY "templates readable" ON public.followup_templates FOR SELECT TO authenticated USING (public.is_active_user());
DROP POLICY IF EXISTS "templates manageable" ON public.followup_templates;
CREATE POLICY "templates manageable" ON public.followup_templates FOR ALL TO authenticated
  USING (public.can('settings.view')) WITH CHECK (public.can('settings.view'));
DROP TRIGGER IF EXISTS followup_templates_touch ON public.followup_templates;
CREATE TRIGGER followup_templates_touch BEFORE UPDATE ON public.followup_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Stage automation (BEFORE UPDATE on leads)
CREATE OR REPLACE FUNCTION public.leads_stage_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  sname text;
  ck text;
  rk text;
begin
  if new.stage_id is distinct from old.stage_id and new.stage_id is not null then
    select name into sname from public.stages where id = new.stage_id;
    select kind::text into ck from public.channels where id = new.contacted_channel_id;
    select kind::text into rk from public.channels where id = new.reply_channel_id;
    ck := coalesce(ck, 'email');
    rk := coalesce(rk, ck);

    if sname ilike 'contacted%' then
      if ck = 'linkedin' then
        if not new.linkedin_sent then
          new.linkedin_sent := true;
          new.linkedin_sent_at := coalesce(new.linkedin_sent_at, now());
        end if;
      elsif ck = 'instagram' then
        if not new.instagram_sent then
          new.instagram_sent := true;
          new.instagram_sent_at := coalesce(new.instagram_sent_at, now());
        end if;
      else
        if not new.email_sent then
          new.email_sent := true;
          new.email_sent_at := coalesce(new.email_sent_at, now());
        end if;
      end if;
      new.last_contacted_at := coalesce(new.last_contacted_at, now());
    elsif sname ilike 'replied%' then
      if rk = 'linkedin' then
        if not new.linkedin_replied then
          new.linkedin_replied := true;
          new.linkedin_replied_at := coalesce(new.linkedin_replied_at, now());
        end if;
      elsif rk = 'instagram' then
        if not new.instagram_replied then
          new.instagram_replied := true;
          new.instagram_replied_at := coalesce(new.instagram_replied_at, now());
        end if;
      else
        if not new.email_viewed then
          new.email_viewed := true;
          new.email_viewed_at := coalesce(new.email_viewed_at, now());
        end if;
        if not new.email_replied then
          new.email_replied := true;
          new.email_replied_at := coalesce(new.email_replied_at, now());
        end if;
      end if;
    elsif sname ilike '%call booked%' or sname ilike '%meeting%' then
      if not new.meeting_booked then
        new.meeting_booked := true;
        new.meeting_booked_at := coalesce(new.meeting_booked_at, now());
      end if;
    elsif sname ilike 'client%' then
      if not new.client_closed then
        new.client_closed := true;
        new.client_closed_at := coalesce(new.client_closed_at, now());
      end if;
    end if;
  end if;

  -- replying implies the email was viewed
  if new.email_replied and not new.email_viewed then
    new.email_viewed := true;
    new.email_viewed_at := coalesce(new.email_viewed_at, new.email_replied_at, now());
  end if;

  return new;
end $$;

DROP TRIGGER IF EXISTS leads_stage_automation ON public.leads;
CREATE TRIGGER leads_stage_automation BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_stage_automation();

-- 5. Richer activity logging
CREATE OR REPLACE FUNCTION public.leads_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  is_reply boolean := false;
  old_stage text;
  new_stage text;
  ch_name text;
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

-- 6. Automatic outreach counts view
CREATE OR REPLACE VIEW public.outreach_auto
WITH (security_invoker = on) AS
SELECT
  (e.occurred_at AT TIME ZONE 'UTC')::date AS day,
  c.id AS channel_id,
  l.sender_account_id,
  e.created_by AS user_id,
  count(*)::int AS auto_count
FROM public.lead_events e
JOIN public.leads l ON l.id = e.lead_id
JOIN public.channels c ON c.kind = (CASE e.event_type
    WHEN 'email_sent' THEN 'email'
    WHEN 'linkedin_sent' THEN 'linkedin'
    WHEN 'linkedin_connection_sent' THEN 'linkedin'
    WHEN 'instagram_sent' THEN 'instagram'
  END)::channel_kind
WHERE e.event_type IN ('email_sent','linkedin_sent','linkedin_connection_sent','instagram_sent')
GROUP BY 1,2,3,4;

GRANT SELECT ON public.outreach_auto TO authenticated;
GRANT SELECT ON public.outreach_auto TO service_role;

-- 7. Realtime
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','lead_events','lead_followups','lead_contacts','lead_links','lead_tags','crm_records','crm_contact_log','outreach_daily','outreach_targets','stages','profiles','user_permissions','permission_presets','followup_templates'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.lead_followups REPLICA IDENTITY FULL;
ALTER TABLE public.crm_records REPLICA IDENTITY FULL;
