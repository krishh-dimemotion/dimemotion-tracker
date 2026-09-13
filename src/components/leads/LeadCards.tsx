import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { StagePill, stageById } from "./StagePill";
import { Pill } from "@/components/kit";
import { fmtDate } from "@/lib/format";
import type { Lead, Stage, Channel, Country, SenderAccount } from "./types";
import { groupLeads, type GroupByKey } from "./groups";

export function LeadCards({
  leads,
  stages,
  countries,
  channels,
  senderAccounts,
  leadTags,
  selected,
  onToggle,
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
  groupBy: GroupByKey;
}) {
  const countryName = (id: string | null) => countries.find((c) => c.id === id)?.name ?? "—";
  const groups = groupLeads(leads, groupBy, { stages, countries, channels, senderAccounts, leadTags });

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <GroupBlock key={g.label || "all"} label={g.label}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.leads.map((l) => (
              <div key={l.id} className="rounded-lg border border-border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Checkbox checked={selected.has(l.id)} onCheckedChange={() => onToggle(l.id)} />
                  <StagePill stage={stageById(stages, l.stage_id)} />
                </div>
                <div className="flex items-center gap-1.5">
                  <Link to="/lt/leads/$id" params={{ id: l.id }} className="text-[13px] font-medium hover:underline">
                    {l.company_name}
                  </Link>
                  <a
                    href={`/lt/leads/${l.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    title="Open in new tab"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="size-3" />
                  </a>
                </div>
                <div className="label-text mt-1">{l.primary_contact || "No contact"} · {countryName(l.country_id)}</div>
                <div className="mt-2 flex items-center justify-between text-[12px] text-muted-foreground">
                  <Pill>{l.status}</Pill>
                  <span>{fmtDate(l.next_followup_date) || "No follow-up"}</span>
                </div>
              </div>
            ))}
          </div>
        </GroupBlock>
      ))}
    </div>
  );
}

function GroupBlock({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  if (!label) return <>{children}</>;
  return (
    <div>
      <button className="mb-2 text-[12px] font-medium text-muted-foreground" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} {label}
      </button>
      {open && children}
    </div>
  );
}
