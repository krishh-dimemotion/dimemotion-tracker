import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppPage } from "@/components/app-shell";
import { Card, EmptyState, Loading } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useChannels } from "@/hooks/useLookups";
import { addDaysISO, fmtDate, todayISO } from "@/lib/format";

export const Route = createFileRoute("/crm/followups")({
  head: () => ({
    meta: [
      { title: "Follow-ups — CRM — Buzzspear Tracker" },
      { name: "description", content: "Overdue, today and upcoming CRM follow-ups." },
      { property: "og:title", content: "Follow-ups — CRM — Buzzspear Tracker" },
      { property: "og:description", content: "Overdue, today and upcoming CRM follow-ups." },
    ],
  }),
  component: FollowupsPage,
});

function FollowupsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: channels } = useChannels();

  const query = useQuery({
    queryKey: ["crm_followups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_records")
        .select("*, leads(company_name)")
        .not("next_followup_date", "is", null)
        .order("next_followup_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = query.data ?? [];
  const today = todayISO();
  const in7 = addDaysISO(7);
  const overdue = rows.filter((r: any) => r.next_followup_date < today);
  const dueToday = rows.filter((r: any) => r.next_followup_date === today);
  const upcoming = rows.filter((r: any) => r.next_followup_date > today && r.next_followup_date <= in7);

  const snoozeMutation = useMutation({
    mutationFn: async ({ id, days, from }: { id: string; days: number; from: string }) => {
      const { error } = await supabase
        .from("crm_records")
        .update({ next_followup_date: addDaysISO(days, from) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_followups"] }),
    onError: (e: any) => toast.error(e.message ?? "Failed to snooze"),
  });

  const logMutation = useMutation({
    mutationFn: async (vars: { recordId: string; channelId: string; direction: string; summary: string }) => {
      const { error } = await supabase.from("crm_contact_log").insert({
        crm_record_id: vars.recordId,
        channel_id: vars.channelId || null,
        direction: vars.direction,
        summary: vars.summary || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact logged");
      qc.invalidateQueries({ queryKey: ["crm_followups"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to log contact"),
  });

  const bucketCard = (title: string, list: any[]) => (
    <Card title={`${title} (${list.length})`} className="flex-1 min-w-[280px]">
      {list.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-muted-foreground">Nothing here</div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {list.map((r: any) => (
            <div key={r.id} className="flex flex-col gap-1.5 py-2">
              <button
                className="text-left text-[13px] font-medium hover:underline"
                onClick={() => navigate({ to: "/crm/records/$id", params: { id: r.id } })}
              >
                {r.leads?.company_name}
              </button>
              <div className="text-[11px] text-muted-foreground">Due {fmtDate(r.next_followup_date)}</div>
              <div className="flex items-center gap-1.5">
                <LogDialog record={r} channels={channels ?? []} onLog={logMutation.mutate} />
                <Select onValueChange={(v) => snoozeMutation.mutate({ id: r.id, days: Number(v), from: today })}>
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
    <AppPage module="crm" title="Follow-ups" perm="crm.followups">
      {query.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="No follow-ups scheduled" hint="Set a next follow-up date on a record to see it here." />
      ) : (
        <div className="flex flex-col gap-3 md:flex-row">
          {bucketCard("Overdue", overdue)}
          {bucketCard("Today", dueToday)}
          {bucketCard("Upcoming 7 days", upcoming)}
        </div>
      )}
    </AppPage>
  );
}

function LogDialog({
  record,
  channels,
  onLog,
}: {
  record: any;
  channels: any[];
  onLog: (vars: { recordId: string; channelId: string; direction: string; summary: string }) => void;
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
              {channels.map((c: any) => (
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
