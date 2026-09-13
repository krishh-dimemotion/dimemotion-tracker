import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { StagePill, stageById } from "./StagePill";
import { Pill } from "@/components/kit";
import { fmtDate } from "@/lib/format";
import type { Lead, Stage, Channel, Country, SenderAccount } from "./types";
import { groupLeads, type GroupByKey } from "./groups";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type SortField =
  | "updated_at"
  | "date_added"
  | "company_name"
  | "primary_contact"
  | "country"
  | "stage"
  | "status"
  | "last_contacted_at"
  | "next_followup_date";

export function LeadTable({
  leads,
  stages,
  countries,
  channels,
  senderAccounts,
  leadTags,
  selected,
  onToggle,
  onToggleAll,
  sortField,
  sortDir,
  onSort,
  groupBy,
}: {
  leads: Lead[];
  stages: Stage[];
  countries: Country[];
  channels: Channel[];
  senderAccounts: SenderAccount[];
  leadTags: Record<string, string[]>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  sortField: SortField;
  sortDir: "asc" | "desc";
  onSort: (f: SortField) => void;
  groupBy: GroupByKey;
}) {
  const countryName = (id: string | null) => countries.find((c) => c.id === id)?.name ?? "—";
  const channelName = (id: string | null) => channels.find((c) => c.id === id)?.name ?? "—";

  const groups = groupLeads(leads, groupBy, { stages, countries, channels, senderAccounts, leadTags });

  const Th = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="sticky top-0 cursor-pointer select-none bg-card px-2 py-2 text-left text-[12px] font-medium text-muted-foreground"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortField === field && (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </span>
    </th>
  );

  return (
    <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <th className="sticky top-0 w-8 bg-card px-2 py-2">
              <Checkbox
                checked={leads.length > 0 && leads.every((l) => selected.has(l.id))}
                onCheckedChange={() => onToggleAll(leads.map((l) => l.id))}
              />
            </th>
            <Th field="company_name">Company</Th>
            <Th field="primary_contact">Contact</Th>
            <Th field="country">Country</Th>
            <Th field="stage">Stage</Th>
            <Th field="status">Status</Th>
            <th className="sticky top-0 bg-card px-2 py-2 text-left text-[12px] font-medium text-muted-foreground">Channel</th>
            <Th field="date_added">Added</Th>
            <Th field="last_contacted_at">Last contacted</Th>
            <Th field="next_followup_date">Follow-up</Th>
            <Th field="updated_at">Activity</Th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.label || "all"} group={g} render={(l) => (
              <tr key={l.id} className="h-9 border-b border-border last:border-0 hover:bg-subtle">
                <td className="px-2">
                  <Checkbox checked={selected.has(l.id)} onCheckedChange={() => onToggle(l.id)} />
                </td>
                <td className="px-2">
                  <Link to="/lt/leads/$id" params={{ id: l.id }} className="font-medium hover:underline">
                    {l.company_name}
                  </Link>
                  <span className="ml-1 text-[11px] text-muted-foreground">{l.lead_code}</span>
                  <a
                    href={`/lt/leads/${l.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-foreground"
                    title="Open in new tab"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="size-3" />
                  </a>
                </td>
                <td className="px-2 text-muted-foreground">{l.primary_contact || "—"}</td>
                <td className="px-2 text-muted-foreground">{countryName(l.country_id)}</td>
                <td className="px-2"><StagePill stage={stageById(stages, l.stage_id)} /></td>
                <td className="px-2"><Pill>{l.status}</Pill></td>
                <td className="px-2 text-muted-foreground">{channelName(l.channel_id)}</td>
                <td className="px-2 text-muted-foreground">{fmtDate(l.date_added)}</td>
                <td className="px-2 text-muted-foreground">{fmtDate(l.last_contacted_at)}</td>
                <td className={cn("px-2", l.next_followup_date && l.next_followup_date < new Date().toISOString().slice(0, 10) ? "text-negative" : "text-muted-foreground")}>
                  {fmtDate(l.next_followup_date) || "—"}
                </td>
                <td className="px-2 text-muted-foreground">{fmtDate(l.updated_at)}</td>
              </tr>
            )} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ group, render }: { group: { label: string; leads: Lead[] }; render: (l: Lead) => React.ReactNode }) {
  const [open, setOpen] = useState(true);
  if (!group.label) return <>{group.leads.map(render)}</>;
  return (
    <>
      <tr className="bg-subtle">
        <td colSpan={11} className="cursor-pointer px-2 py-1.5 text-[12px] font-medium" onClick={() => setOpen((o) => !o)}>
          {open ? "▾" : "▸"} {group.label} ({group.leads.length})
        </td>
      </tr>
      {open && group.leads.map(render)}
    </>
  );
}
