import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ExternalLink, Plus, Trash2, Upload } from "lucide-react";
import { AppPage } from "@/components/app-shell";
import { CollapsibleCard, EmptyState, Loading, MANUAL_HELPER, Pill, CheckDate } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { isTypingTarget } from "@/lib/shortcuts";
import { useStages, useChannels, useSenderAccounts, useCountries, useTags } from "@/hooks/useLookups";
import { fmtDate, fmtDateTime, toDateInput } from "@/lib/format";
import { StagePill } from "@/components/leads/StagePill";
import { PeopleCard } from "@/components/leads/detail/PeopleCard";
import { FollowupsCard } from "@/components/leads/detail/FollowupsCard";
import { ActivityFeed } from "@/components/leads/detail/ActivityFeed";
import { SENTIMENT_OPTIONS, STATUS_OPTIONS, PRIORITY_OPTIONS, type LeadContact, type LeadLink, type LeadFollowup } from "@/components/leads/types";

export const Route = createFileRoute("/lt/leads/$id")({
  head: () => ({
    meta: [
      { title: "Lead | Lead Tracker" },
      { name: "description", content: "Full lead detail: company info, people, outreach and activity." },
      { property: "og:title", content: "Lead | Lead Tracker" },
      { property: "og:description", content: "Full lead detail: company info, people, outreach and activity." },
    ],
  }),
  component: LeadDetailPage,
});

const STATUS_LABELS: Record<string, string> = {
  no_reply: "No reply",
  replied: "Replied",
  bounced: "Bounced",
  converted: "Converted",
  not_interested: "Not interested",
};

function useSaveIndicator() {
  const [saved, setSaved] = useState<null | "saving" | "saved">(null);
  const flashSaved = () => {
    setSaved("saved");
    setTimeout(() => setSaved(null), 1500);
  };
  return { saved, setSaved, flashSaved };
}

function LeadDetailPage() {
  const { id } = useParams({ from: "/lt/leads/$id" });
  const { user, can } = useAuth();
  const canEdit = can("lead.leads");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const companyNameRef = useRef<HTMLInputElement>(null);

  const { data: stages } = useStages("lead");
  const { data: countries } = useCountries();
  const { data: channels } = useChannels();
  const { data: senderAccounts } = useSenderAccounts();
  const { data: tags } = useTags();

  const [creating, setCreating] = useState(id === "new");

  // Create-mode: insert a lead, then swap URL.
  useEffect(() => {
    if (id !== "new") return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("leads")
        .insert({ company_name: "Untitled lead", created_by: user?.id ?? null } as never)
        .select("id")
        .single();
      if (error) {
        toast.error(error.message ?? "Failed to create lead");
        return;
      }
      if (!cancelled && data) {
        void navigate({ to: "/lt/leads/$id", params: { id: (data as { id: string }).id }, replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id, navigate]);

  const leadQuery = useQuery({
    queryKey: ["lead_detail", id],
    enabled: id !== "new",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "*, lead_contacts(*), lead_links(*), lead_followups(*), lead_tags(tag_id), crm_records(id, estimated_value)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["lead_events", id],
    enabled: id !== "new",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_events")
        .select("id, event_type, occurred_at, meta, profiles(full_name, email)")
        .eq("lead_id", id)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Neighbour navigation: ordered by date_added desc.
  const neighboursQuery = useQuery({
    queryKey: ["lead_neighbours"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id")
        .order("date_added", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => r.id);
    },
  });

  const { saved, setSaved, flashSaved } = useSaveIndicator();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["lead_detail", id] });
  const invalidateEvents = () => qc.invalidateQueries({ queryKey: ["lead_events", id] });

  const updateLead = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      setSaved("saving");
      const { error } = await supabase.from("leads").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      flashSaved();
      invalidate();
    },
    onError: (e: any) => {
      setSaved(null);
      toast.error(e.message ?? "Save failed");
    },
  });

  // Ensure two contacts exist by default.
  useEffect(() => {
    const lead = leadQuery.data;
    if (!lead) return;
    const contacts = (lead.lead_contacts ?? []) as LeadContact[];
    if (contacts.length === 0 && canEdit) {
      void supabase
        .from("lead_contacts")
        .insert([
          { lead_id: id, order_index: 0, is_primary: true } as never,
          { lead_id: id, order_index: 1, is_primary: false } as never,
        ])
        .then(({ error }) => {
          if (!error) invalidate();
        });
    } else if (contacts.length === 1 && canEdit) {
      void supabase
        .from("lead_contacts")
        .insert({ lead_id: id, order_index: 1, is_primary: false } as never)
        .then(({ error }) => {
          if (!error) invalidate();
        });
    }
  }, [leadQuery.data?.id, leadQuery.data?.lead_contacts?.length, canEdit]);

  // Ensure follow-up rows 1..7 exist.
  useEffect(() => {
    const lead = leadQuery.data;
    if (!lead || !canEdit) return;
    const followups = (lead.lead_followups ?? []) as LeadFollowup[];
    const existingSeq = new Set(followups.map((f) => f.sequence_number));
    const missing: { lead_id: string; sequence_number: number }[] = [];
    for (let n = 1; n <= 7; n++) {
      if (!existingSeq.has(n)) missing.push({ lead_id: id, sequence_number: n });
    }
    if (missing.length > 0) {
      void supabase
        .from("lead_followups")
        .insert(missing as never)
        .then(({ error }) => {
          if (!error) invalidate();
        });
    }
  }, [leadQuery.data?.id, leadQuery.data?.lead_followups?.length, canEdit]);

  // Keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const ids = neighboursQuery.data ?? [];
      const idx = ids.indexOf(id);
      if (e.key.toLowerCase() === "j") {
        if (idx >= 0 && idx < ids.length - 1) void navigate({ to: "/lt/leads/$id", params: { id: ids[idx + 1] } });
      } else if (e.key.toLowerCase() === "k") {
        if (idx > 0) void navigate({ to: "/lt/leads/$id", params: { id: ids[idx - 1] } });
      } else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        companyNameRef.current?.focus();
      } else if (e.key.toLowerCase() === "a") {
        if (leadQuery.data) toggleArchive();
      } else if (e.key.toLowerCase() === "p") {
        if (leadQuery.data) pushToCrm.mutate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neighboursQuery.data, id, leadQuery.data]);

  const pushToCrm = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("ensure_crm_record", { _lead_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pushed to CRM");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to push to CRM"),
  });

  const toggleArchive = () => {
    const lead = leadQuery.data;
    if (!lead) return;
    updateLead.mutate({
      archived: !lead.archived,
      archived_at: !lead.archived ? new Date().toISOString() : null,
    });
  };

  if (id === "new" || creating) {
    return (
      <AppPage module="lead" title="New lead" perm="lead.leads">
        <Loading label="Creating lead" />
      </AppPage>
    );
  }

  if (leadQuery.isLoading) {
    return (
      <AppPage module="lead" title="Lead" perm="lead.leads">
        <Loading />
      </AppPage>
    );
  }

  const lead = leadQuery.data;

  if (!lead) {
    return (
      <AppPage module="lead" title="Lead" perm="lead.leads">
        <EmptyState
          title="Lead not found"
          hint="This lead may have been deleted or the link is incorrect."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/lt/leads">Back to leads</Link>
            </Button>
          }
        />
      </AppPage>
    );
  }

  const contacts = ((lead.lead_contacts ?? []) as LeadContact[]).sort((a, b) => a.order_index - b.order_index);
  const links = ((lead.lead_links ?? []) as LeadLink[]).sort((a, b) => a.order_index - b.order_index);
  const followups = (lead.lead_followups ?? []) as LeadFollowup[];
  const leadTagIds = new Set(((lead.lead_tags ?? []) as { tag_id: string }[]).map((t) => t.tag_id));
  const crmRecord = lead.crm_records as { id: string; estimated_value: number | null } | null;

  return (
    <AppPage
      module="lead"
      title={lead.company_name}
      perm="lead.leads"
      actions={<SavedIndicator saved={saved} />}
    >
      <HeaderCard
        lead={lead}
        stages={stages ?? []}
        canEdit={canEdit}
        onSave={(p) => updateLead.mutate(p)}
        onPush={() => pushToCrm.mutate()}
        pushing={pushToCrm.isPending}
        crmRecord={crmRecord}
        onToggleArchive={toggleArchive}
        companyNameRef={companyNameRef}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[65%_35%]">
        <div className="flex flex-col gap-4">
          <CompanyCard
            lead={lead}
            countries={countries ?? []}
            channels={channels ?? []}
            senderAccounts={senderAccounts ?? []}
            links={links}
            canEdit={canEdit}
            onSave={(p) => updateLead.mutate(p)}
            invalidate={invalidate}
            leadId={id}
          />
          <PeopleCard
            contacts={contacts}
            canEdit={canEdit}
            onChange={(contactId, patch) => {
              void supabase
                .from("lead_contacts")
                .update(patch as never)
                .eq("id", contactId)
                .then(({ error }) => {
                  if (error) toast.error(error.message);
                  else invalidate();
                });
            }}
            onAdd={() => {
              void supabase
                .from("lead_contacts")
                .insert({ lead_id: id, order_index: contacts.length, is_primary: contacts.length === 0 } as never)
                .then(({ error }) => {
                  if (error) toast.error(error.message);
                  else invalidate();
                });
            }}
            onRemove={(contactId) => {
              void supabase
                .from("lead_contacts")
                .delete()
                .eq("id", contactId)
                .then(({ error }) => {
                  if (error) toast.error(error.message);
                  else invalidate();
                });
            }}
          />
          <NotesCard lead={lead} canEdit={canEdit} onSave={(p) => updateLead.mutate(p)} />
          <EmailCard lead={lead} canEdit={canEdit} onSave={(p) => updateLead.mutate(p)} />
          <LoomCard lead={lead} canEdit={canEdit} onSave={(p) => updateLead.mutate(p)} />
          <FollowupsCard
            followups={followups}
            channels={channels ?? []}
            canEdit={canEdit}
            onChange={(fid, patch) => {
              void supabase
                .from("lead_followups")
                .update(patch as never)
                .eq("id", fid)
                .then(({ error }) => {
                  if (error) toast.error(error.message);
                  else invalidate();
                });
            }}
            onAdd={() => {
              const nextSeq = followups.length > 0 ? Math.max(...followups.map((f) => f.sequence_number)) + 1 : 1;
              void supabase
                .from("lead_followups")
                .insert({ lead_id: id, sequence_number: nextSeq } as never)
                .then(({ error }) => {
                  if (error) toast.error(error.message);
                  else invalidate();
                });
            }}
          />
          <OtherChannelsCard lead={lead} canEdit={canEdit} onSave={(p) => updateLead.mutate(p)} />
          <OutcomeCard
            lead={lead}
            canEdit={canEdit}
            onSave={(p) => updateLead.mutate(p)}
            leadId={id}
            crmRecord={crmRecord}
          />
          <TagsCard tags={tags ?? []} leadTagIds={leadTagIds} canEdit={canEdit} leadId={id} invalidate={invalidate} />
        </div>
        <div className="flex flex-col gap-4">
          <ActivityFeed events={eventsQuery.data ?? []} />
        </div>
      </div>
    </AppPage>
  );
}

function SavedIndicator({ saved }: { saved: null | "saving" | "saved" }) {
  if (!saved) return null;
  return <span className="text-[12px] text-muted-foreground">{saved === "saving" ? "Saving..." : "Saved"}</span>;
}

function HeaderCard({
  lead,
  stages,
  canEdit,
  onSave,
  onPush,
  pushing,
  crmRecord,
  onToggleArchive,
  companyNameRef,
}: {
  lead: any;
  stages: any[];
  canEdit: boolean;
  onSave: (p: Record<string, unknown>) => void;
  onPush: () => void;
  pushing: boolean;
  crmRecord: { id: string; estimated_value: number | null } | null;
  onToggleArchive: () => void;
  companyNameRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [name, setName] = useState(lead.company_name ?? "");
  useEffect(() => setName(lead.company_name ?? ""), [lead.id]);

  const lastActivity =
    [
      lead.email_replied_at,
      lead.email_viewed_at,
      lead.email_sent_at,
      lead.loom_watched_at,
      lead.loom_sent_at,
      lead.linkedin_replied_at,
      lead.instagram_replied_at,
      lead.meeting_booked_at,
      lead.client_closed_at,
      lead.updated_at,
    ]
      .filter(Boolean)
      .sort()
      .pop() ?? lead.updated_at;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={companyNameRef}
              className="h-8 max-w-[320px] text-[15px] font-medium"
              value={name}
              disabled={!canEdit}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== lead.company_name && onSave({ company_name: name.trim() })}
            />
            <span className="text-[12px] text-muted-foreground">{lead.lead_code}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={lead.stage_id ?? undefined} disabled={!canEdit} onValueChange={(v) => onSave({ stage_id: v })}>
              <SelectTrigger className="h-8 w-[150px] text-[13px]">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={lead.status} disabled={!canEdit} onValueChange={(v) => onSave({ status: v })}>
              <SelectTrigger className="h-8 w-[150px] text-[13px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={lead.priority ?? undefined} disabled={!canEdit} onValueChange={(v) => onSave({ priority: v })}>
              <SelectTrigger className="h-8 w-[130px] text-[13px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <StagePill stage={stages.find((s) => s.id === lead.stage_id)} />
            {lead.pushed_to_crm && crmRecord ? (
              <Link to="/crm/records/$id" params={{ id: crmRecord.id }}>
                <Pill tone="positive">
                  In CRM <ExternalLink className="ml-1 inline size-3" />
                </Pill>
              </Link>
            ) : (
              canEdit && (
                <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={onPush} disabled={pushing}>
                  <Upload className="mr-1 size-3.5" /> Push to CRM
                </Button>
              )
            )}
            {canEdit && (
              <Button variant="ghost" size="icon" className="size-7" onClick={onToggleArchive} title={lead.archived ? "Restore" : "Archive"}>
                {lead.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-[12px] text-muted-foreground">
          <div>Created {fmtDate(lead.created_at)}</div>
          <div>Last activity {fmtDate(lastActivity)}</div>
        </div>
      </div>
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-text mb-1">{label}</div>
      {children}
    </div>
  );
}

function CompanyCard({
  lead,
  countries,
  channels,
  senderAccounts,
  links,
  canEdit,
  onSave,
  invalidate,
  leadId,
}: {
  lead: any;
  countries: any[];
  channels: any[];
  senderAccounts: any[];
  links: LeadLink[];
  canEdit: boolean;
  onSave: (p: Record<string, unknown>) => void;
  invalidate: () => void;
  leadId: string;
}) {
  const [website, setWebsite] = useState(lead.website_url ?? "");
  const [companyLinkedin, setCompanyLinkedin] = useState(lead.company_linkedin_url ?? "");
  const [instagram, setInstagram] = useState(lead.instagram_url ?? "");
  const [youtube, setYoutube] = useState(lead.youtube_url ?? "");

  useEffect(() => {
    setWebsite(lead.website_url ?? "");
    setCompanyLinkedin(lead.company_linkedin_url ?? "");
    setInstagram(lead.instagram_url ?? "");
    setYoutube(lead.youtube_url ?? "");
  }, [lead.id]);

  return (
    <CollapsibleCard id="lead.company" title="Company">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LabeledField label="Country">
          <Select value={lead.country_id ?? undefined} disabled={!canEdit} onValueChange={(v) => onSave({ country_id: v })}>
            <SelectTrigger className="h-8 text-[13px]">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              {countries.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabeledField>
        <LabeledField label="Date added">
          <Input
            type="date"
            className="h-8 text-[13px]"
            disabled={!canEdit}
            defaultValue={toDateInput(lead.date_added)}
            onBlur={(e) => {
              if (!e.target.value) return;
              const v = new Date(e.target.value + "T12:00:00").toISOString();
              if (v !== lead.date_added) onSave({ date_added: v });
            }}
          />
        </LabeledField>
        <LabeledField label="Channel">
          <Select value={lead.channel_id ?? undefined} disabled={!canEdit} onValueChange={(v) => onSave({ channel_id: v })}>
            <SelectTrigger className="h-8 text-[13px]">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              {channels.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabeledField>
        <LabeledField label="Sender account">
          <Select value={lead.sender_account_id ?? undefined} disabled={!canEdit} onValueChange={(v) => onSave({ sender_account_id: v })}>
            <SelectTrigger className="h-8 text-[13px]">
              <SelectValue placeholder="Sender account" />
            </SelectTrigger>
            <SelectContent>
              {senderAccounts.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabeledField>
        <LabeledField label="Website">
          <Input
            className="h-8 text-[13px]"
            value={website}
            disabled={!canEdit}
            onChange={(e) => setWebsite(e.target.value)}
            onBlur={() => website !== (lead.website_url ?? "") && onSave({ website_url: website || null })}
          />
        </LabeledField>
        <LabeledField label="Company LinkedIn">
          <Input
            className="h-8 text-[13px]"
            value={companyLinkedin}
            disabled={!canEdit}
            onChange={(e) => setCompanyLinkedin(e.target.value)}
            onBlur={() => companyLinkedin !== (lead.company_linkedin_url ?? "") && onSave({ company_linkedin_url: companyLinkedin || null })}
          />
        </LabeledField>
        <LabeledField label="Instagram">
          <Input
            className="h-8 text-[13px]"
            value={instagram}
            disabled={!canEdit}
            onChange={(e) => setInstagram(e.target.value)}
            onBlur={() => instagram !== (lead.instagram_url ?? "") && onSave({ instagram_url: instagram || null })}
          />
        </LabeledField>
        <LabeledField label="YouTube">
          <Input
            className="h-8 text-[13px]"
            value={youtube}
            disabled={!canEdit}
            onChange={(e) => setYoutube(e.target.value)}
            onBlur={() => youtube !== (lead.youtube_url ?? "") && onSave({ youtube_url: youtube || null })}
          />
        </LabeledField>
      </div>

      <div className="mt-4">
        <div className="label-text mb-2">Links</div>
        <div className="flex flex-col gap-2">
          {links.map((l) => (
            <LinkRow key={l.id} link={l} canEdit={canEdit} invalidate={invalidate} />
          ))}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                void supabase
                  .from("lead_links")
                  .insert({ lead_id: leadId, order_index: links.length, label: "", url: "" } as never)
                  .then(({ error }) => {
                    if (error) toast.error(error.message);
                    else invalidate();
                  });
              }}
            >
              <Plus className="mr-1 size-3.5" /> Add link
            </Button>
          )}
        </div>
      </div>
    </CollapsibleCard>
  );
}

function LinkRow({ link, canEdit, invalidate }: { link: LeadLink; canEdit: boolean; invalidate: () => void }) {
  const [label, setLabel] = useState(link.label ?? "");
  const [url, setUrl] = useState(link.url ?? "");
  useEffect(() => {
    setLabel(link.label ?? "");
    setUrl(link.url ?? "");
  }, [link.id]);

  const save = (patch: Record<string, unknown>) => {
    void supabase
      .from("lead_links")
      .update(patch as never)
      .eq("id", link.id)
      .then(({ error }) => {
        if (error) toast.error(error.message);
        else invalidate();
      });
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Label"
        className="h-8 w-[160px] text-[13px]"
        value={label}
        disabled={!canEdit}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label !== (link.label ?? "") && save({ label: label || null })}
      />
      <Input
        placeholder="URL"
        className="h-8 flex-1 text-[13px]"
        value={url}
        disabled={!canEdit}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => url !== (link.url ?? "") && save({ url: url || null })}
      />
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => {
            void supabase
              .from("lead_links")
              .delete()
              .eq("id", link.id)
              .then(({ error }) => {
                if (error) toast.error(error.message);
                else invalidate();
              });
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function NotesCard({ lead, canEdit, onSave }: { lead: any; canEdit: boolean; onSave: (p: Record<string, unknown>) => void }) {
  const [research, setResearch] = useState(lead.research_notes ?? "");
  const [additional, setAdditional] = useState(lead.additional_notes ?? "");
  useEffect(() => {
    setResearch(lead.research_notes ?? "");
    setAdditional(lead.additional_notes ?? "");
  }, [lead.id]);

  return (
    <CollapsibleCard id="lead.notes" title="Research and notes">
      <div className="flex flex-col gap-4">
        <div>
          <div className="label-text mb-1">Research notes</div>
          <Textarea
            className="min-h-[100px] text-[13px]"
            value={research}
            disabled={!canEdit}
            onChange={(e) => setResearch(e.target.value)}
            onBlur={() => research !== (lead.research_notes ?? "") && onSave({ research_notes: research || null })}
          />
        </div>
        <div>
          <div className="label-text mb-1">Additional notes</div>
          <Textarea
            className="min-h-[100px] text-[13px]"
            value={additional}
            disabled={!canEdit}
            onChange={(e) => setAdditional(e.target.value)}
            onBlur={() => additional !== (lead.additional_notes ?? "") && onSave({ additional_notes: additional || null })}
          />
        </div>
      </div>
    </CollapsibleCard>
  );
}

function EmailCard({ lead, canEdit, onSave }: { lead: any; canEdit: boolean; onSave: (p: Record<string, unknown>) => void }) {
  const summaryParts: string[] = [];
  if (lead.email_sent) summaryParts.push(`Sent ${fmtDate(lead.email_sent_at)}`);
  if (lead.email_viewed) summaryParts.push(`Viewed ${fmtDate(lead.email_viewed_at)}`);
  if (lead.email_replied) summaryParts.push(`Replied ${fmtDate(lead.email_replied_at)}`);

  return (
    <CollapsibleCard id="lead.email" title="Email">
      <div className="flex flex-col gap-1">
        <CheckDate
          label="Email sent"
          checked={lead.email_sent}
          date={lead.email_sent_at}
          disabled={!canEdit}
          onChange={(checked, date) => onSave({ email_sent: checked, email_sent_at: date })}
        />
        <CheckDate
          label="Email viewed"
          checked={lead.email_viewed}
          date={lead.email_viewed_at}
          disabled={!canEdit}
          onChange={(checked, date) => onSave({ email_viewed: checked, email_viewed_at: date })}
        />
        <CheckDate
          label="Email replied"
          checked={lead.email_replied}
          date={lead.email_replied_at}
          disabled={!canEdit}
          onChange={(checked, date) => onSave({ email_replied: checked, email_replied_at: date })}
        />
        <div className={lead.email_replied && !lead.reply_sentiment ? "rounded-md border border-warning p-2" : ""}>
          <div className="label-text mb-1">
            Reply sentiment {lead.email_replied && <span className="text-warning">(required)</span>}
          </div>
          <Select
            value={lead.reply_sentiment ?? undefined}
            disabled={!canEdit}
            onValueChange={(v) => onSave({ reply_sentiment: v })}
          >
            <SelectTrigger className="h-8 w-[180px] text-[13px]">
              <SelectValue placeholder="Sentiment" />
            </SelectTrigger>
            <SelectContent>
              {SENTIMENT_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {summaryParts.length > 0 && <div className="mt-1 text-[12px] text-muted-foreground">{summaryParts.join(" · ")}</div>}
        <div className="label-text mt-1">{MANUAL_HELPER}</div>
      </div>
    </CollapsibleCard>
  );
}

function LoomCard({ lead, canEdit, onSave }: { lead: any; canEdit: boolean; onSave: (p: Record<string, unknown>) => void }) {
  const [url, setUrl] = useState(lead.loom_url ?? "");
  const [pct, setPct] = useState(String(lead.loom_watch_percent ?? ""));
  useEffect(() => {
    setUrl(lead.loom_url ?? "");
    setPct(String(lead.loom_watch_percent ?? ""));
  }, [lead.id]);

  return (
    <CollapsibleCard id="lead.loom" title="Loom">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Loom URL"
            className="h-8 flex-1 text-[13px]"
            value={url}
            disabled={!canEdit}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => url !== (lead.loom_url ?? "") && onSave({ loom_url: url || null })}
          />
          {lead.loom_url && (
            <Button asChild variant="outline" size="sm" className="h-8">
              <a href={lead.loom_url} target="_blank" rel="noreferrer">
                Open
              </a>
            </Button>
          )}
        </div>
        <CheckDate
          label="Loom sent"
          checked={lead.loom_sent}
          date={lead.loom_sent_at}
          disabled={!canEdit}
          onChange={(checked, date) => onSave({ loom_sent: checked, loom_sent_at: date })}
        />
        <CheckDate
          label="Loom watched"
          checked={lead.loom_watched}
          date={lead.loom_watched_at}
          disabled={!canEdit}
          onChange={(checked, date) => onSave({ loom_watched: checked, loom_watched_at: date })}
        />
        <div className="w-[160px]">
          <div className="label-text mb-1">Watch %</div>
          <Input
            type="number"
            min={0}
            max={100}
            className="h-8 text-[13px]"
            value={pct}
            disabled={!canEdit}
            onChange={(e) => setPct(e.target.value)}
            onBlur={() => {
              const n = pct === "" ? null : Math.max(0, Math.min(100, Number(pct)));
              if (n !== lead.loom_watch_percent) onSave({ loom_watch_percent: n });
            }}
          />
        </div>
      </div>
    </CollapsibleCard>
  );
}

function OtherChannelsCard({ lead, canEdit, onSave }: { lead: any; canEdit: boolean; onSave: (p: Record<string, unknown>) => void }) {
  return (
    <CollapsibleCard id="lead.other_channels" title="Other channels">
      <div className="flex flex-col gap-1">
        <CheckDate
          label="LinkedIn sent"
          checked={lead.linkedin_sent}
          date={lead.linkedin_sent_at}
          disabled={!canEdit}
          onChange={(checked, date) => onSave({ linkedin_sent: checked, linkedin_sent_at: date })}
        />
        <CheckDate
          label="LinkedIn replied"
          checked={lead.linkedin_replied}
          date={lead.linkedin_replied_at}
          disabled={!canEdit}
          onChange={(checked, date) => onSave({ linkedin_replied: checked, linkedin_replied_at: date })}
        />
        <CheckDate
          label="Instagram sent"
          checked={lead.instagram_sent}
          date={lead.instagram_sent_at}
          disabled={!canEdit}
          onChange={(checked, date) => onSave({ instagram_sent: checked, instagram_sent_at: date })}
        />
        <CheckDate
          label="Instagram replied"
          checked={lead.instagram_replied}
          date={lead.instagram_replied_at}
          disabled={!canEdit}
          onChange={(checked, date) => onSave({ instagram_replied: checked, instagram_replied_at: date })}
        />
      </div>
    </CollapsibleCard>
  );
}

function OutcomeCard({
  lead,
  canEdit,
  onSave,
  leadId,
  crmRecord,
}: {
  lead: any;
  canEdit: boolean;
  onSave: (p: Record<string, unknown>) => void;
  leadId: string;
  crmRecord: { id: string; estimated_value: number | null } | null;
}) {
  const handleClientClosed = async (checked: boolean, date: string | null) => {
    onSave({ client_closed: checked, client_closed_at: date });
    if (checked) {
      const raw = window.prompt("Set deal value?");
      if (raw !== null && raw.trim() !== "") {
        const value = Number(raw);
        if (!Number.isNaN(value)) {
          const { error: rpcError } = await supabase.rpc("ensure_crm_record", { _lead_id: leadId });
          if (rpcError) {
            toast.error(rpcError.message ?? "Failed to create CRM record");
            return;
          }
          const { data: rec } = await supabase.from("crm_records").select("id").eq("lead_id", leadId).maybeSingle();
          const recId = rec?.id ?? crmRecord?.id;
          if (recId) {
            const { error } = await supabase.from("crm_records").update({ estimated_value: value } as never).eq("id", recId);
            if (error) toast.error(error.message ?? "Failed to set deal value");
            else toast.success("Deal value set");
          }
        }
      }
    }
  };

  return (
    <CollapsibleCard id="lead.outcome" title="Outcome">
      <div className="flex flex-col gap-1">
        <CheckDate
          label="Meeting booked"
          checked={lead.meeting_booked}
          date={lead.meeting_booked_at}
          disabled={!canEdit}
          onChange={(checked, date) => onSave({ meeting_booked: checked, meeting_booked_at: date })}
        />
        <CheckDate
          label="Client closed"
          checked={lead.client_closed}
          date={lead.client_closed_at}
          disabled={!canEdit}
          onChange={handleClientClosed}
        />
      </div>
    </CollapsibleCard>
  );
}

function TagsCard({
  tags,
  leadTagIds,
  canEdit,
  leadId,
  invalidate,
}: {
  tags: any[];
  leadTagIds: Set<string>;
  canEdit: boolean;
  leadId: string;
  invalidate: () => void;
}) {
  const toggle = (tagId: string, active: boolean) => {
    if (active) {
      void supabase
        .from("lead_tags")
        .delete()
        .eq("lead_id", leadId)
        .eq("tag_id", tagId)
        .then(({ error }) => {
          if (error) toast.error(error.message);
          else invalidate();
        });
    } else {
      void supabase
        .from("lead_tags")
        .insert({ lead_id: leadId, tag_id: tagId } as never)
        .then(({ error }) => {
          if (error) toast.error(error.message);
          else invalidate();
        });
    }
  };

  return (
    <CollapsibleCard id="lead.tags" title="Tags">
      {tags.length === 0 ? (
        <EmptyState title="No tags yet" hint="Create tags in Settings to organize leads." />
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const active = leadTagIds.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                disabled={!canEdit}
                onClick={() => toggle(t.id, active)}
                className="disabled:opacity-60"
              >
                <Pill tone={active ? "info" : "neutral"} color={active ? t.color : undefined}>
                  {t.name}
                </Pill>
              </button>
            );
          })}
        </div>
      )}
    </CollapsibleCard>
  );
}
