// Ported from live chunk crm.followups-Xn82thxd.js.
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppPage } from "@/components/app-shell";
import { Card, EmptyState, Loading, addDaysISO, fmtDate, todayISO } from "@/components/live/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useChannels } from "@/hooks/useLookups";

export const Route = createFileRoute("/crm/followups")({
  head: () => ({
    meta: [
      { title: "Follow-ups | CRM | Tracker" },
      { name: "description", content: "Overdue, today and upcoming CRM follow-ups." },
      { property: "og:title", content: "Follow-ups | CRM | Tracker" },
      { property: "og:description", content: "Overdue, today and upcoming CRM follow-ups." },
    ],
  }),
  component: FollowupsPage,
});

type FollowupRow = {
  id: string;
  next_followup_date: string;
  leads: { company_name: string } | null;
};

type LogInput = { recordId: string; channelId: string; direction: string; summary: string };

function FollowupsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: channels } = useChannels();
  const query = useQuery({
    queryKey: ["crm_followups"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("crm_records")
        .select("*, leads(company_name)")
        .not("next_followup_date", "is", null)
        .order("next_followup_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FollowupRow[];
    },
  });
  const rows = query.data ?? [];
  const today = todayISO();
  const weekOut = addDaysISO(7);
  const overdue = rows.filter((r) => r.next_followup_date < today);
  const dueToday = rows.filter((r) => r.next_followup_date === today);
  const upcoming = rows.filter((r) => r.next_followup_date > today && r.next_followup_date <= weekOut);

  const snooze = useMutation({
    mutationFn: async ({ id, days, from }: { id: string; days: number; from: string }) => {
      const { error } = await (supabase as any)
        .from("crm_records")
        .update({ next_followup_date: addDaysISO(days, from) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_followups"] }),
    onError: (e: any) => toast.error(e.message ?? "Failed to snooze"),
  });

  const logContact = useMutation({
    mutationFn: async (v: LogInput) => {
      const { error } = await (supabase as any).from("crm_contact_log").insert({
        crm_record_id: v.recordId,
        channel_id: v.channelId || null,
        direction: v.direction,
        summary: v.summary || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact logged");
      qc.invalidateQueries({ queryKey: ["crm_followups"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to log contact"),
  });

  const column = (title: string, list: FollowupRow[]) => (
    <Card title={`${title} (${list.length})`} className="min-w-0">
      {list.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-muted-foreground">Nothing here</div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {list.map((r) => (
            <div key={r.id} className="flex flex-col gap-1.5 py-2">
              <button
                className="text-left text-[13px] font-medium hover:underline"
                onClick={() => navigate({ to: "/crm/records/$id", params: { id: r.id } })}
              >
                {r.leads?.company_name}
              </button>
              <div className="text-[11px] text-muted-foreground">Due {fmtDate(r.next_followup_date)}</div>
              <div className="flex items-center gap-1.5">
                <LogContactDialog record={r} channels={channels ?? []} onLog={logContact.mutate} />
                <Select onValueChange={(v) => snooze.mutate({ id: r.id, days: Number(v), from: today })}>
                  <SelectTrigger className="h-7 w-[110px] text-[11px]">
                    <SelectValue placeholder="Snooze" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Snooze 1 day</SelectItem>
                    <SelectItem value="3">Snooze 3 days</SelectItem>
                    <SelectItem value="7">Snooze 7 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <AppPage guide="crm-followups" module="crm" title="Follow-ups" perm="crm.followups">
      {query.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="No follow-ups scheduled" hint="Set a next follow-up date on a record to see it here." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {column("Overdue", overdue)}
          {column("Today", dueToday)}
          {column("Upcoming 7 days", upcoming)}
        </div>
      )}
    </AppPage>
  );
}

function LogContactDialog({
  record,
  channels,
  onLog,
}: {
  record: FollowupRow;
  channels: { id: string; name: string }[];
  onLog: (v: LogInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [direction, setDirection] = useState("outbound");
  const [summary, setSummary] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-[11px]">
          Log contact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log contact - {record.leads?.company_name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Select value={channelId} onValueChange={setChannelId}>
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
          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger className="h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="outbound">Outbound</SelectItem>
              <SelectItem value="inbound">Inbound</SelectItem>
            </SelectContent>
          </Select>
          <Textarea placeholder="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              onLog({ recordId: record.id, channelId, direction, summary });
              setOpen(false);
              setSummary("");
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
